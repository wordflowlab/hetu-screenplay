# 操作地图

执行前读取当前能力Schema。本表由构建从清单生成。

| 动作 | 用途 | 必填参数 | 效果 |
| --- | --- | --- | --- |
| `list_projects` | 查找方案 |  | read |
| `get_project` | 读取固定方案 | `object_id` | read |
| `get_scope` | 读取节点与关联 | `object_id`, `node_id` | read |
| `save_project` | 保存完整方案 | `expected_revision`, `expected_sha256`, `operation_key`, `content`, `source_refs` | managed_write |
| `upsert_node` | 创建或更新节点 | `object_id`, `expected_revision`, `expected_sha256`, `operation_key`, `node` | managed_write |
| `move_node` | 移动节点 | `object_id`, `expected_revision`, `expected_sha256`, `operation_key`, `node_id`, `parent_id` | managed_write |
| `archive_node` | 归档或恢复节点 | `object_id`, `expected_revision`, `expected_sha256`, `operation_key`, `node_id`, `archived` | managed_write |
| `reorder_nodes` | 重排兄弟节点 | `object_id`, `expected_revision`, `expected_sha256`, `operation_key`, `parent_id`, `node_ids` | managed_write |
| `fork_project` | 建立备选方案 | `object_id`, `revision`, `title`, `operation_key` | managed_write |
| `compare_versions` | 比较固定版本 | `object_id`, `from_revision`, `to_revision` | read |
| `check_project` | 检查完整性 | `object_id` | read |
| `export_project` | 导出固定方案 | `object_id`, `revision`, `format` | read |
| `prepare_handoff` | 准备精确AI交接 | `object_id`, `revision`, `node_id`, `goal` | read |
| `get_operation` | 回读原操作 | `operation_key` | read |
| `add_note` | 追加意见或接续记录 | `object_id`, `expected_revision`, `expected_sha256`, `operation_key`, `note` | managed_write |
| `set_network` | 保存人物关系与伏笔 | `object_id`, `expected_revision`, `expected_sha256`, `operation_key`, `characters`, `relations`, `clues` | managed_write |
| `map_episode` | 关联正式写作分集 | `object_id`, `expected_revision`, `expected_sha256`, `operation_key`, `node_id`, `episode_id` | managed_write |
| `read_manuscript` | 回读实际分集正文 | `object_id`, `node_id` | read |
