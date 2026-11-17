import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PluginBridge, ObjectResult } from "../../vendor/hetu-sdk.ts";
import {
  newProject,
  newNode,
  VIDEO,
  WORK_KIND,
  active,
  pathTo,
  changes,
  type Project,
  type Node,
} from "../domain/model.ts";
import { data, fixed, clone, canonical } from "../../vendor/project-store.ts";
import "./style.css";
declare global {
  interface Window {
    hetu: PluginBridge;
  }
}
const api = window.hetu;
const title = "剧本创作";
const labels: Record<string, string> = {
  work: "全作",
  season: "季",
  episode: "分集",
  sequence: "段落",
  scene: "场次",
  shot: "镜头",
};
const stateName: Record<string, string> = {
  planned: "已规划",
  running: "进行中",
  unknown: "结果未知",
  succeeded: "已有成果",
  failed: "失败",
  cancelled: "已取消",
  open: "待处理",
  addressed: "已回应",
  declined: "不采用",
  complete: "已完成",
  read: "已读",
  partial: "部分已读",
  unread: "未读",
  resolved: "已回收",
  abandoned: "已放弃",
};
const read = (s: string) => (
  <Markdown remarkPlugins={[remarkGfm]}>{s || "尚待展开。"}</Markdown>
);
function App() {
  const [projects, setProjects] = useState<any[]>([]),
    [record, setRecord] = useState<ObjectResult>(),
    [selected, setSelected] = useState("work"),
    [tab, setTab] = useState("structure");
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [nav, setNav] = useState(true),
    [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState<Node>(),
    [pending, setPending] = useState<any>(),
    [conflict, setConflict] = useState<any>(),
    [modal, setModal] = useState<
      "create" | "node" | "fork" | "goal" | "note" | "compare" | null
    >(null),
    [input, setInput] = useState(""),
    [nodeKind, setNodeKind] = useState(VIDEO ? "shot" : "scene"),
    [result, setResult] = useState<any>(),
    [compareFrom, setCompareFrom] = useState(1),
    [compareTo, setCompareTo] = useState(1);
  const live = useRef<any>({}),
    compose = useRef(false);
  live.current = { record, selected, draft, pending };
  const invoke = async (action: string, args: any = {}) =>
    data((await api.invoke(action, args)) as any);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  async function persist() {
    const x = live.current;
    await api.buffer({
      object_id: x.record?.object.object_id,
      baseline: x.record ? fixed(x.record) : null,
      selected: x.selected,
      draft: x.draft ?? null,
      pending: x.pending ?? null,
    });
  }
  async function list() {
    const r = await invoke("list_projects", { limit: 100 });
    setProjects(r.objects);
    return r.objects;
  }
  async function load(id: string) {
    const r = await invoke("get_project", { object_id: id });
    setRecord(r);
    setDraft(undefined);
    setPending(undefined);
    setSelected((r.object.content as Project).nodes[0].id);
    return r;
  }
  function theme(value: any) {
    document.documentElement.dataset.theme = value.theme;
    document.documentElement.style.colorScheme =
      value.theme === "system" ? "light dark" : value.theme;
  }
  useEffect(() => {
    let dispose = () => {};
    void run(async () => {
      theme((await api.host?.("preferences", {})) ?? { theme: "system" });
      dispose = api.onPreferences?.(theme) ?? dispose;
      const buffer = (await api.buffer()) as any;
      const items = await list();
      if (items.length) {
        const id = items.some((x: any) => x.object_id === buffer?.object_id)
          ? buffer.object_id
          : items[0].object_id;
        let r = await load(id);
        if (buffer?.object_id === id) {
          if ((buffer.draft || buffer.pending) && buffer.baseline) {
            r = await invoke("get_project", {
              object_id: id,
              revision: buffer.baseline.revision,
            });
            if (r.sha256 !== buffer.baseline.sha256)
              throw new Error("恢复稿基线摘要不一致，请保留并检查。");
            setRecord(r);
          }
          setSelected(
            (r.object.content as Project).nodes.some(
              (n) => n.id === buffer.selected,
            )
              ? buffer.selected
              : (r.object.content as Project).nodes[0].id,
          );
          setDraft(buffer.draft ?? undefined);
          setPending(buffer.pending ?? undefined);
        }
      }
      if (
        buffer?.pending &&
        (!buffer.object_id ||
          items.some((x: any) => x.object_id === buffer.object_id))
      )
        setPending(buffer.pending);
      setReady(true);
    });
    const remove = api.onBeforeClose?.(persist);
    return () => {
      dispose();
      remove?.();
    };
  }, []);
  useEffect(() => {
    if (ready)
      void persist().catch((e) => setError("恢复稿未能保存：" + e.message));
  }, [record?.object.object_id, selected, draft, pending, ready]);
  useEffect(() => {
    if (!modal && !conflict) return;
    const previous = document.activeElement as HTMLElement | null;
    const selector =
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
    const dialog = document.querySelector("dialog")!;
    const elements = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(
        (x) => x.getClientRects().length,
      );
    queueMicrotask(() => elements()[0]?.focus());
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (conflict) setConflict(undefined);
        else setModal(null);
      }
      if (e.key === "Tab") {
        const list = elements();
        if (!list.length) return;
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1)!.focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modal, !!conflict]);
  const p = record?.object.content as Project | undefined,
    n = p?.nodes.find((n) => n.id === selected) ?? p?.nodes[0];
  const nodes =
    p?.nodes.filter(
      (x) =>
        (archived || active(p, x.id)) &&
        (!query ||
          [x.title, x.summary, x.goal, x.detail].some((v) =>
            v.includes(query),
          )),
    ) ?? [];
  async function accept(r: ObjectResult) {
    setRecord(r);
    setDraft(undefined);
    setPending(undefined);
    setConflict(undefined);
    await list();
    setNotice("已保存，可继续阅读与比较。");
  }
  async function execute(action: string, args: any) {
    setPending({ action, input: args });
    await api.buffer({
      selected,
      draft: draft ?? null,
      pending: { action, input: args },
      object_id: record?.object.object_id,
    });
    try {
      const r = await invoke(action, args);
      await accept(r);
    } catch (e) {
      setError((e as Error).message + "；已保留原输入与操作键。");
    }
  }
  const base = () => ({
    object_id: record!.object.object_id,
    expected_revision: record!.object.revision,
    expected_sha256: record!.sha256,
    operation_key: crypto.randomUUID(),
  });
  const editField = (key: string, value: string) =>
    setDraft({ ...draft!, [key]: value });
  async function submit() {
    if (compose.current || !draft) return;
    await execute("upsert_node", { ...base(), node: draft });
  }
  async function recover() {
    const receipt = (await api.invoke("get_operation", {
      operation_key: pending.input.operation_key,
    })) as any;
    if (receipt.status === "succeeded") {
      await accept(receipt.data);
      setNotice("已回读原操作成果。");
    } else if (receipt.error?.code === "not_found") {
      setNotice("原操作明确不存在，可沿原输入重试，或比较当前版本。");
    } else throw new Error(receipt.error?.message ?? "原操作暂不可查询。");
  }
  async function comparePending() {
    const receipt = (await api.invoke("get_operation", {
      operation_key: pending.input.operation_key,
    })) as any;
    if (receipt.status === "succeeded") {
      await accept(receipt.data);
      return;
    }
    if (receipt.error?.code !== "not_found")
      throw new Error("原操作尚不能确认，先回读。");
    const current = await invoke("get_project", {
      object_id: record!.object.object_id,
    });
    const baseline = await invoke("get_project", {
      object_id: record!.object.object_id,
      revision: pending.input.expected_revision,
    });
    const original = (baseline.object.content as Project).nodes.find(
      (n) => n.id === pending.input.node.id,
    );
    const remote = (current.object.content as Project).nodes.find(
      (n) => n.id === pending.input.node.id,
    );
    if (!original || !remote)
      throw new Error("节点身份已改变，请保留恢复稿交由Agent比较。");
    const local = clone(pending.input.node),
      merged = clone(remote),
      fields: any[] = [];
    for (const key of Object.keys(local)) {
      if (canonical(local[key]) === canonical(original[key])) continue;
      if (
        canonical(remote[key]) !== canonical(original[key]) &&
        canonical(remote[key]) !== canonical(local[key])
      )
        fields.push({
          key,
          local: local[key],
          remote: remote[key],
          choice: "",
        });
      else merged[key] = local[key];
    }
    setConflict({ current, local: merged, fields });
  }
  async function confirmModal() {
    if (compose.current) return;
    if (!input.trim() && modal !== "compare") return;
    if (modal === "create") {
      const content = newProject(input.trim());
      await execute("save_project", {
        content,
        source_refs: [],
        expected_revision: 0,
        expected_sha256: "",
        operation_key: crypto.randomUUID(),
      });
      setSelected("work");
    }
    if (modal === "node") {
      const node = newNode(crypto.randomUUID(), nodeKind, n!.id, input.trim());
      await execute("upsert_node", { ...base(), node });
      setSelected(node.id);
    }
    if (modal === "fork") {
      const r = await invoke("fork_project", {
        object_id: record!.object.object_id,
        revision: record!.object.revision,
        title: input.trim(),
        operation_key: crypto.randomUUID(),
      });
      await accept(r);
    }
    if (modal === "goal") {
      if (record) {
        await invoke("prepare_handoff", {
          object_id: record.object.object_id,
          revision: record.object.revision,
          node_id: n!.id,
          goal: input,
        });
        await api.host?.("handoff", {
          goal: input,
          object_ref: fixed(record),
          node_id: n!.id,
        });
      } else await api.host?.("handoff", { goal: input });
      setNotice("已复制当前目标及固定范围，请在所选Agent会话中继续。");
    }
    if (modal === "note") {
      await execute("add_note", {
        ...base(),
        note: {
          id: crypto.randomUUID(),
          node_id: n!.id,
          kind: "feedback",
          origin: "author_quote",
          text: input,
        },
      });
    }
    if (modal === "compare")
      setResult(
        await invoke("compare_versions", {
          object_id: record!.object.object_id,
          from_revision: compareFrom,
          to_revision: compareTo,
        }),
      );
    setModal(null);
    setInput("");
  }
  function open(kind: typeof modal) {
    setInput("");
    setModal(kind);
    setError("");
  }
  const tabs = VIDEO
    ? [
        ["structure", "分镜"],
        ["assets", "素材"],
        ["takes", "制作"],
        ["edits", "剪辑"],
        ["feedback", "审片与返工"],
        ["delivery", "交付"],
        ["activity", "工作记录"],
      ]
    : [
        ["structure", "故事结构"],
        ["characters", "人物弧线"],
        ["relations", "关系与伏笔"],
        ["manuscript", "正文接续"],
        ["activity", "工作记录"],
      ];
  return (
    <div
      className={"workspace " + (!nav ? "collapsed" : "")}
      onCompositionStart={() => (compose.current = true)}
      onCompositionEnd={() => (compose.current = false)}
    >
      <header>
        <button
          aria-label="返回工作台"
          title="返回工作台"
          onClick={() =>
            void run(async () => {
              await persist();
              await api.host?.("close_view", {});
            })
          }
        >
          ←
        </button>
        <h1>{title}</h1>
        <select
          aria-label="选择方案"
          value={record?.object.object_id ?? ""}
          disabled={busy || !!draft || !!pending}
          onChange={(e) => void run(() => load(e.target.value).then(() => {}))}
        >
          <option value="" disabled>
            选择方案
          </option>
          {projects.map((x) => (
            <option key={x.object_id} value={x.object_id}>
              {x.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => open("create")}
          disabled={busy || !!draft || !!pending}
        >
          新建
        </button>
        <span className="spacer" />
        {record && (
          <>
            <span className="revision">修订 {record.object.revision}</span>
            <button onClick={() => open("compare")}>比较</button>
            <button onClick={() => open("fork")} disabled={busy || !!pending}>
              备选
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.host?.("export_file", {
                    action: "export_project",
                    input: {
                      object_id: record.object.object_id,
                      revision: record.object.revision,
                      format: "markdown",
                    },
                    suggested_name:
                      p!.title.slice(0, 70).replace(/[\\/]/g, "_") + ".md",
                  });
                  setNotice("完整固定版本已导出。");
                })
              }
            >
              导出
            </button>
          </>
        )}
        <button
          className="primary"
          onClick={() => open("goal")}
          disabled={busy}
        >
          让 AI 处理
        </button>
      </header>
      {(error || notice) && (
        <div
          className={error ? "message error" : "message"}
          role={error ? "alert" : "status"}
        >
          {error || notice}
          <button
            aria-label="关闭提示"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}
      {pending && (
        <div className="recovery" role="region" aria-label="原操作恢复">
          <span>待核对操作，已保留输入。</span>
          <button disabled={busy} onClick={() => void run(recover)}>
            回读原操作
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = (await api.invoke("get_operation", {
                  operation_key: pending.input.operation_key,
                })) as any;
                if (r.status === "succeeded") await accept(r.data);
                else if (r.error?.code === "not_found")
                  await execute(pending.action, pending.input);
                else throw new Error("结果未知，继续沿原键查询。");
              })
            }
          >
            沿原输入重试
          </button>
          {pending.action === "upsert_node" && (
            <button disabled={busy} onClick={() => void run(comparePending)}>
              比较当前版本
            </button>
          )}
        </div>
      )}
      {!ready ? (
        <div className="empty" role="status">
          正在读取作品与已有方案…
        </div>
      ) : !p ? (
        <div className="empty">
          <h2>开始{title}</h2>
          <p>
            {VIDEO
              ? "从已有剧本、素材或新的创意建立制作方案。"
              : "从原创构思或已有剧本整理全作与场次。"}
          </p>
          <button onClick={() => open("create")}>新建方案</button>
          <button className="primary" onClick={() => open("goal")}>
            让 AI 筹备
          </button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <button
              aria-label={nav ? "收起目录" : "展开目录"}
              onClick={() => setNav(!nav)}
            >
              ☰
            </button>
            <nav
              role="tablist"
              aria-label="工作专题"
              onKeyDown={(e) => {
                if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
                  return;
                e.preventDefault();
                const ids = tabs.map((x) => x[0]),
                  i = ids.indexOf(tab),
                  j =
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? ids.length - 1
                        : (i + (e.key === "ArrowRight" ? 1 : ids.length - 1)) %
                          ids.length;
                setTab(ids[j]);
                (e.currentTarget.children[j] as HTMLElement).focus();
              }}
            >
              {tabs.map(([id, text]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    setResult(undefined);
                  }}
                >
                  {text}
                </button>
              ))}
            </nav>
            <span className="spacer" />
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setResult(
                    await invoke("check_project", {
                      object_id: record!.object.object_id,
                      revision: record!.object.revision,
                    }),
                  );
                })
              }
            >
              检查
            </button>
          </div>
          <div className="body">
            <aside aria-label="作品结构">
              <div className="tree-tools">
                <input
                  aria-label="搜索结构"
                  placeholder="搜索标题或内容"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(e) => setArchived(e.target.checked)}
                  />
                  显示归档
                </label>
              </div>
              <div role="tree" aria-label="结构目录">
                {nodes.map((x) => (
                  <button
                    role="treeitem"
                    aria-level={pathTo(p, x.id).length}
                    aria-selected={n?.id === x.id}
                    key={x.id}
                    style={{
                      paddingLeft: 12 + (pathTo(p, x.id).length - 1) * 14,
                    }}
                    onClick={() => {
                      if (draft && draft.id !== x.id) {
                        setNotice(
                          "当前编辑稿已保留，请先保存或取消再切换节点。",
                        );
                        return;
                      }
                      setSelected(x.id);
                      setResult(undefined);
                    }}
                    onKeyDown={(e) => {
                      const i = nodes.indexOf(x),
                        j =
                          e.key === "ArrowDown"
                            ? Math.min(nodes.length - 1, i + 1)
                            : e.key === "ArrowUp"
                              ? Math.max(0, i - 1)
                              : e.key === "Home"
                                ? 0
                                : e.key === "End"
                                  ? nodes.length - 1
                                  : -1;
                      if (j >= 0) {
                        e.preventDefault();
                        if (!draft) {
                          setSelected(nodes[j].id);
                          (
                            e.currentTarget.parentElement!.children[
                              j
                            ] as HTMLElement
                          ).focus();
                        }
                      }
                    }}
                  >
                    <span className="kind">{labels[x.kind]}</span>
                    <span>{x.title}</span>
                    {x.archived && <small>归档</small>}
                  </button>
                ))}
              </div>
              {!nodes.length && <p className="hint">没有符合条件的节点。</p>}
              <button
                className="add"
                disabled={
                  busy ||
                  !!draft ||
                  !!pending ||
                  n?.kind === (VIDEO ? "shot" : "scene")
                }
                onClick={() => {
                  const ranks = VIDEO
                    ? ["work", "episode", "sequence", "scene", "shot"]
                    : ["work", "season", "episode", "sequence", "scene"];
                  setNodeKind(ranks[ranks.indexOf(n!.kind) + 1]);
                  open("node");
                }}
              >
                添加下级
              </button>
            </aside>
            <main aria-busy={busy}>
              {tab === "structure" && n && (
                <>
                  <div className="section-head">
                    <div>
                      {n.parent_id && (
                        <span className="hint">
                          {pathTo(p, n.id)
                            .slice(0, -1)
                            .map((x) => x.title)
                            .join(" / ")}
                        </span>
                      )}
                      <h2>{n.title}</h2>
                    </div>
                    <span className="spacer" />
                    {!draft ? (
                      <>
                        <button
                          disabled={busy || !!pending}
                          onClick={() => setDraft(clone(n))}
                        >
                          编辑
                        </button>
                        <button disabled={busy} onClick={() => open("note")}>
                          提意见
                        </button>
                        <button
                          disabled={busy || !!pending}
                          onClick={() =>
                            void run(async () => {
                              await execute("archive_node", {
                                ...base(),
                                node_id: n.id,
                                archived: !n.archived,
                              });
                            })
                          }
                        >
                          {n.archived ? "恢复" : "归档"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          disabled={busy || !!pending}
                          onClick={() => {
                            setDraft(undefined);
                          }}
                        >
                          取消编辑
                        </button>
                        <button
                          className="primary"
                          disabled={busy || !!pending}
                          onClick={() => void run(submit)}
                        >
                          保存
                        </button>
                      </>
                    )}
                  </div>
                  {draft ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(submit);
                      }}
                      className="editor"
                    >
                      <label>
                        标题
                        <input
                          value={draft.title}
                          onChange={(e) => editField("title", e.target.value)}
                          maxLength={200}
                        />
                      </label>
                      {[
                        ["summary", "概要"],
                        ["goal", "目标"],
                        ["conflict", "冲突"],
                        ["turn", "转折"],
                        ["start_state", "起始状态"],
                        ["end_state", "结束状态"],
                        ...(VIDEO
                          ? [
                              ["camera", "摄影"],
                              ["action", "行动"],
                              ["sound", "声音"],
                            ]
                          : []),
                        ["detail", "详细内容"],
                      ].map(([key, text]) => (
                        <label key={key}>
                          {text}
                          <textarea
                            rows={key === "detail" ? 14 : 3}
                            value={draft[key]}
                            onChange={(e) => editField(key, e.target.value)}
                          />
                        </label>
                      ))}
                    </form>
                  ) : (
                    <article>
                      <section>{read(n.summary)}</section>
                      <div className="story-grid">
                        {[
                          ["goal", "目标"],
                          ["conflict", "冲突"],
                          ["turn", "转折"],
                          ["start_state", "起始状态"],
                          ["end_state", "结束状态"],
                          ...(VIDEO
                            ? [
                                ["camera", "摄影"],
                                ["action", "行动"],
                                ["sound", "声音"],
                              ]
                            : []),
                        ]
                          .filter(([key]) => n[key])
                          .map(([key, text]) => (
                            <section key={key}>
                              <h3>{text}</h3>
                              {read(n[key])}
                            </section>
                          ))}
                      </div>
                      <section>
                        <h3>{VIDEO ? "镜头设计与行动" : "详细剧情"}</h3>
                        {read(n.detail)}
                      </section>
                      {n.source_indices.length > 0 && (
                        <details>
                          <summary>
                            固定依据 {n.source_indices.length} 项
                          </summary>
                          {n.source_indices.map((i) => (
                            <p key={i}>
                              来源 {i + 1}：
                              {record!.object.source_refs?.[i]?.kind}
                            </p>
                          ))}
                        </details>
                      )}
                    </article>
                  )}
                </>
              )}
              {tab === "activity" && (
                <>
                  <h2>工作记录</h2>
                  {p.activity.map((x) => (
                    <section className="row" key={x.id}>
                      <span className="hint">
                        {x.origin === "author_quote"
                          ? "作者意见"
                          : x.origin === "agent"
                            ? "Agent记录"
                            : "外部记录"}
                        {x.node_id
                          ? " / " +
                            p.nodes.find((n) => n.id === x.node_id)?.title
                          : ""}
                      </span>
                      {read(x.text)}
                    </section>
                  ))}
                  {!p.activity.length && (
                    <p>尚无记录。向 Agent 说明目标，或在具体节点提意见。</p>
                  )}
                  <h3>原稿阅读覆盖</h3>
                  {p.coverage.map((x, i) => (
                    <p key={i}>
                      {stateName[x.status]}：{x.range} {x.notes}
                    </p>
                  ))}
                </>
              )}
              {tab === "characters" && (
                <>
                  <h2>人物弧线</h2>
                  {!p.characters.length && (
                    <p>尚未整理人物，让 Agent 从固定剧本提取人物与场次变化。</p>
                  )}
                  {p.characters.map((c: any) => (
                    <section className="row" key={c.id}>
                      <h3>
                        {c.name}
                        {c.archived ? "（归档）" : ""}
                      </h3>
                      {read(c.summary)}
                      <table>
                        <caption>{c.name}的选择与代价</caption>
                        <thead>
                          <tr>
                            <th>节点</th>
                            <th>状态</th>
                            <th>选择</th>
                            <th>代价</th>
                            <th>认知</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.arc.map((a: any, i: number) => (
                            <tr key={i}>
                              <td>
                                <button
                                  onClick={() => {
                                    setSelected(a.node_id);
                                    setTab("structure");
                                  }}
                                >
                                  {
                                    p.nodes.find((n) => n.id === a.node_id)
                                      ?.title
                                  }
                                </button>
                              </td>
                              <td>{a.state}</td>
                              <td>{a.choice}</td>
                              <td>{a.cost}</td>
                              <td>{a.knowledge}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  ))}
                </>
              )}
              {tab === "relations" && (
                <>
                  <h2>关系与伏笔</h2>
                  <div className="network" role="img" aria-label="人物关系图">
                    <svg
                      viewBox={
                        "0 0 800 " +
                        Math.max(
                          200,
                          Math.ceil(p.characters.length / 4) * 100 + 40,
                        )
                      }
                    >
                      {p.relations.map((r: any) => {
                        const i = p.characters.findIndex(
                            (c: any) => c.id === r.from_id,
                          ),
                          j = p.characters.findIndex(
                            (c: any) => c.id === r.to_id,
                          ),
                          x = (i % 4) * 200 + 100,
                          y = Math.floor(i / 4) * 100 + 50,
                          xx = (j % 4) * 200 + 100,
                          yy = Math.floor(j / 4) * 100 + 50;
                        return (
                          <g key={r.id}>
                            <line x1={x} y1={y} x2={xx} y2={yy} />
                            <text x={(x + xx) / 2} y={(y + yy) / 2 + 22}>
                              {r.description.slice(0, 12)}
                            </text>
                          </g>
                        );
                      })}
                      {p.characters.map((c: any, i: number) => (
                        <g key={c.id}>
                          <circle
                            cx={(i % 4) * 200 + 100}
                            cy={Math.floor(i / 4) * 100 + 50}
                            r={32}
                          />
                          <text
                            x={(i % 4) * 200 + 100}
                            y={Math.floor(i / 4) * 100 + 55}
                          >
                            {c.name.slice(0, 5)}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>人物</th>
                        <th>关系</th>
                        <th>人物</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.relations.map((r: any) => (
                        <tr key={r.id}>
                          <td>
                            {
                              p.characters.find((c: any) => c.id === r.from_id)
                                ?.name
                            }
                          </td>
                          <td>{r.description}</td>
                          <td>
                            {
                              p.characters.find((c: any) => c.id === r.to_id)
                                ?.name
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {p.clues.map((c: any) => (
                    <section className="row" key={c.id}>
                      <h3>
                        {c.title}{" "}
                        <span className="hint">{stateName[c.status]}</span>
                      </h3>
                      {c.placements.map((x: any, i: number) => (
                        <p key={i}>
                          <button
                            onClick={() => {
                              setSelected(x.node_id);
                              setTab("structure");
                            }}
                          >
                            {p.nodes.find((n) => n.id === x.node_id)?.title}
                          </button>{" "}
                          {
                            (
                              {
                                plant: "埋设",
                                develop: "发展",
                                payoff: "回收",
                              } as any
                            )[x.stage]
                          }
                          ：{x.notes}
                        </p>
                      ))}
                    </section>
                  ))}
                </>
              )}
              {tab === "manuscript" && (
                <>
                  <h2>正文接续</h2>
                  <p>
                    全作与场次方案固定后，可准备宿主分集参考稿；已有候选与作者稿保留各自身份。
                  </p>
                  {p.nodes
                    .filter((x) => x.formal_episode_id)
                    .map((x) => (
                      <section className="row" key={x.id}>
                        <h3>{x.title}</h3>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const r = await invoke("read_manuscript", {
                                object_id: record!.object.object_id,
                                revision: record!.object.revision,
                                node_id: x.id,
                              });
                              setResult(r);
                            })
                          }
                        >
                          读取现有正文与候选
                        </button>
                        {x.source_indices.map(
                          (i) =>
                            record!.object.source_refs?.[i]?.kind ===
                              "document" && (
                              <button
                                key={i}
                                onClick={() =>
                                  void run(async () => {
                                    await persist();
                                    await api.host?.("open_document", {
                                      source_ref:
                                        record!.object.source_refs![i],
                                    });
                                  })
                                }
                              >
                                前往宿主正文
                              </button>
                            ),
                        )}
                      </section>
                    ))}
                  {!p.nodes.some((x) => x.formal_episode_id) && (
                    <p>
                      尚未关联正式分集。让 Agent
                      准备全作、分集与场次后，通过宿主创建分集并映射。
                    </p>
                  )}
                  <button
                    className="primary"
                    onClick={() => {
                      setInput(
                        "读取当前固定方案和已有正文，梳理过去的结构，再准备下一阶段分集与场次参考稿。保留原稿、作者约束和未解伏笔，先发现实际任务能力。",
                      );
                      setModal("goal");
                    }}
                  >
                    让 AI 接续剧本
                  </button>
                </>
              )}

              {result && (
                <section className="result" aria-label="检查与比较结果">
                  <h3>
                    {result.issues
                      ? "检查结果"
                      : result.changes
                        ? "版本差异"
                        : "实际成果"}
                  </h3>
                  {result.issues ? (
                    <>
                      {result.issues.length === 0 ? (
                        <p>结构检查通过。{result.scope}</p>
                      ) : (
                        result.issues.map((x: any, i: number) => (
                          <p key={i}>
                            {x.message}
                            <button
                              onClick={() => {
                                if (x.node_id) setSelected(x.node_id);
                                setTab("structure");
                              }}
                            >
                              定位
                            </button>
                          </p>
                        ))
                      )}
                    </>
                  ) : result.changes ? (
                    <>
                      {result.changes.map((c: any, i: number) => (
                        <section className="diff" key={i}>
                          <strong>{c.path}</strong>
                          <del>
                            {typeof c.before === "string"
                              ? c.before
                              : JSON.stringify(c.before)}
                          </del>
                          <ins>
                            {typeof c.after === "string"
                              ? c.after
                              : JSON.stringify(c.after)}
                          </ins>
                        </section>
                      ))}
                      {result.order_changes?.length > 0 && (
                        <p>目录顺序发生变化。</p>
                      )}
                    </>
                  ) : (
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                  )}
                </section>
              )}
            </main>
          </div>
        </>
      )}
      {modal && (
        <div className="scrim">
          <dialog
            open
            aria-modal="true"
            aria-label={
              {
                create: "新建方案",
                node: "添加下级",
                fork: "建立备选",
                goal: "让 AI 处理",
                note: "记录意见",
                compare: "比较版本",
              }[modal]
            }
            onKeyDown={(e) => {
              if (e.key === "Escape") setModal(null);
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(confirmModal);
              }}
            >
              <h2>
                {
                  {
                    create: "新建方案",
                    node: "添加下级",
                    fork: "建立备选",
                    goal: "让 AI 处理",
                    note: "记录意见",
                    compare: "比较版本",
                  }[modal]
                }
              </h2>
              {modal === "node" && (
                <label>
                  类型
                  <select
                    value={nodeKind}
                    onChange={(e) => setNodeKind(e.target.value)}
                  >
                    {Object.entries(labels)
                      .filter(
                        ([k]) =>
                          k !== "work" &&
                          p &&
                          [
                            "work",
                            ...(VIDEO ? [] : ["season"]),
                            "episode",
                            "sequence",
                            "scene",
                            ...(VIDEO ? ["shot"] : []),
                          ].indexOf(k) >
                            [
                              "work",
                              ...(VIDEO ? [] : ["season"]),
                              "episode",
                              "sequence",
                              "scene",
                              ...(VIDEO ? ["shot"] : []),
                            ].indexOf(n!.kind),
                      )
                      .map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {modal === "compare" ? (
                <div className="version-input">
                  <label>
                    起始修订
                    <input
                      type="number"
                      min={1}
                      max={record?.object.revision}
                      value={compareFrom}
                      onChange={(e) => setCompareFrom(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    目标修订
                    <input
                      type="number"
                      min={1}
                      max={record?.object.revision}
                      value={compareTo}
                      onChange={(e) => setCompareTo(Number(e.target.value))}
                    />
                  </label>
                </div>
              ) : (
                <label>
                  {modal === "goal"
                    ? "当前目标"
                    : modal === "note"
                      ? "意见内容"
                      : "标题"}
                  {modal === "goal" || modal === "note" ? (
                    <textarea
                      autoFocus
                      rows={6}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      maxLength={modal === "goal" ? 8000 : 20000}
                    />
                  ) : (
                    <input
                      autoFocus
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      maxLength={200}
                    />
                  )}
                </label>
              )}
              {error && <p role="alert">{error}</p>}
              <footer>
                <button type="button" onClick={() => setModal(null)}>
                  取消
                </button>
                <button
                  className="primary"
                  disabled={busy || (modal !== "compare" && !input.trim())}
                  type="submit"
                >
                  {modal === "goal"
                    ? "复制并继续"
                    : modal === "compare"
                      ? "读取差异"
                      : "确认"}
                </button>
              </footer>
            </form>
          </dialog>
        </div>
      )}
      {conflict && (
        <div className="scrim">
          <dialog open aria-modal="true" aria-label="版本冲突">
            <h2>保留本地编辑并比较</h2>
            <p>
              原操作尚未写入。当前修订 {conflict.current.object.revision}
              ，请比较后选择基线。
            </p>
            {conflict.fields.length === 0 ? (
              <p>本地与当前版本可合并，其他字段保留当前值。</p>
            ) : (
              conflict.fields.map((f: any) => (
                <section className="diff" key={f.key}>
                  <strong>{f.key}</strong>
                  <span>
                    当前版本：
                    {typeof f.remote === "string"
                      ? f.remote
                      : JSON.stringify(f.remote)}
                  </span>
                  <span>
                    本地编辑：
                    {typeof f.local === "string"
                      ? f.local
                      : JSON.stringify(f.local)}
                  </span>
                  <select
                    aria-label={"选择字段版本 " + f.key}
                    value={f.choice}
                    onChange={(e) =>
                      setConflict({
                        ...conflict,
                        fields: conflict.fields.map((x: any) =>
                          x.key === f.key
                            ? { ...x, choice: e.target.value }
                            : x,
                        ),
                      })
                    }
                  >
                    <option value="">请选择</option>
                    <option value="remote">当前版本</option>
                    <option value="local">本地编辑</option>
                  </select>
                </section>
              ))
            )}
            <p>选择只准备新的编辑基线，保存后才产生修订。</p>
            <footer>
              <button onClick={() => setConflict(undefined)}>继续保留</button>
              <button
                disabled={conflict.fields.some((f: any) => !f.choice)}
                onClick={() => {
                  const merged = clone(conflict.local);
                  for (const f of conflict.fields) merged[f.key] = f[f.choice];
                  setRecord(conflict.current);
                  setDraft(merged);
                  setPending(undefined);
                  setConflict(undefined);
                  setNotice("已明确选择新基线；本地节点内容尚未保存。");
                }}
              >
                以当前基线继续编辑
              </button>
            </footer>
          </dialog>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
