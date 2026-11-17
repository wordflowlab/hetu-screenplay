# 剧本创作功能清单

专业动作、标准Skill和数据格式由本插件维护。外部Agent从河图稳定plugins.capabilities发现实际Schema，执行仍以当前安装包为准。

| 动作 | 用户目标 | 效果 |
| --- | --- | --- |
| `list_projects` | 查找方案 | 只读 |
| `get_project` | 读取固定方案 | 只读 |
| `get_scope` | 读取节点与关联 | 只读 |
| `save_project` | 保存完整方案 | 受管专业写入 |
| `upsert_node` | 创建或更新节点 | 受管专业写入 |
| `move_node` | 移动节点 | 受管专业写入 |
| `archive_node` | 归档或恢复节点 | 受管专业写入 |
| `reorder_nodes` | 重排兄弟节点 | 受管专业写入 |
| `fork_project` | 建立备选方案 | 受管专业写入 |
| `compare_versions` | 比较固定版本 | 只读 |
| `check_project` | 检查完整性 | 只读 |
| `export_project` | 导出固定方案 | 只读 |
| `prepare_handoff` | 准备精确AI交接 | 只读 |
| `get_operation` | 回读原操作 | 只读 |
| `add_note` | 追加意见或接续记录 | 受管专业写入 |
| `set_network` | 保存人物关系与伏笔 | 受管专业写入 |
| `map_episode` | 关联正式写作分集 | 受管专业写入 |
| `read_manuscript` | 回读实际分集正文 | 只读 |

共享核心通过公开SDK使用；专业方案不自动采用正文、认可成片或付费调用。安装启用后无独立插件授权。方法通过`skills.read`按需读取，不注册为同名Codex插件。预算为每方案512KiB、100项固定来源；范围读取和分块导出支持长内容，超限按固定来源拆分方案。
