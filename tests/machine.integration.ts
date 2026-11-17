import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import manifest from "../contracts/plugin-manifest.json" with { type: "json" };
import { newProject, newNode, VIDEO, clone } from "../src/domain/model.ts";
import { fixed } from "../vendor/project-store.ts";
import { start } from "./support/machine.ts";
let serial = 0;
const base = (r: any) => ({
  object_id: r.object.object_id,
  expected_revision: r.object.revision,
  expected_sha256: r.sha256,
  operation_key: "business-" + ++serial,
});

test(
  "真实稳定MCP完整专业动作、核心接续、Skill、CLI、热插拔与原操作",
  { timeout: 600000 },
  async (t) => {
    const c = await start();
    t.diagnostic("隔离工作区与回执：" + c.directory);
    try {
      assert.equal(c.cap.actions.length, manifest.contributions.actions.length);
      assert.equal(c.cap.access_mode, "open");
      assert.deepEqual(
        (await c.client.listTools()).tools.map((x: any) => x.name),
        c.tools,
      );
      const skill = manifest.contributions.skills[0];
      assert.equal(
        (await c.invoke("skills.read", { skill_id: skill.id })).content,
        await readFile(skill.entry.replace(/^skills\//, "skills/"), "utf8"),
      );
      for (const resource of [
        "references/workflow.md",
        "references/operations.md",
      ])
        assert.equal(
          (await c.invoke("skills.read", { skill_id: skill.id, resource }))
            .content,
          await readFile(
            path.join(path.dirname(skill.entry), resource),
            "utf8",
          ),
        );
      let p = newProject("旧站工程");
      p.nodes[0].summary = "末班车经过旧站，两个人决定留下。";
      p.nodes[0].goal = "送出迟到的信";
      let r = await c.invoke("save_project", {
        content: p,
        source_refs: [],
        expected_revision: 0,
        expected_sha256: "",
        operation_key: "save",
      });
      const original = r;
      assert.equal(
        (await c.invoke("list_projects", { query: "旧站" })).objects[0]
          .object_id,
        r.object.object_id,
      );
      assert.equal(
        (
          await c.invoke("get_project", {
            object_id: r.object.object_id,
            revision: 1,
          })
        ).sha256,
        r.sha256,
      );
      const node = newNode("episode", "episode", "work", "第一集");
      node.summary = "站台争执，候车亭交换秘密。";
      node.goal = "找到寄信人";
      const request = { ...base(r), node };
      r = await c.invoke("upsert_node", request);
      assert.equal((await c.invoke("upsert_node", request)).sha256, r.sha256);
      const reused = await c.raw("upsert_node", {
        ...request,
        node: { ...node, title: "同键异参" },
      });
      assert.equal(
        reused.data?.result?.error?.code ?? reused.error?.code,
        "idempotency_conflict",
      );
      r = await c.invoke("upsert_node", {
        ...base(r),
        node: newNode("episode2", "episode", "work", "第二集"),
      });
      r = await c.invoke("upsert_node", {
        ...base(r),
        node: newNode("scene", "scene", "episode", "候车亭"),
      });
      r = await c.invoke("move_node", {
        ...base(r),
        node_id: "scene",
        parent_id: "episode2",
        position: 0,
      });
      r = await c.invoke("move_node", {
        ...base(r),
        node_id: "scene",
        parent_id: "episode",
      });
      r = await c.invoke("archive_node", {
        ...base(r),
        node_id: "episode2",
        archived: true,
      });
      r = await c.invoke("archive_node", {
        ...base(r),
        node_id: "episode2",
        archived: false,
      });
      r = await c.invoke("reorder_nodes", {
        ...base(r),
        parent_id: "work",
        node_ids: ["episode2", "episode"],
      });
      assert.equal(
        (
          await c.invoke("get_scope", {
            object_id: r.object.object_id,
            node_id: "episode",
          })
        ).nodes.length,
        2,
      );
      r = await c.invoke("add_note", {
        ...base(r),
        note: {
          id: "review",
          node_id: "scene",
          origin: "agent",
          kind: "analysis",
          text: "先复盘已有结构，再继续新场次。",
        },
      });
      r = await c.invoke("set_network", {
        ...base(r),
        characters: [
          {
            id: "p",
            name: "林溪",
            summary: "守信的人",
            arc: [
              {
                node_id: "scene",
                state: "等待",
                choice: "留下",
                cost: "错过车",
                knowledge: "信仍有收件人",
              },
            ],
            archived: false,
          },
        ],
        relations: [],
        clues: [
          {
            id: "letter",
            title: "旧信",
            status: "open",
            placements: [
              { node_id: "scene", stage: "plant", notes: "落款是未来日期" },
            ],
            archived: false,
          },
        ],
      });
      const project = await c.ok("hetu_read_drama_project", {
        management_ref: c.management,
        project_id: c.work.object_id,
      });
      const episode = await c.ok("hetu_create_drama_episode", {
        management_ref: c.management,
        project_ref: {
          project_id: c.work.object_id,
          revision: project.project.revision,
          sha256: project.sha256,
        },
        title: "第一集 旧站",
        plan: "两场，站台争执与候车亭交换秘密。",
        language_tag: "zh-CN",
        operation_key: "host-episode",
      });
      r = await c.invoke("map_episode", {
        ...base(r),
        node_id: "episode",
        episode_id: episode.episode.episode_id,
      });
      const reading = await c.invoke("read_manuscript", {
        object_id: r.object.object_id,
        revision: r.object.revision,
        node_id: "episode",
      });
      assert.equal(reading.current.manuscript.author_state, "empty");
      assert.equal(reading.fixed_sources.length, 1);
      const preview = await c.ok("hetu_preview_creative_task", {
        management_ref: c.management,
        scope_ref: c.management.scope_ref,
        task_kind: "drama_draft",
        brief: "按插件固定全作和第一集场次写Fountain参考稿，保留旧信伏笔。",
        input_refs: [],
        target_ref: reading.current.manuscript.author_ref,
        client_adapter: "codex",
        language_tag: "zh-CN",
      });
      const task = await c.ok("hetu_prepare_creative_task", {
        ...preview.prepare_input,
        management_ref: c.management,
        operation_key: "draft-task",
      });
      const opened = await c.ok("hetu_open_collaboration_task", {
        task_locator: task.task_locator,
      });
      const task_ref = opened.task_ref;
      const v1 =
        ".EXT. 旧站 - 夜\n\n林溪拦住车门。\n\n@林溪\n请再等一分钟。\n\n.INT. 候车亭 - 夜\n\n陈舟拿出旧信。\n\n@陈舟\n我们一起留下。\n";
      const first = await c.ok("hetu_create_working_copy", {
        task_ref,
        artifact_kind: "text",
        source_format: "fountain",
        title: "第一集参考稿",
        base_refs: [],
        content: v1,
        operation_key: "draft-v1",
      });
      const feedback = await c.ok("hetu_save_task_feedback", {
        task_ref,
        expected_feedback_head: null,
        target_refs: [
          { kind: "working_copy", working_copy_ref: first.working_copy_ref },
        ],
        intent: "request_changes",
        public_comment: "Agent自查：留下缺少代价，补上撕毁车票。",
        selected_refs: [],
        operation_key: "draft-feedback",
      });
      const v2 = v1.replace(
        "陈舟拿出旧信。",
        "陈舟撕掉车票，把旧信放在林溪掌心。",
      );
      const revised = await c.ok("hetu_save_working_copy", {
        task_ref,
        working_copy_id: first.working_copy_ref.working_copy_id,
        expected: first.working_copy_ref,
        content: v2,
        feedback_refs: [feedback.feedback_ref],
        operation_key: "draft-v2",
      });
      await c.ok("hetu_submit_creative_result", {
        task_ref,
        request_sha256: task.request_sha256,
        working_copy_refs: [revised.working_copy_ref],
        feedback_refs: [feedback.feedback_ref],
        complete: true,
        missing_items: [],
        provenance: { client: "plugin-test", skill_version: "0.1.0" },
        operation_key: "draft-submit",
      });
      const current = await c.invoke("read_manuscript", {
        object_id: r.object.object_id,
        revision: r.object.revision,
        node_id: "episode",
      });
      assert.equal(current.current.manuscript.author_state, "empty");
      assert.equal(current.current.manuscript.references.length, 1);
      const fixedDraft = await c.ok("hetu_read_working_copy", {
        task_ref,
        working_copy_ref: revised.working_copy_ref,
      });
      assert.equal(fixedDraft.revision.content, v2);
      r = await c.invoke("add_note", {
        ...base(r),
        note: {
          id: "continue",
          node_id: "episode",
          origin: "agent",
          kind: "continuation",
          text: "第一集Fountain参考稿已按自查返工并提交，未采纳；下一集发展旧信落款。",
        },
      });

      const fork = await c.invoke("fork_project", {
        object_id: r.object.object_id,
        revision: r.object.revision,
        title: "开放结尾备选",
        operation_key: "fork",
      });
      assert.notEqual(fork.object.object_id, r.object.object_id);
      assert.ok(
        (
          await c.invoke("compare_versions", {
            object_id: r.object.object_id,
            from_revision: 1,
            to_revision: r.object.revision,
          })
        ).changes.length,
      );
      await c.invoke("check_project", {
        object_id: r.object.object_id,
        revision: r.object.revision,
      });
      let offset = 0,
        exported = "";
      do {
        const chunk = await c.invoke("export_project", {
          object_id: r.object.object_id,
          revision: r.object.revision,
          format: "json",
          offset,
          max_bytes: 1024,
        });
        exported += chunk.content;
        if (chunk.next_offset === null) break;
        offset = chunk.next_offset;
      } while (true);
      assert.equal(JSON.parse(exported).project_ref.sha256, r.sha256);
      const handoff = await c.invoke("prepare_handoff", {
        object_id: r.object.object_id,
        revision: r.object.revision,
        node_id: "episode",
        goal: "接续下一轮创作",
      });
      assert.equal(handoff.project_ref.sha256, r.sha256);
      const receipt = await c.invoke("get_operation", {
        operation_key: "save",
      });
      assert.equal(receipt.sha256, original.sha256);
      const fromCli = c.cli("hetu.plugins.invoke", {
        ...c.binding,
        capabilities_sha256: c.cap.capabilities_sha256,
        action: "get_project",
        arguments: {
          object_id: r.object.object_id,
          revision: r.object.revision,
        },
      });
      assert.equal(fromCli.data.result.data.sha256, r.sha256);
      await c.apply("disable");
      assert.notEqual(
        (await c.raw("get_project", { object_id: r.object.object_id })).status,
        "succeeded",
      );
      await c.apply("enable");
      await c.discover();
      assert.equal(
        (await c.invoke("get_project", { object_id: r.object.object_id }))
          .sha256,
        r.sha256,
      );
      await c.apply("uninstall");
      assert.notEqual(
        (await c.raw("get_project", { object_id: r.object.object_id })).status,
        "succeeded",
      );
      await c.apply("install");
      await c.discover();
      assert.equal(
        (await c.invoke("get_project", { object_id: r.object.object_id }))
          .sha256,
        r.sha256,
      );
      assert.deepEqual(
        [...c.actions]
          .filter((a) => a !== "skills.read" && !a.startsWith("hetu."))
          .sort(),
        manifest.contributions.actions.map((a) => a.id).sort(),
      );
      await mkdir("output", { recursive: true });
      await writeFile(
        "output/machine-acceptance.json",
        JSON.stringify(
          {
            recorded_at: new Date().toISOString(),
            platform: process.platform,
            status: "passed",
            package_sha256: c.pkg.package_sha256,
            project_ref: fixed(r),
            actions: [...c.actions],
            directory: c.directory,
            boundaries: [
              "真实稳定MCP与Core；桌面未启动",
              "未执行付费生成、作者采纳、定稿或成片认可",
              "Windows/Linux尚未实机验收",
            ],
          },
          null,
          2,
        ),
      );
    } finally {
      await c.client.close();
    }
  },
);
