---
name: hetu-screenplay
description: 通过河图稳定CLI/MCP使用剧本创作插件，复盘已有剧本、设计全作／分集／场次结构、人物弧线与伏笔，再接续宿主Fountain参考稿和返工。当作者选择此河图专业插件并需要持续推进创作工程时使用。
---

# 剧本创作

以作者当前目标和确切作品为范围。专业计划持续保存，实际正文、媒体和作者决定归宿主；不内置Agent，不把记录成功当成实际验收。

## 接入

1. 发现当前河图稳定CLI/MCP，使用作者指定的客户端与完整management_ref。确认WorkRef.kind=drama；无作品时经宿主独立创建，不强制上游作品。
2. plugins.inspect发现活动包`org.wordflowlab.screenplay`，再plugins.capabilities核验package_sha256、capabilities_sha256、专业动作、共享核心和方法。
3. plugins.invoke的绑定包含management_ref、work_ref、plugin_id、package_sha256、capabilities_sha256；action=skills.read，arguments={skill_id:screenplay}读取本包方法。不另装同名Codex插件、不新增MCP连接。
4. list_projects后get_project固定读取，长项目先summary、get_scope按节点读取；读取来源和现有实际成果，避免重复推断或生成。

## 流程

先读[剧本推进](references/workflow.md)。已有剧本先梳理原稿覆盖、过去的结构和未解线索，再提出新的全作方向。电影可直接到段落／场次，系列和短剧按需要使用季／集。人物弧线、关系和伏笔与节点关联。规划完成后通过宿主创建或读取正式分集，map_episode固定作者稿依据，再准备drama_draft或drama_revise任务、Fountain工作稿、意见和下一版，回读后比较；不自动采纳。

## 操作与恢复

- 参数以当前动作input_schema为准；字段和全部动作见[操作地图](references/operations.md)。普通作者不需要填写这些字段。
- 新建save_project为expected_revision=0、expected_sha256为空；更新携带固定expected_revision、expected_sha256与原operation_key。每次修改最多一次Core保存。
- 发出前保存完整请求；超时或unknown先get_operation。明确not_found才沿原键原输入继续。原键用于不同输入会失败，不能换键重发未知操作。
- CAS冲突读取固定旧版与当前版，比较作者取舍后再准备新输入，不能自动更新基线覆盖。节点和专业身份保留；归档代替删除，来源只追加不替换。
- export_project固定revision并按next_offset分块读取，UTF-8字节偏移使用返回值，不能把各次头版本拼接成历史导出。
- 安装、停用、升级后重新发现包；方法、Schema与动作必须同包摘要。未发现时明确报告，不猜测旧动作。

## 交接与验收

prepare_handoff固定方案、节点与目标。继续使用已发现的宿主核心动作；GUI只负责阅读、比较与反馈，业务不依赖窗口。

read_manuscript区分方案fixed_sources与当前正文及候选；参考稿提交不等于作者稿替换。先核对原文、约束、人物知识和未解线索；返工保留旧稿与意见，再回读Fountain结果。

采纳、定稿、成片认可、费用批准和外部副作用分别依据作者真实决定。不能用author_quote、succeeded或已提交字段冒充批准。
