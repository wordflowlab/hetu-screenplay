# 插件架构参考记录

采集日期：2026-11-17。以下为公开上游材料的可核验事实，产品采纳结论由本仓库架构文档维护。

| 来源 | 已核实事实 | 河图专业插件借鉴 |
| --- | --- | --- |
| [DeepSeek Harness README](https://github.com/deepseek-ai/deepseek-harness/blob/main/README.md) | everything-is-a-plugin，Cordis，dsh-plugin topic帮助发现 | 小包贡献、公开SDK及易分发；不以插件数量代替生态质量 |
| [DSH architecture](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/architecture.md) | 配置组合profiles／bundles；注册作为可撤销effect；Electron承载Web，插件与桌面发行依赖有明确边界 | 宿主统一生命周期、固定包与热插拔；专业领域不依赖具体承载框架 |
| [Pi extensions](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) | TypeScript工厂、工具Schema、事件、UI、显式reload与资源清理；npm/git包 | 简单模块、确定性参数和方法资源；状态与运行资源分开 |
| [小说规划插件](../../../hetu-novel-planner/README.md) | 本机源码中的受管对象、原键、固定引用与全幅阅读工作面 | 复用公开合同和阅读／比较／反馈旅程，不照搬卷章模型 |

DSH和Pi属于Agent运行时；河图属于创作工作台。河图不复制其Agent循环、模型供应商、会话日志或同名客户端插件安装方式。Cordis兼容不意味着业务API、工具语义或数据格式兼容，也不承诺直接加载任意DSH插件。专业插件需要实现河图当前host_api与贡献合同。
