import { createHash } from "node:crypto";
import type {
  BackendContext,
  PluginSourceRef,
  ObjectResult,
} from "../../vendor/hetu-sdk.ts";
import {
  ProjectStore,
  ProjectError,
  requireValue as need,
  data,
  success,
  failure,
  fixed,
} from "../../vendor/project-store.ts";
import {
  PLUGIN_ID,
  KIND,
  WORK_KIND,
  VIDEO,
  validateAction,
  validate,
  validateChange,
  validateIndices,
  clone,
  canonical,
  nodeOf,
  pathTo,
  descendants,
  active,
  place,
  move,
  reorder,
  changes,
  checks,
  markdown,
  type Project,
} from "../domain/model.ts";
const effects = new Set([
  "save_project",
  "upsert_node",
  "move_node",
  "archive_node",
  "reorder_nodes",
  "fork_project",
  "add_note",
  "set_network",
  "map_episode",
]);
export class CreativeProject {
  readonly store: ProjectStore;
  readonly context: BackendContext;
  constructor(context: BackendContext) {
    this.context = context;
    this.store = new ProjectStore(context, PLUGIN_ID, KIND, validate);
  }
  async inspect(p: Project, refs: PluginSourceRef[]) {
    validate(p);
    validateIndices(p, refs.length);
    const sources = await this.store.sources(refs);

    return sources;
  }
  async save(input: any, p: Project, previous?: ObjectResult) {
    if (previous) validateChange(previous.object.content as Project, p);
    await this.inspect(
      p,
      input.source_refs ?? previous?.object.source_refs ?? [],
    );
    // 分集映射由核心核验作品归属；单次专业动作仍只有一次权威保存。
    const mapped = p.nodes.filter(
      (n) =>
        n.formal_episode_id &&
        (previous?.object.content as Project | undefined)?.nodes.find(
          (x) => x.id === n.id,
        )?.formal_episode_id !== n.formal_episode_id,
    );
    need(mapped.length <= 100, "一次最多核验100项分集映射，请分批执行。");
    for (const n of mapped) {
      const old = (previous?.object.content as Project | undefined)?.nodes.find(
        (x) => x.id === n.id,
      );
      if (old?.formal_episode_id === n.formal_episode_id) continue;
      data(
        await this.store.call(
          VIDEO ? "hetu.video.episodes.get" : "hetu.drama.episodes.get",
          VIDEO
            ? { video_episode_id: n.formal_episode_id }
            : { episode_id: n.formal_episode_id },
        ),
      );
    }
    return this.store.save(input, p, previous);
  }
  scope(r: ObjectResult, id: string) {
    const p = r.object.content as Project,
      n = nodeOf(p, id),
      nodes = descendants(p, id),
      ids = new Set(nodes.map((x) => x.id));
    const sourceIndices = new Set(nodes.flatMap((x) => x.source_indices));
    const special = VIDEO
      ? {
          assets: p.assets.filter((x: any) =>
            nodes.some((n) => n.asset_ids.includes(x.id)),
          ),
          takes: p.takes.filter((x: any) =>
            x.node_ids.some((id: string) => ids.has(id)),
          ),
          edits: p.edits.filter((e: any) =>
            e.clips.some((c: any) =>
              p.takes.some(
                (t: any) =>
                  t.id === c.take_id &&
                  t.node_ids.some((id: string) => ids.has(id)),
              ),
            ),
          ),
        }
      : {
          characters: p.characters.filter((c: any) =>
            c.arc.some((x: any) => ids.has(x.node_id)),
          ),
          relations: p.relations.filter((x: any) =>
            x.node_ids.some((id: string) => ids.has(id)),
          ),
          clues: p.clues.filter((x: any) =>
            x.placements.some((y: any) => ids.has(y.node_id)),
          ),
        };
    return {
      project_ref: fixed(r),
      work_ref: this.context.work_ref,
      node: n,
      path: pathTo(p, id),
      effective_archived: !active(p, id),
      nodes,
      ...special,
      source_refs: (r.object.source_refs ?? []).flatMap((s, index) =>
        sourceIndices.has(index) ? [{ index, source_ref: s }] : [],
      ),
      activity: p.activity.filter(
        (x) => x.node_id === null || ids.has(x.node_id),
      ),
    };
  }
  async invoke(action: string, raw: unknown) {
    try {
      validateAction(action, raw);
      need(
        this.context.work_ref.kind === WORK_KIND,
        "当前作品类型与插件不一致。",
        "forbidden",
      );
      const input = clone(raw) as any;
      if (effects.has(action)) {
        const recovered = await this.store.recover(input.operation_key);
        if (recovered) return recovered;
      }
      if (action === "get_operation")
        return this.store.call("hetu.extensions.operations.get", input);
      if (action === "list_projects")
        return this.store.call(
          input.query
            ? "hetu.extensions.objects.search"
            : "hetu.extensions.objects.list",
          { ...input, kind: KIND },
        );
      if (action === "save_project") {
        need(
          input.object_id
            ? input.expected_revision > 0 && input.expected_sha256.length === 64
            : input.expected_revision === 0 && input.expected_sha256 === "",
          "新建或更新的基线无效。",
        );
        const previous = input.object_id
          ? await this.store.baseline(input)
          : undefined;
        return await this.save(input, clone(input.content), previous);
      }
      if (action === "fork_project") {
        const r = await this.store.get(input.object_id, input.revision),
          p = clone(r.object.content) as Project;
        p.title = input.title;
        return await this.save(
          {
            expected_revision: 0,
            expected_sha256: "",
            operation_key: input.operation_key,
            source_refs: r.object.source_refs ?? [],
          },
          p,
        );
      }
      if (action === "compare_versions") {
        const a = await this.store.get(input.object_id, input.from_revision),
          b = await this.store.get(input.object_id, input.to_revision);
        return success({
          from_ref: fixed(a),
          to_ref: fixed(b),
          changes: changes(a.object.content, b.object.content),
          order_changes:
            canonical((a.object.content as Project).nodes.map((x) => x.id)) ===
            canonical((b.object.content as Project).nodes.map((x) => x.id))
              ? []
              : [
                  {
                    before: (a.object.content as Project).nodes.map(
                      (x) => x.id,
                    ),
                    after: (b.object.content as Project).nodes.map((x) => x.id),
                  },
                ],
        });
      }
      if (effects.has(action)) {
        const r = await this.store.baseline(input),
          p = clone(r.object.content) as Project;
        switch (action) {
          case "upsert_node": {
            const old = p.nodes.find((n) => n.id === input.node.id);
            if (old && input.position === undefined)
              p.nodes[p.nodes.indexOf(old)] = input.node;
            else place(p, input.node, input.position);
            break;
          }
          case "move_node":
            move(p, input.node_id, input.parent_id, input.position);
            break;
          case "archive_node":
            nodeOf(p, input.node_id).archived = input.archived;
            break;
          case "reorder_nodes":
            reorder(p, input.parent_id, input.node_ids);
            break;
          case "add_note":
            need(
              !p.activity.some((n) => n.id === input.note.id),
              "工作记录ID已存在。",
            );
            p.activity.push(input.note);
            break;
          case "set_network":
            p.characters = input.characters;
            p.relations = input.relations;
            p.clues = input.clues;
            break;
          case "map_episode": {
            const n = nodeOf(p, input.node_id);
            need(n.kind === "episode", "仅分集节点可关联正式分集。");
            const ep = data(
              await this.store.call("hetu.drama.episodes.get", {
                episode_id: input.episode_id,
              }),
            );
            const ref = ep.manuscript.author_ref;
            need(
              ref?.document_id && ref.revision_id && ref.sha256,
              "正式分集缺少固定作者稿引用。",
            );
            const source: PluginSourceRef = {
              kind: "document",
              work_ref: this.context.work_ref,
              document_id: ref.document_id,
              revision_id: ref.revision_id,
              sha256: ref.sha256,
            };
            const refs = clone(r.object.source_refs ?? []);
            let index = refs.findIndex(
              (x) => canonical(x) === canonical(source),
            );
            if (index < 0) {
              index = refs.length;
              refs.push(source);
            }
            input.source_refs = refs;
            n.formal_episode_id = input.episode_id;
            if (!n.source_indices.includes(index)) n.source_indices.push(index);
            break;
          }
          default:
            throw new ProjectError("未实现的写动作。", "not_found");
        }
        return await this.save(input, p, r);
      }
      const r = await this.store.get(input.object_id, input.revision),
        p = r.object.content as Project;
      switch (action) {
        case "get_project":
          return success(
            input.projection === "summary"
              ? {
                  project_ref: fixed(r),
                  title: p.title,
                  form: p.form,
                  constraints: p.constraints,
                  nodes: p.nodes.map((n) => ({
                    id: n.id,
                    kind: n.kind,
                    parent_id: n.parent_id,
                    title: n.title,
                    summary: n.summary,
                    archived: n.archived,
                  })),
                  counts: Object.fromEntries(
                    Object.entries(p)
                      .filter(([, v]) => Array.isArray(v))
                      .map(([k, v]) => [k, (v as any[]).length]),
                  ),
                }
              : r,
          );
        case "get_scope":
          return success(this.scope(r, input.node_id));
        case "check_project":
          await this.inspect(p, r.object.source_refs ?? []);
          return success({ project_ref: fixed(r), ...checks(p) });
        case "prepare_handoff":
          return success({
            plugin_id: PLUGIN_ID,
            work_ref: this.context.work_ref,
            project_ref: fixed(r),
            node_id: input.node_id,
            goal: input.goal,
            scope: this.scope(r, input.node_id),
            next: "先发现实际核心动作和方法；读取已有成果，再按目标准备参考稿或制作记录。采纳、认可、费用和外部副作用另行决定。",
            recovery: "未知先回读原操作；明确不存在才沿原键原输入继续。",
          });
        case "export_project": {
          const text =
            input.format === "json"
              ? JSON.stringify(
                  {
                    project_ref: fixed(r),
                    work_ref: this.context.work_ref,
                    source_refs: r.object.source_refs ?? [],
                    content: p,
                  },
                  null,
                  2,
                )
              : markdown(p);
          const bytes = new TextEncoder().encode(text),
            offset = input.offset ?? 0;
          need(offset <= bytes.length, "导出偏移超出内容。");
          need(
            offset === bytes.length || (bytes[offset] & 0xc0) !== 0x80,
            "偏移不能位于UTF-8字符中间。",
          );
          let end = Math.min(bytes.length, offset + (input.max_bytes ?? 32000));
          while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
          return success({
            project_ref: fixed(r),
            format: input.format,
            media_type:
              input.format === "json" ? "application/json" : "text/markdown",
            content_sha256: createHash("sha256")
              .update(bytes.slice(offset, end))
              .digest("hex"),
            offset,
            next_offset: end < bytes.length ? end : null,
            total_bytes: bytes.length,
            content: new TextDecoder("utf-8", { fatal: true }).decode(
              bytes.slice(offset, end),
            ),
          });
        }
        case "read_manuscript": {
          const n = nodeOf(p, input.node_id);
          need(n.formal_episode_id, "当前分集尚未关联宿主正文。");
          const fixed_sources = [];
          for (const index of n.source_indices) {
            const source_ref = r.object.source_refs?.[index];
            if (source_ref?.kind === "document")
              fixed_sources.push({
                index,
                ...data(
                  await this.store.call("hetu.extensions.sources.inspect", {
                    source_ref,
                  }),
                ),
              });
          }
          const current = data(
            await this.store.call("hetu.drama.episodes.get", {
              episode_id: n.formal_episode_id,
            }),
          );
          return success({
            project_ref: fixed(r),
            node_id: n.id,
            fixed_sources,
            current,
            notice:
              "fixed_sources为方案固定原稿；current为当前实际正文和候选，不视为旧版内容或自动采纳。",
          });
        }
        default:
          throw new ProjectError("未实现的读动作。", "not_found");
      }
    } catch (error) {
      return failure(error);
    }
  }
}
