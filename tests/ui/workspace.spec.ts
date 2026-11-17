import { test, expect, _electron as electron } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { start, host } from "../support/machine.ts";
import { newProject, newNode, VIDEO } from "../../src/domain/model.ts";

const base = (r: any) => ({
  object_id: r.object.object_id,
  expected_revision: r.object.revision,
  expected_sha256: r.sha256,
  operation_key: crypto.randomUUID(),
});

test("真实Electron全幅阅读、专业专题、编辑恢复、冲突、导出及热插拔", async ({}, info) => {
  const c = await start();
  let app: any;
  try {
    const p = newProject("雨港旧站");
    p.constraints = "保留开放结局；已有剧情和候选按固定版本阅读。";
    Object.assign(p.nodes[0], {
      summary: "最后一班车即将进站，林溪带着迟到十年的旧信回到雨港。",
      detail:
        "## 末班车之前\n\n雨水沿着候车亭的玻璃流下。林溪终于认出守在站台的人。\n\n" +
        "河岸的灯光照亮了旧信上的字迹。".repeat(16),
      goal: "把旧信交给收件人",
      conflict: "收件人已经离开雨港",
      turn: "站长承认自己改过车站档案",
      start_state: "林溪只想交付一封信",
      end_state: "她决定等待另一个迟到的人",
    });
    p.nodes.push(
      {
        ...newNode("ep", "episode", "work", "第一集 暴雨来信"),
        summary: "站台相遇与候车亭争执",
        goal: "找出寄信人",
        turn: "落款日期早于邮局开业",
      },
      {
        ...newNode("scene", "scene", "ep", "候车亭的秘密"),
        summary: "陈舟交出车票",
        detail: "他撕掉了车票，将旧信交回林溪掌心。",
        goal: "让林溪留下",
        conflict: "林溪不相信解释",
        turn: "陈舟放弃离开",
      },
    );
    if (!VIDEO) {
      p.characters = [
        {
          id: "lin",
          name: "林溪",
          summary: "循着旧信回到雨港的调查者。",
          arc: [
            {
              node_id: "scene",
              state: "不信任",
              choice: "留下",
              cost: "错过末班车",
              knowledge: "信件并非来自过去",
            },
          ],
          archived: false,
        },
        {
          id: "chen",
          name: "陈舟",
          summary: "保守旧站秘密的人。",
          arc: [],
          archived: false,
        },
      ];
      p.relations = [
        {
          id: "r",
          from_id: "lin",
          to_id: "chen",
          description: "交换秘密",
          node_ids: ["scene"],
          archived: false,
        },
      ];
      p.clues = [
        {
          id: "letter",
          title: "旧信的日期",
          status: "open",
          placements: [
            { node_id: "scene", stage: "plant", notes: "日期早于邮局开业" },
          ],
          archived: false,
        },
      ];
    }
    let media: any;
    const refs: any[] = [];
    if (VIDEO) {
      media = await (async () => {
        throw new Error("此用例为剧本");
      })();
      refs.push(media.source);
      p.nodes[0].source_indices = [0];
      p.assets = [
        {
          id: "station",
          title: "旧站白模",
          role: "location",
          source_index: 0,
          notes: "程序媒体仅验证预览与技术链路",
          archived: false,
        },
      ];
      p.takes = [
        {
          id: "take",
          node_ids: ["scene"],
          purpose: "previs",
          status: "succeeded",
          provider: "local",
          model: "procedural",
          provider_task_id: null,
          request_key: "ui-take",
          request: {
            prompt: "灰色候车亭，核对空间与节奏。",
            aspect_ratio: "16:9",
            duration_ms: 2000,
            sound: "测试音频",
            asset_ids: ["station"],
            budget_micros: 0,
            currency: "CNY",
          },
          media_source_index: 0,
          technical_report: media.report,
          notes: "非最终画面。",
          archived: false,
        },
      ];
      p.edits = [
        {
          id: "edit",
          title: "旧站预演第一版",
          duration: 50,
          time_base: { num: 1, den: 25 },
          clips: [
            {
              id: "clip",
              take_id: "take",
              track: "video",
              source_start: 0,
              source_end: 2000,
              source_time_base: { num: 1, den: 1000 },
              output_start: 0,
              output_end: 50,
              output_time_base: { num: 1, den: 25 },
              speed_num: 1,
              speed_den: 1,
            },
          ],
          render_source_index: 0,
          notes: "技术链路",
          archived: false,
        },
      ];
      p.feedback = [
        {
          id: "feedback",
          edit_id: "edit",
          render_source_index: 0,
          stream_id: "video:0",
          start: 5,
          end: 25,
          time_base: { num: 1, den: 25 },
          origin: "agent",
          text: "核对前一秒节奏",
          status: "open",
          response: "",
          result_edit_id: null,
        },
      ];
      p.delivery = [
        {
          id: "d",
          source_index: 0,
          purpose: "video",
          relative_path: "media/previs.mp4",
          sha256: media.sha,
          size_bytes: media.bytes.length,
        },
      ];
    }
    let saved = await c.invoke("save_project", {
      content: p,
      source_refs: refs,
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "ui-save",
    });
    app = await electron.launch({
      executablePath: createRequire(path.join(host, "package.json"))(
        "electron",
      ),
      args: [path.join(host, "apps/desktop")],
      env: c.env,
    });
    await app.evaluate(({ dialog, clipboard }: any, workspace: string) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [workspace],
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
      let copied = "";
      clipboard.writeText = (value: string) => {
        copied = value;
      };
      clipboard.readText = () => copied;
    }, c.workspace);
    const shell = await app.firstWindow();
    await shell
      .getByRole("button", { name: "打开作品", exact: true })
      .first()
      .click();
    await shell
      .getByRole("button", {
        name: VIDEO ? "旧站视频验收" : "旧站剧本验收",
        exact: false,
      })
      .first()
      .click();
    const errors: string[] = [];
    app.context().on("page", (page: any) =>
      page.on("pageerror", (e: Error) => {
        errors.push(e.message);
        console.error(e.message);
      }),
    );
    const open = async () => {
      await shell
        .getByRole("button", {
          name: VIDEO ? "视听制作" : "剧本创作",
          exact: true,
        })
        .click();
      await expect
        .poll(() =>
          app
            .context()
            .pages()
            .some((w: any) => w.url().startsWith("hetu-plugin:")),
        )
        .toBe(true);
      const page = app
        .context()
        .pages()
        .find((w: any) => w.url().startsWith("hetu-plugin:"));
      await expect(page.getByRole("treeitem").first()).toBeVisible();
      return page;
    };
    let view = await open();
    await view.setViewportSize({ width: 1440, height: 960 });
    await expect(shell.locator(".workbench-topbar")).toHaveCount(0);
    await expect(shell.locator(".project-navigation")).toHaveCount(0);
    await expect(shell.locator(".plugin-page-navigation")).toHaveCount(0);
    const area = await shell.locator(".surface").boundingBox();
    expect(area!.x).toBe(0);
    expect(area!.y).toBe(0);
    await expect(
      view.getByRole("heading", { name: "雨港旧站", exact: true }),
    ).toBeVisible();
    const style = await view.evaluate(() => ({
      header: document.querySelector("header")!.getBoundingClientRect().height,
      background: getComputedStyle(document.body).backgroundImage,
      font: getComputedStyle(document.querySelector("article p")!).fontSize,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(style.header).toBeLessThanOrEqual(50);
    expect(style.background).toContain("gradient");
    expect(style.font).toBe("18px");
    expect(style.overflow).toBe(false);
    await view.screenshot({
      scale: "css",
      path: info.outputPath("light-wide.png"),
    });
    await view
      .getByRole("textbox", { name: "搜索结构" })
      .fill("找到不存在的人");
    await expect(view.getByText("没有符合条件的节点。")).toBeVisible();
    await view.getByRole("textbox", { name: "搜索结构" }).fill("");
    await view.getByRole("treeitem").first().focus();
    await view.keyboard.press("ArrowDown");
    await expect(
      view.getByRole("treeitem", { name: /第一集 暴雨来信/ }),
    ).toHaveAttribute("aria-selected", "true");
    await view.keyboard.press("Home");
    for (const [id, text] of VIDEO
      ? [
          ["assets", "素材"],
          ["takes", "制作"],
          ["edits", "剪辑"],
          ["feedback", "审片与返工"],
          ["delivery", "交付"],
        ]
      : [
          ["characters", "人物弧线"],
          ["relations", "关系与伏笔"],
          ["manuscript", "正文接续"],
        ]) {
      await view.getByRole("tab", { name: text, exact: true }).click();
      await view.screenshot({
        scale: "css",
        path: info.outputPath(id + "-light.png"),
      });
      if (id === "characters")
        await expect(
          view.getByRole("table", { name: "林溪的选择与代价" }),
        ).toContainText("错过末班车");
      if (id === "relations")
        await expect(
          view.getByRole("img", { name: "人物关系图" }),
        ).toBeVisible();
      if (id === "edits") {
        await expect(view.getByRole("img", { name: /时间线/ })).toBeVisible();
        await view.getByRole("button", { name: "播放固定成片" }).click();
        const video = view.locator("video");
        await expect(video).toBeVisible();
        await expect
          .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState))
          .toBeGreaterThanOrEqual(1);
        expect(
          await video.evaluate((el: HTMLVideoElement) => el.duration),
        ).toBeGreaterThan(1.9);
        await video.evaluate((el: HTMLVideoElement) => el.play());
        await expect
          .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
          .toBeGreaterThan(0.1);
        await view.screenshot({
          scale: "css",
          path: info.outputPath("media-playing.png"),
        });
        await view
          .getByRole("button", { name: "关闭预览", exact: true })
          .click();
      }
    }
    await view
      .getByRole("tab", { name: VIDEO ? "分镜" : "故事结构", exact: true })
      .click();
    await view.getByRole("button", { name: "编辑", exact: true }).click();
    await view
      .getByRole("textbox", { name: "目标", exact: true })
      .fill("本地稿：找到原寄信人");
    await view.getByRole("button", { name: "返回工作台" }).click();
    await expect(shell.locator(".workbench-topbar")).toBeVisible();
    const remote = {
      ...saved.object.content.nodes[0],
      goal: "外部稿：查清档案",
      conflict: "远端新增约束",
    };
    saved = await c.invoke("upsert_node", { ...base(saved), node: remote });
    // 窗口关闭期间远端更新；恢复稿必须保留最初固定基线。
    view = await open();
    await expect(
      view.getByRole("textbox", { name: "目标", exact: true }),
    ).toHaveValue("本地稿：找到原寄信人");
    await view.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      view.getByRole("region", { name: "原操作恢复" }),
    ).toBeVisible();
    await view
      .getByRole("button", { name: "比较当前版本", exact: true })
      .click();
    await expect(view.getByRole("dialog", { name: "版本冲突" })).toBeVisible();
    await view
      .getByRole("combobox", { name: "选择字段版本 goal", exact: true })
      .selectOption("local");
    await view.getByRole("button", { name: "以当前基线继续编辑" }).click();
    await expect(
      view.getByRole("textbox", { name: "冲突", exact: true }),
    ).toHaveValue("远端新增约束");
    await view.getByRole("button", { name: "保存", exact: true }).click();
    await expect(
      view.getByRole("textbox", { name: "目标", exact: true }),
    ).toHaveCount(0);
    await expect(
      view.getByText("本地稿：找到原寄信人", { exact: true }),
    ).toBeVisible();
    const latest = await c.invoke("get_project", {
      object_id: saved.object.object_id,
    });
    expect(latest.object.revision).toBe(saved.object.revision + 1);
    await view.getByRole("button", { name: "提意见", exact: true }).click();
    await view
      .getByRole("textbox", { name: "意见内容" })
      .fill("保留开放结局，补充角色选择的代价。");
    await view.getByRole("button", { name: "确认", exact: true }).click();
    await view.getByRole("tab", { name: "工作记录" }).click();
    await expect(
      view.getByText("保留开放结局，补充角色选择的代价。", { exact: true }),
    ).toBeVisible();
    const exportPath = path.join(c.directory, "fixed-project.md");
    await app.evaluate(({ dialog }: any, filename: string) => {
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: filename,
      });
    }, exportPath);
    await view.getByRole("button", { name: "导出", exact: true }).click();
    await expect(view.getByRole("status")).toContainText("完整固定版本已导出");
    expect(await readFile(exportPath, "utf8")).toContain(
      "本地稿：找到原寄信人",
    );
    await view.getByRole("button", { name: "让 AI 处理", exact: true }).click();
    await view
      .getByRole("textbox", { name: "当前目标" })
      .fill("依照当前固定方案接续下一轮");
    await view.getByRole("button", { name: "复制并继续" }).click();
    await expect(view.getByRole("status")).toContainText("已复制当前目标");
    const clipboard = await app.evaluate(({ clipboard }: any) =>
      clipboard.readText(),
    );
    expect(clipboard).toContain("management_ref");
    expect(clipboard).toContain("plugin_connection");
    expect(clipboard).toContain("当前创作工程");
    await view
      .getByRole("tab", { name: VIDEO ? "分镜" : "故事结构", exact: true })
      .click();
    await app.evaluate(({ webContents }: any) => {
      webContents
        .getAllWebContents()
        .find((w: any) => w.getURL().startsWith("hetu-plugin:"))
        ?.send("plugin:preferences", { theme: "dark", language: "zh-CN" });
    });
    await expect(view.locator("html")).toHaveAttribute("data-theme", "dark");
    await view.screenshot({
      scale: "css",
      path: info.outputPath("dark-wide.png"),
    });
    await view.setViewportSize({ width: 720, height: 800 });
    await view.getByRole("button", { name: "收起目录" }).click();
    await expect
      .poll(() =>
        view.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect(
      view.getByRole("heading", { name: "雨港旧站", exact: true }),
    ).toBeVisible();
    await view.screenshot({
      scale: "css",
      path: info.outputPath("dark-narrow.png"),
    });
    expect(errors).toEqual([]);
    await c.apply("disable");
    await expect(shell.locator(".workbench-topbar")).toBeVisible();
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((w: any) => w.url().startsWith("hetu-plugin:")),
      )
      .toBe(false);
    await writeFile(
      info.outputPath("acceptance.json"),
      JSON.stringify(
        {
          platform: process.platform,
          package_sha256: c.pkg.package_sha256,
          checks: [
            "real_electron_core",
            "full_width",
            "shared_gradient",
            "18px_reading",
            "all_topics",
            "tree_keyboard",
            "filter",
            "edit",
            "buffer_return_reopen",
            "CAS_three_way_merge",
            "author_feedback",
            "native_atomic_export",
            "trusted_handoff",
            "light_dark",
            "narrow",
            "hot_disable",
            ...(VIDEO ? ["fixed_media_playback"] : []),
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await app?.close();
    await c.client.close();
  }
});


test("首次使用空状态、取消、键盘焦点和创建后机器回读", async ({}, info) => {
  const c = await start();
  let app: any;
  try {
    app = await electron.launch({
      executablePath: createRequire(path.join(host, "package.json"))("electron"),
      args: [path.join(host, "apps/desktop")],
      env: c.env,
    });
    await app.evaluate(({ dialog }: any, workspace: string) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [workspace] });
    }, c.workspace);
    const shell = await app.firstWindow();
    await shell.getByRole("button", { name: "打开作品", exact: true }).first().click();
    await shell.getByRole("button", { name: VIDEO ? "旧站视频验收" : "旧站剧本验收", exact: false }).first().click();
    await shell.getByRole("button", { name: VIDEO ? "视听制作" : "剧本创作", exact: true }).click();
    await expect.poll(() => app.context().pages().some((p: any) => p.url().startsWith("hetu-plugin:"))).toBe(true);
    const view = app.context().pages().find((p: any) => p.url().startsWith("hetu-plugin:"));
    await expect(view.getByRole("heading", { name: VIDEO ? "开始视听制作" : "开始剧本创作" })).toBeVisible();
    await view.screenshot({ scale: "css", path: info.outputPath("first-use.png") });
    await view.getByRole("button", { name: "新建方案", exact: true }).click();
    const dialog = view.getByRole("dialog", { name: "新建方案" });
    await expect(dialog.getByRole("textbox", { name: "标题" })).toBeFocused();
    await expect(dialog.getByRole("button", { name: "确认", exact: true })).toBeDisabled();
    await dialog.getByRole("textbox", { name: "标题" }).fill("取消的草案");
    await view.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "确认", exact: true })).toBeFocused();
    await view.keyboard.press("Tab");
    await expect(dialog.getByRole("textbox", { name: "标题" })).toBeFocused();
    await view.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect((await c.invoke("list_projects", {})).objects).toEqual([]);
    await view.getByRole("button", { name: "新建方案", exact: true }).click();
    await dialog.getByRole("textbox", { name: "标题" }).fill("独立原创工程");
    await dialog.getByRole("button", { name: "确认", exact: true }).click();
    await expect(view.getByRole("heading", { name: "独立原创工程", exact: true })).toBeVisible();
    const listed = await c.invoke("list_projects", {});
    expect(listed.objects).toHaveLength(1);
    const record = await c.invoke("get_project", { object_id: listed.objects[0].object_id });
    expect(record.object.content.title).toBe("独立原创工程");
    expect(record.object.revision).toBe(1);
    expect(record.object.content.nodes).toHaveLength(1);
  } finally {
    await app?.close();
    await c.client.close();
  }
});
