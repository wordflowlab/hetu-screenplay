import { Ajv } from "ajv";
import manifest from "../../contracts/plugin-manifest.json" with { type: "json" };
import {
  canonical,
  clone,
  requireValue as need,
} from "../../vendor/project-store.ts";
export { canonical, clone };
export const PLUGIN_ID = manifest.id;
export const KIND = manifest.contributions.data[0].kind;
export const WORK_KIND = "drama" as const;
export const VIDEO = false;
export type Node = {
  id: string;
  kind: string;
  parent_id: string | null;
  title: string;
  summary: string;
  detail: string;
  goal: string;
  conflict: string;
  turn: string;
  start_state: string;
  end_state: string;
  archived: boolean;
  formal_episode_id: string | null;
  source_indices: number[];
  [key: string]: any;
};
export type Project = {
  format_version: 1;
  title: string;
  form: string;
  constraints: string;
  nodes: Node[];
  coverage: any[];
  activity: any[];
  [key: string]: any;
};
let ajv: Ajv | undefined;
const validators = new Map<string, ReturnType<Ajv["compile"]>>();
function validatorFor(id: string) {
  if (!ajv) ajv = new Ajv({ allErrors: true, strict: false });
  if (!validators.has(id)) {
    const schema =
      id === "project"
        ? manifest.contributions.data[0].schema
        : manifest.contributions.actions.find((a) => a.id === id)?.input_schema;
    need(schema, "未发现此专业动作。", "not_found");
    validators.set(id, ajv.compile(schema));
  }
  return validators.get(id)!;
}
export function validateAction(action: string, input: unknown) {
  const validator = validatorFor(action);
  need(validator(input), "动作参数无效：" + ajv!.errorsText(validator.errors));
}
export function newNode(
  id: string,
  kind: string,
  parent_id: string | null,
  title: string,
): Node {
  return {
    id,
    kind,
    parent_id,
    title,
    summary: "",
    detail: "",
    goal: "",
    conflict: "",
    turn: "",
    start_state: "",
    end_state: "",
    archived: false,
    formal_episode_id: null,
    source_indices: [],
    ...(false
      ? {
          camera: "",
          action: "",
          sound: "",
          estimated_duration_ms: 0,
          asset_ids: [],
        }
      : {}),
  };
}
export function newProject(title: string): Project {
  return {
    format_version: 1,
    title,
    form: "short",
    constraints: "",
    nodes: [newNode("work", "work", null, title)],
    coverage: [],
    activity: [],
    ...(false
      ? {
          assets: [],
          takes: [],
          edits: [],
          feedback: [],
          reworks: [],
          delivery: [],
        }
      : { characters: [], relations: [], clues: [] }),
  };
}
export function nodeOf(p: Project, id: string): Node {
  const n = p.nodes.find((x) => x.id === id);
  need(n, "节点不存在。", "not_found");
  return n;
}
export function pathTo(p: Project, id: string): Node[] {
  const n = nodeOf(p, id);
  return n.parent_id ? [...pathTo(p, n.parent_id), n] : [n];
}
export function descendants(p: Project, id: string): Node[] {
  return p.nodes.filter((n) => pathTo(p, n.id).some((x) => x.id === id));
}
export function active(p: Project, id: string) {
  return !pathTo(p, id).some((n) => n.archived);
}
function unique(items: any[], label: string) {
  const ids = items.map((x) => x.id);
  need(new Set(ids).size === ids.length, label + "ID重复。");
}
export function keep(old: any[], next: any[], label: string) {
  for (const item of old)
    need(
      next.some((n) => n.id === item.id),
      label + "已有身份必须保留，可归档。",
    );
}
export function validate(p: Project) {
  need(
    p && typeof p.title === "string" && p.title.trim(),
    "方案标题不能为空白。",
  );
  const schema = validatorFor("project");
  need(schema(p), "方案字段无效：" + ajv!.errorsText(schema.errors));
  unique(p.nodes, "节点");
  unique(p.activity, "工作记录");
  const roots = p.nodes.filter((n) => n.parent_id === null);
  need(
    roots.length === 1 && roots[0].kind === "work",
    "需要且只能有一个作品根节点。",
  );
  const ranks = VIDEO
    ? ["work", "episode", "sequence", "scene", "shot"]
    : ["work", "season", "episode", "sequence", "scene"];
  for (const n of p.nodes) {
    need(n.title.trim(), "节点标题不能为空白。");
    if (n.parent_id !== null) {
      const parent = nodeOf(p, n.parent_id);
      need(
        ranks.indexOf(parent.kind) < ranks.indexOf(n.kind),
        "父子层级无效或存在循环。",
      );
    } else need(n.kind === "work", "只有作品节点可作为根。");
    need(
      new Set(n.source_indices).size === n.source_indices.length,
      "节点来源重复。",
    );
    if (n.formal_episode_id)
      need(n.kind === "episode", "仅分集节点可映射正式分集。");
  }
  need(
    new Set(
      p.nodes
        .filter((n) => n.formal_episode_id)
        .map((n) => n.formal_episode_id),
    ).size === p.nodes.filter((n) => n.formal_episode_id).length,
    "正式分集不能重复映射。",
  );
  for (const x of p.activity) if (x.node_id) nodeOf(p, x.node_id);
  unique(p.characters, "人物");
  unique(p.relations, "关系");
  unique(p.clues, "伏笔");
  for (const c of p.characters) for (const arc of c.arc) nodeOf(p, arc.node_id);
  const people = new Set(p.characters.map((c: any) => c.id));
  for (const r of p.relations) {
    need(people.has(r.from_id) && people.has(r.to_id), "关系端点不存在。");
    for (const id of r.node_ids) nodeOf(p, id);
  }
  for (const c of p.clues) {
    for (const placement of c.placements) nodeOf(p, placement.node_id);
    if (c.status === "resolved")
      need(
        c.placements.some((x: any) => x.stage === "payoff"),
        "已回收伏笔须有回收节点。",
      );
  }
}
export function validateChange(old: Project, next: Project) {
  keep(old.nodes, next.nodes, "节点");
  for (const n of old.nodes) {
    const v = nodeOf(next, n.id);
    need(v.kind === n.kind, "节点类型不可替换。");
    if (n.parent_id === null) need(v.parent_id === null, "作品根不可移动。");
  }
  keep(old.activity, next.activity, "工作记录");
  for (const note of old.activity)
    need(
      canonical(note) ===
        canonical(next.activity.find((x) => x.id === note.id)),
      "已有工作记录不可改写，请追加更正。",
    );
  for (const key of ["characters", "relations", "clues"])
    keep(old[key], next[key], key);
}
export function validateIndices(p: Project, count: number) {
  const indices = [
    ...p.nodes.flatMap((n) => n.source_indices),
    ...p.coverage.map((x) => x.source_index),
  ];
  if (VIDEO) {
    indices.push(
      ...p.assets.map((x: any) => x.source_index),
      ...p.delivery.map((x: any) => x.source_index),
      ...p.feedback.map((x: any) => x.render_source_index),
    );
    for (const x of p.takes)
      if (x.media_source_index !== null) indices.push(x.media_source_index);
    for (const x of p.edits)
      if (x.render_source_index !== null) indices.push(x.render_source_index);
  }
  for (const i of indices)
    need(
      Number.isInteger(i) && i >= 0 && i < count,
      "来源索引没有对应的固定来源。",
    );
}
export function move(
  p: Project,
  id: string,
  parent_id: string | null,
  position?: number,
) {
  const n = nodeOf(p, id);
  need(n.parent_id !== null && parent_id !== null, "作品根不可移动。");
  nodeOf(p, parent_id);
  n.parent_id = parent_id;
  place(p, n, position);
  validate(p);
}
export function place(p: Project, node: Node, position?: number) {
  p.nodes = p.nodes.filter((n) => n.id !== node.id);
  const siblings = p.nodes.filter((n) => n.parent_id === node.parent_id);
  const pos = position ?? siblings.length;
  need(pos <= siblings.length, "位置超出兄弟节点范围。");
  const anchor = siblings[pos];
  const index = anchor ? p.nodes.indexOf(anchor) : p.nodes.length;
  p.nodes.splice(index, 0, node);
}
export function reorder(p: Project, parent_id: string | null, ids: string[]) {
  if (parent_id !== null) nodeOf(p, parent_id);
  const indices = p.nodes.flatMap((n, i) =>
    n.parent_id === parent_id ? [i] : [],
  );
  need(
    ids.length === indices.length &&
      new Set(ids).size === ids.length &&
      ids.every((id) => nodeOf(p, id).parent_id === parent_id),
    "必须提供全部且不重复的兄弟节点。",
  );
  const ordered = ids.map((id) => nodeOf(p, id));
  indices.forEach((i, j) => {
    p.nodes[i] = ordered[j];
  });
}
export function changes(a: any, b: any, path = ""): any[] {
  if (canonical(a) === canonical(b)) return [];
  if (
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  )
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) =>
      changes(
        a[k],
        b[k],
        path + "/" + k.replaceAll("~", "~0").replaceAll("/", "~1"),
      ),
    );
  if (
    Array.isArray(a) &&
    Array.isArray(b) &&
    a.every((x) => x && typeof x === "object" && x.id) &&
    b.every((x) => x && typeof x === "object" && x.id)
  )
    return [...new Set([...a.map((x) => x.id), ...b.map((x) => x.id)])].flatMap(
      (id) =>
        changes(
          a.find((x) => x.id === id),
          b.find((x) => x.id === id),
          path + "/" + id,
        ),
    );
  return [{ path, before: a ?? null, after: b ?? null }];
}
export function checks(p: Project) {
  const issues: any[] = [];
  const add = (code: string, node_id: string | null, message: string) =>
    issues.push({ code, node_id, message });
  for (const n of p.nodes.filter((n) => active(p, n.id))) {
    if (!n.summary && !n.detail) add("missing_story", n.id, "尚无可阅读内容。");
    if (!n.goal) add("missing_goal", n.id, "尚未说明目标。");
    if (n.kind !== "work" && !n.turn)
      add("missing_turn", n.id, "尚未说明转折。");
  }
  for (const c of p.coverage)
    if (c.status !== "read")
      add("incomplete_reading", null, "原有内容仍有未读范围：" + c.range);
  for (const c of p.clues)
    if (c.status === "open" && !c.archived)
      add("open_clue", null, "伏笔仍未回收：" + c.title);
  for (const n of p.nodes.filter(
    (n) => n.kind === "episode" && active(p, n.id),
  ))
    if (!n.formal_episode_id)
      add("unmapped_episode", n.id, "尚未接入宿主正式分集。");
  return {
    issues,
    healthy: issues.length === 0,
    scope: "结构与Agent自查，不代表作者认可。",
  };
}
export function markdown(p: Project) {
  const lines = ["# " + p.title, "", p.constraints, ""];
  for (const n of p.nodes) {
    lines.push(
      "## " +
        pathTo(p, n.id)
          .map((x) => x.title)
          .join(" / ") +
        (active(p, n.id) ? "" : "（已归档）"),
      "",
    );
    for (const [key, label] of [
      ["summary", "概要"],
      ["goal", "目标"],
      ["conflict", "冲突"],
      ["turn", "转折"],
      ["start_state", "起始状态"],
      ["end_state", "结束状态"],
      ["camera", "摄影"],
      ["action", "行动"],
      ["sound", "声音"],
    ] as const)
      if (n[key]) lines.push("**" + label + "** " + n[key], "");
    if (n.detail) lines.push(n.detail, "");
  }
  for (const key of [
    "characters",
    "relations",
    "clues",
    "coverage",
    "activity",
  ])
    if (p[key]?.length)
      lines.push(
        "## " +
          (
            {
              characters: "人物弧线",
              relations: "关系",
              clues: "伏笔",
              assets: "素材职责",
              takes: "制作记录",
              edits: "剪辑",
              feedback: "审片意见",
              reworks: "返工",
              delivery: "交付",
              coverage: "阅读覆盖",
              activity: "工作记录",
            } as Record<string, string>
          )[key],
        "",
        "```json",
        JSON.stringify(p[key], null, 2),
        "```",
        "",
      );
  return lines.join("\n");
}
