# hetu-screenplay

> 河图洛书剧本创作插件，供作者和外部Agent持续组织、审阅及接续创作工程。

## 简介

独立TypeScript／React插件，复用河图作品、修订和受管数据。Codex通过河图CLI/MCP动态发现并操作，界面用于阅读、比较和可选编辑。

## 角色分流

- 使用插件 → [功能清单](CAPABILITIES.md)
- 开发维护 → [完整文档](docs/README.md)
- 检查实现与验收 → [验收记录](docs/08-实施计划与验收记录.md)

## 快速上手

### 前置条件

Node.js 25.x；河图支持host_api=1、开放核心SDK及插件Skill发现。源码测试需要已构建的河图CLI/MCP和TypeScript插件运行时。

### 安装步骤

```bash
npm ci
npm run build
```

[获取v0.1.0发行包](https://github.com/wordflowlab/hetu-screenplay/releases/tag/v0.1.0)。解压后使用河图机器入口检查固定包摘要并安装；完整流程见[开发与上架](docs/09-开发发布与上架.md)。

### 运行启动

```bash
npm run check
npm run test:unit
npm run test:machine
npm run test:ui
```

## 配置 / 参数

HETU_SOURCE用于机器／桌面测试定位宿主源码，默认../../limecloud/hetu；生产插件通过宿主注入上下文，不读取环境变量或本机任意路径。

## 边界

专业计划不自动采纳正文、确认成片或调用付费模型。未知保留原键，固定版本回读；插件卸载不删除作品历史。
