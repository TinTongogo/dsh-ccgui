# DSH CCGUI v1.0.2 版本记录

**发布日期**：2026-11-08
**对比**：v1.0.1 → v1.0.2（8 个提交）

---

## ✨ 新功能

- **设置页版本记录**：CC GUI 设置新增「版本记录」页签，一个版本一页，用左右箭头或圆点翻看，当前运行的版本会标出来。
- **打包 Kimi CLI**（`e4c7281`）：Kimi Code 自带 `acp` 子命令，用固定版本 `npx -y @moonshot-ai/kimi-code@2.5.2 acp` 启动即可，不需要适配器。它排在 Claude Code 后面，顺序跟 desktop-cc-gui 的引擎顺序一致，图标取自 lobe-icons。已用真实账号验证，默认出现在切换器里。
- **模型座位接管每个会话**（`0e49cac`）：DSH 的模型座位把所有提供方（包括 CLI）放在同一个全局目录里，已启动的会话切不过去。现在插件对每个会话都提供自己的模型菜单——CLI 会话列 CLI 自己的模型，其他会话只列 DSH 自己运行的提供方，旁边配推理等级菜单。同名的 CLI 模型用说明或 id 区分，设置页的 CLI 列表会忘掉切换器已不再提供的提供方。
- **CLI 会话上报 token 用量**（`3ad336c`）：读取 ACP 每次 prompt 响应里的 `usage`，映射成 DSH 的 `TokenUsage`，在步骤的 finish 块之前发出，CLI 会话也能显示速度和缓存命中。ACP 与 DSH 对 input 的算法一致（都不含缓存读取），计数一一对应；一个步骤内由排队消息结束的多个 CLI 回合会求和。
- **设置页版本胶囊提示新版本**（`8ed33f1`）：读取 GitHub 最新 Release 并与当前版本比较，有更新时「版本」胶囊变成指向该 Release 说明的链接（`↑ vX.Y.Z`）。只接受 `x.y.z` 语义化版本，8 秒超时，链接限定在本仓库的 Release 页，检查失败时保持原样。
- **切换器里 harness 只列一条**（`18bb8db`）：所有非 CLI 提供方合并成一条「DeepSeek」，不再逐个列出——模型菜单已经覆盖它们。设置页的锁定、隐藏和旧偏好清理改为按「非 CLI 路由」判断，旧版本存下的每个提供方条目会被兼容处理。

## 🐛 问题修复

### 启动 CLI（Windows 与 macOS，`0b74f68`）

- **Windows 上 `.cmd` 启动器起不来**：DSH 不经过 `cmd.exe` 启动进程，npm / pnpm 安装的 `.cmd` 包装脚本直接 `spawn ENOENT`。插件按 `PATH` 和 `PATHEXT` 找到实际文件：`.exe` 直接运行；`.cmd` 读出它要运行的脚本和解释器，直接用解释器启动。解释器不一定是 `node`——OMP CLI 的 shim 里是 `bun`，而 npm 安装的 `bun` 本身也是 shim，所以解释器继续沿 `PATH` 查找，最多追 4 层。
- **macOS / Linux 从 Dock 启动时找不到 node**：此时只有 launchd 的 `PATH`，nvm、fnm、Volta 装的 node 不在里面，`npx` 系 CLI 会以退出码 127 失败。插件启动时在后台向登录 shell 读一次 `PATH`；读到之前或读取失败时，在原 `PATH` 后补上 Homebrew、nvm、Volta、bun 等常见目录。agent 配置的 `env.PATH` 写了就以配置为准。

### 启动失败提示（`c3e744c`）

- `npx` 拉取的适配器可能因为缓存半装坏而启动失败（缺可选依赖、下载中断），这时让用户重装是错的：`npx` 会一直复用那份坏缓存。现在启动失败原文命中 `Missing optional dependency`、`Cannot find module` 或 `ERR_MODULE_NOT_FOUND` 时，会认出 `<npm cache>/_npx/<hash>` 目录并提示删除后重试；没有具体目录时提示「安装不完整，请重新安装」；其他失败仍保留「请确认它已安装并完成登录」。

## 🔧 重构

- 模型菜单拆出 `menu-models.ts` 和 `effort-menu.tsx`，渲染行为不变（`0e49cac`）。
- 切换器的内置项判断从固定的 `deepseek-official` 改成 `isBuiltInChoice`，设置页锁定与偏好清理共用同一套规则（`18bb8db`）。

## 📄 文档

- 发版约定写进 AGENTS.md 与 README：推送 `v*` 标签触发 Release 工作流、npm Trusted Publishing、分支命名和常见坑（`68f43f4`）。
- README 补充 Kimi CLI 的 Node.js 22.19 要求与 `/login` 登录步骤、新模型菜单的行为说明（`e4c7281`、`0e49cac`）。

---

**贡献者**：zhukunpenglinyutong
