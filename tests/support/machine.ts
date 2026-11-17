import { mkdtemp, mkdir, writeFile, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import manifest from "../../contracts/plugin-manifest.json" with { type: "json" };
import { VIDEO, WORK_KIND } from "../../src/domain/model.ts";
export const host = path.resolve(
  process.env.HETU_SOURCE ?? "../../limecloud/hetu",
);
export async function start() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), VIDEO ? "hetu-video-studio-" : "hetu-screenplay-"),
  );
  await mkdir(path.join(directory, "requests"));
  const packageDirectory = path.join(directory, "package");
  await cp(path.resolve("dist"), packageDirectory, { recursive: true });
  const bin = path.join(host, "target/debug");
  const env = {
    ...process.env,
    HETU_DESKTOP_PROFILE: path.join(directory, "profile"),
    HETU_COLLABORATION_DIR: path.join(directory, "hub"),
    HETU_PLUGIN_STATE_DIR: path.join(directory, "plugins"),
    HETU_PLUGIN_ACCESS_DIR: path.join(directory, "access"),
    HETU_PLUGIN_NODE: process.execPath,
    HETU_PLUGIN_CLI: path.join(bin, "hetu-plugin"),
    HETU_APP_SERVER: path.join(bin, "hetu-app-server"),
    HETU_PLUGIN_MANAGER: path.join(
      host,
      "apps/desktop/dist/plugin-manager.mjs",
    ),
  };
  const resolve = createRequire(path.join(host, "apps/desktop/package.json"));
  const { Client } = await import(
    pathToFileURL(resolve.resolve("@modelcontextprotocol/client")).href
  );
  const { StdioClientTransport } = await import(
    pathToFileURL(resolve.resolve("@modelcontextprotocol/client/stdio")).href
  );
  const client = new Client(
    { name: manifest.id + "-test", version: "1" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(
    new StdioClientTransport({
      command: path.join(bin, "hetu-mcp"),
      args: [
        "--client",
        "codex",
        "--collaboration-dir",
        env.HETU_COLLABORATION_DIR,
      ],
      env,
      stderr: "pipe",
    }),
  );
  let serial = 0;
  const call = async (name: string, args: any = {}) => {
    const record = path.join(
      directory,
      "requests",
      String(++serial).padStart(4, "0"),
    );
    await writeFile(
      record + ".request.json",
      JSON.stringify({ name, arguments: args }),
      { mode: 0o600 },
    );
    const result = (await client.callTool({ name, arguments: args }))
      .structuredContent as any;
    await writeFile(record + ".result.json", JSON.stringify(result), {
      mode: 0o600,
    });
    return result;
  };
  const ok = async (name: string, args: any = {}) => {
    const r = await call(name, args);
    assert.equal(r.status, "succeeded", JSON.stringify(r));
    return r.data;
  };
  try {
    const tools = (await client.listTools()).tools.map((x: any) => x.name);
    const begin = await ok("hetu_begin_creation", {
      brief: "旧站隔离插件验收",
      locale: "zh-CN",
      operation_key: "begin",
    });
    const profile = await ok("hetu_save_creation_project", {
      management_ref: begin.management_ref,
      project_id: begin.project.project_id,
      expected: { revision: begin.revision, sha256: begin.sha256 },
      brief: "验证完整创作工程。",
      selected_fields: {},
      work_profile: {
        work_type: WORK_KIND,
        language_tag: "zh-CN",
        drama_mode: VIDEO ? null : "original",
      },
      operation_key: "profile",
    });
    const created = await ok(
      VIDEO
        ? "hetu_create_video_from_project"
        : "hetu_create_drama_from_project",
      {
        management_ref: begin.management_ref,
        project_id: begin.project.project_id,
        expected: { revision: profile.revision, sha256: profile.sha256 },
        target_path: begin.target_path,
        profile: VIDEO
          ? {
              title: "旧站视频验收",
              brief: "末班车之前",
              language_tag: "zh-CN",
            }
          : {
              title: "旧站剧本验收",
              description: "末班车之前",
              mode: "original",
              language_tag: "zh-CN",
            },
        operation_key: "create",
      },
    );
    const management = created.workspace_management_ref,
      work = VIDEO
        ? created.video_project.work_ref
        : {
            workspace_id: management.scope_ref.id,
            kind: "drama",
            object_id: created.created_workspace_ref.drama_project_id,
          };
    const pkg = await ok("hetu_plugins_inspect_package", {
      package_directory: packageDirectory,
    });
    const apply = async (action: string) =>
      ok("hetu_plugins_apply", {
        action,
        plugin_id: manifest.id,
        package_directory: packageDirectory,
        package_sha256: pkg.package_sha256,
        expected_sha256: (await ok("hetu_plugins_inspect")).state_sha256,
        authorization_note: "隔离验收固定包安装生命周期",
        operation_key: "installation-" + ++serial,
      });
    await apply("install");
    const binding = {
      management_ref: management,
      work_ref: work,
      plugin_id: manifest.id,
      package_sha256: pkg.package_sha256,
    };
    let cap = await ok("hetu_plugins_capabilities", binding);
    const actions = new Set<string>();
    const raw = async (action: string, args: any = {}) =>
      call("hetu_plugins_invoke", {
        ...binding,
        capabilities_sha256: cap.capabilities_sha256,
        action,
        arguments: args,
      });
    const invoke = async (action: string, args: any = {}) => {
      const outer = await raw(action, args);
      assert.equal(outer.status, "succeeded", JSON.stringify(outer));
      assert.equal(
        outer.data.result.status,
        "succeeded",
        JSON.stringify(outer.data.result),
      );
      actions.add(action);
      return outer.data.result.data;
    };
    const discover = async () => {
      cap = await ok("hetu_plugins_capabilities", binding);
      return cap;
    };
    const cli = (action: string, input: any) => {
      const r = spawnSync(
        path.join(bin, "hetu"),
        [
          "--client",
          "codex",
          "--collaboration-dir",
          env.HETU_COLLABORATION_DIR,
          "call",
          action,
          "--input",
          "-",
        ],
        {
          input: JSON.stringify(input),
          env,
          encoding: "utf8",
          timeout: 60000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      assert.equal(r.status, 0, r.stderr || r.stdout);
      return JSON.parse(r.stdout);
    };
    await writeFile(
      path.join(directory, "machine-context.json"),
      JSON.stringify({
        binding,
        capabilities_sha256: cap.capabilities_sha256,
        workspace: begin.target_path,
      }),
      { mode: 0o600 },
    );
    return {
      directory,
      workspace: begin.target_path,
      created,
      management,
      work,
      pkg,
      binding,
      get cap() {
        return cap;
      },
      tools,
      client,
      env,
      call,
      ok,
      raw,
      invoke,
      apply,
      discover,
      actions,
      cli,
    };
  } catch (error) {
    await client.close();
    throw error;
  }
}
