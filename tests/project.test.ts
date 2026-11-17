import { test } from "node:test";
import assert from "node:assert/strict";
import manifest from "../contracts/plugin-manifest.json" with { type: "json" };
import {
  newProject,
  newNode,
  validate,
  validateChange,
  validateIndices,
  clone,
  canonical,
  VIDEO,
  move,
  reorder,
  checks,
  changes,
} from "../src/domain/model.ts";
import { memoryCore } from "./support/memory-core.ts";
import { data, fixed } from "../vendor/project-store.ts";
let serial = 0;
const base = (r: any) => ({
  object_id: r.object.object_id,
  expected_revision: r.object.revision,
  expected_sha256: r.sha256,
  operation_key: "test-" + ++serial,
});
const create = async (
  c: ReturnType<typeof memoryCore>,
  p = newProject("旧站"),
) =>
  data(
    await c.invoke("save_project", {
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "create",
      content: p,
      source_refs: [],
    }),
  );
const write = async (
  c: ReturnType<typeof memoryCore>,
  action: string,
  r: any,
  args: any,
) => data(await c.invoke(action, { ...base(r), ...args }));
const fail = (r: any, code?: string) => {
  assert.equal(r.status, "failed", JSON.stringify(r));
  if (code) assert.equal(r.error.code, code);
};

test("可执行Schema拒绝未知字段与缺字段，作品根唯一", () => {
  const p = newProject("电影");
  validate(p);
  assert.throws(() => validate({ ...p, extra: true }));
  assert.throws(() => validate({ ...p, nodes: [] }));
  p.nodes.push(newNode("root2", "work", null, "其他根"));
  assert.throws(() => validate(p));
});
test("层级可跳过季集；同名场景用稳定ID区分；无环且类型不替换", () => {
  const p = newProject("电影");
  p.nodes.push(
    newNode("a", "scene", "work", "同名"),
    newNode("b", "scene", "work", "同名"),
  );
  validate(p);
  const bad = clone(p);
  bad.nodes[1].parent_id = "b";
  assert.throws(() => validate(bad));
  const deleted = clone(p);
  deleted.nodes.pop();
  assert.throws(() => validateChange(p, deleted));
  const changed = clone(p);
  changed.nodes[1].kind = "sequence";
  assert.throws(() => validateChange(p, changed));
});
test("移动和重排不丢兄弟，归档不删除身份", () => {
  const p = newProject("系列");
  p.nodes.push(
    newNode("e1", "episode", "work", "1"),
    newNode("e2", "episode", "work", "2"),
    newNode("s", "scene", "e1", "场"),
  );
  move(p, "s", "e2", 0);
  reorder(p, "work", ["e2", "e1"]);
  assert.deepEqual(
    p.nodes.filter((n) => n.parent_id === "work").map((n) => n.id),
    ["e2", "e1"],
  );
  assert.throws(() => reorder(p, "work", ["e1"]));
  assert.throws(() => move(p, "work", "e1"));
  const next = clone(p);
  next.nodes[1].archived = true;
  validateChange(p, next);
});
test("来源索引与追加记录有明确Owner，读覆盖不伪装完成", () => {
  const p = newProject("复盘");
  p.coverage = [
    { source_index: 0, status: "partial", range: "前两场", notes: "尚未读完" },
  ];
  assert.throws(() => validateIndices(p, 0));
  assert.ok(checks(p).issues.some((x) => x.code === "incomplete_reading"));
  p.activity = [
    { id: "a", node_id: "work", origin: "agent", kind: "note", text: "推断" },
  ];
  const next = clone(p);
  next.activity[0].text = "改写";
  assert.throws(() => validateChange(p, next));
});
test("未知先回读；成功后丢响应沿原键恢复；同键异参拒绝", async () => {
  const c = memoryCore();
  const p = newProject("旧站");
  c.failAfterWrite = true;
  const input = {
    expected_revision: 0,
    expected_sha256: "",
    operation_key: "create",
    content: p,
    source_refs: [],
  };
  fail(await c.invoke("save_project", input));
  assert.equal(c.writes, 1);
  const saved = data(await c.invoke("save_project", input));
  assert.equal(c.writes, 1);
  assert.equal(saved.object.revision, 1);
  fail(
    await c.invoke("save_project", {
      ...input,
      content: { ...p, title: "不同" },
    }),
    "idempotency_conflict",
  );
  c.unknown = true;
  fail(
    await c.invoke("upsert_node", {
      ...base(saved),
      node: newNode("s", "scene", "work", "场"),
    }),
    "unknown",
  );
  assert.equal(c.writes, 1);
  c.unknown = false;
  assert.equal(
    data(await c.invoke("get_operation", { operation_key: "create" })).sha256,
    saved.sha256,
  );
});
test("CAS冲突、预算、未知动作与错误作品均不产生写入", async () => {
  const c = memoryCore();
  const r = await create(c);
  const next = await write(c, "upsert_node", r, {
    node: newNode("s", "scene", "work", "场"),
  });
  fail(
    await c.invoke("archive_node", {
      ...base(r),
      node_id: "work",
      archived: true,
    }),
    "revision_conflict",
  );
  fail(await c.invoke("no_such_action", {}), "not_found");
  const big = clone(next.object.content);
  big.nodes[0].detail = "汉".repeat(100000);
  for (let i = 0; i < 5; i++) {
    const n = newNode("big" + i, "scene", "work", "长文");
    n.detail = "汉".repeat(100000);
    big.nodes.push(n);
  }
  fail(
    await c.invoke("save_project", {
      ...base(next),
      content: big,
      source_refs: [],
    }),
    "hetu.budget_exceeded",
  );
  assert.equal(c.writes, 2);
});
test("固定历史、窄投影、备选、比较及UTF-8完整分块导出", async () => {
  const c = memoryCore();
  let r = await create(c);
  const before = r;
  const node = newNode("s", "scene", "work", "旧站");
  node.detail = "汉字🧭\n".repeat(3000);
  r = await write(c, "upsert_node", r, { node });
  assert.equal(
    data(
      await c.invoke("get_project", {
        object_id: before.object.object_id,
        revision: 1,
      }),
    ).sha256,
    before.sha256,
  );
  assert.equal(
    data(
      await c.invoke("get_scope", {
        object_id: r.object.object_id,
        node_id: "s",
      }),
    ).node.id,
    "s",
  );
  const fork = data(
    await c.invoke("fork_project", {
      object_id: r.object.object_id,
      revision: 2,
      title: "备选",
      operation_key: "fork",
    }),
  );
  assert.notEqual(fork.object.object_id, r.object.object_id);
  assert.ok(
    data(
      await c.invoke("compare_versions", {
        object_id: r.object.object_id,
        from_revision: 1,
        to_revision: 2,
      }),
    ).changes.length,
  );
  let offset = 0,
    text = "";
  do {
    const part = data(
      await c.invoke("export_project", {
        object_id: r.object.object_id,
        revision: 2,
        format: "json",
        offset,
        max_bytes: 257,
      }),
    );
    text += part.content;
    if (part.next_offset === null) break;
    assert.ok(part.next_offset > offset);
    offset = part.next_offset;
  } while (true);
  assert.equal(JSON.parse(text).content.nodes[1].detail, node.detail);
  assert.ok(
    data(
      await c.invoke("prepare_handoff", {
        object_id: r.object.object_id,
        revision: 2,
        node_id: "s",
        goal: "继续",
      }),
    ).project_ref.sha256 === r.sha256,
  );
});
test("人物关系伏笔跨节点核验，回收须有payoff且已有身份保留", async () => {
  const c = memoryCore();
  let r = await create(c);
  const character = {
    id: "p",
    name: "林溪",
    summary: "守在站台",
    arc: [
      {
        node_id: "work",
        state: "犹豫",
        choice: "留下",
        cost: "错过车",
        knowledge: "信还未送达",
      },
    ],
    archived: false,
  };
  r = await write(c, "set_network", r, {
    characters: [character],
    relations: [],
    clues: [],
  });
  fail(
    await c.invoke("set_network", {
      ...base(r),
      characters: [],
      relations: [],
      clues: [],
    }),
  );
  const p = clone(r.object.content);
  p.clues = [
    {
      id: "letter",
      title: "来信",
      status: "resolved",
      placements: [],
      archived: false,
    },
  ];
  assert.throws(() => validate(p));
  p.clues[0].placements = [{ node_id: "work", stage: "payoff", notes: "" }];
  validate(p);
});
test("映射核验正式分集及固定作者稿；正文接续区分旧来源与当前候选", async () => {
  const c = memoryCore();
  let r = await create(c);
  r = await write(c, "upsert_node", r, {
    node: newNode("ep", "episode", "work", "第一集"),
  });
  const author_ref = {
      document_id: "doc_a",
      revision_id: "rev_a",
      sha256: "a".repeat(64),
    },
    source = { kind: "document", work_ref: c.work, ...author_ref };
  c.episodes.set("episode-a", {
    episode: { episode_id: "episode-a" },
    manuscript: { author_ref, references: [], author_state: "empty" },
  });
  c.sources.set(canonical(source), {
    source_ref: source,
    document: { document_id: "doc_a" },
    content: "固定原文",
  });
  r = await write(c, "map_episode", r, {
    node_id: "ep",
    episode_id: "episode-a",
  });
  assert.deepEqual(r.object.source_refs, [source]);
  assert.equal(
    data(
      await c.invoke("read_manuscript", {
        object_id: r.object.object_id,
        node_id: "ep",
      }),
    ).fixed_sources[0].content,
    "固定原文",
  );
  fail(
    await c.invoke("map_episode", {
      ...base(r),
      node_id: "ep",
      episode_id: "foreign",
    }),
    "not_found",
  );
});

test("既有来源只能追加，错误来源或固定摘要不写入", async () => {
  const c = memoryCore(),
    p = newProject("来源");
  const source = {
    kind: "work",
    work_ref: c.work,
    revision_ref: { revision: 1 },
    sha256: "a".repeat(64),
  };
  c.sources.set(canonical(source), {
    source_ref: source,
    record: { title: "来源" },
  });
  const r = data(
    await c.invoke("save_project", {
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "sources",
      content: p,
      source_refs: [source],
    }),
  );
  fail(
    await c.invoke("save_project", { ...base(r), content: p, source_refs: [] }),
    "hetu.stale_evidence",
  );
  fail(
    await c.invoke("save_project", {
      ...base(r),
      content: p,
      source_refs: [{ ...source, sha256: "b".repeat(64) }],
    }),
    "not_found",
  );
  assert.equal(c.writes, 1);
});
test("范围错误、伪造归属与未知恢复失败不允许跨作品操作", async () => {
  const c = memoryCore();
  const r = await create(c);
  const oldKind = c.work.kind;
  (c.work as any).kind = VIDEO ? "drama" : "video";
  fail(
    await c.invoke("get_project", { object_id: r.object.object_id }),
    "forbidden",
  );
  (c.work as any).kind = oldKind;
  c.records.get(r.object.object_id)![0].object.owner_plugin_id = "foreign";
  fail(
    await c.invoke("get_project", { object_id: r.object.object_id }),
    "forbidden",
  );
  assert.equal(c.writes, 1);
});
test("未知导出偏移和外来参数失败；固定内容无静默截断", async () => {
  const c = memoryCore();
  const r = await create(c);
  fail(
    await c.invoke("export_project", {
      object_id: r.object.object_id,
      revision: 1,
      format: "markdown",
      offset: 999999,
    }),
  );
  fail(
    await c.invoke("get_project", {
      object_id: r.object.object_id,
      sha256: r.sha256,
    }),
  );
  const empty = await c.invoke("get_scope", {
    object_id: r.object.object_id,
    node_id: "missing",
  });
  fail(empty, "not_found");
});
