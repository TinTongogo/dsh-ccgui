# DSH CCGUI v1.0.3 版本记录

**发布日期**：2026-11-09
**对比**：v1.0.2 → v1.0.3（2 个提交）

---

## 🐛 问题修复

### Windows 上 npx 系 CLI 起不来

- **Node.js 自带的 `npx.cmd` 无法启动**：v1.0.2 只认得 `npm install -g` 生成的 shim（`"%_prog%" "%dp0%\xxx.js" %*`），而 Node.js 官方安装包（以及 nvm-windows、fnm）放在 node.exe 旁边的 `npx.cmd` 把路径先存进变量，最后一行是 `"%NODE_EXE%" "%NPX_CLI_JS%" %*`。插件解析不出来，Claude Code、Codex、Kimi、PI 这些用 `npx` 启动的 CLI 都报「无法在不经过命令行的情况下启动 …\npx.cmd」（v1.0.1 及更早版本报 `spawn npx ENOENT`）。现在插件也认得这种写法：先找 `npx.cmd` 旁边的 `node.exe`，没有再从 `PATH` 里找 `node`，直接运行同目录下的 `npx-cli.js`。
- 原版 `npx.cmd` 在全局升级过 npm 时会改用新版 npx，这一步需要先运行一次 node 才能查到，插件跳过了，固定用 Node 自带的 npx，启动的是同一个包。

### 升级提示

如果之前为了绕过这个问题，在 `cordis.patch.yml` 里把 CLI 改成了 `cmd /c npx ...` 或 `node.exe npx-cli.js ...`，升级后可以删掉这段配置、恢复默认：自定义的 agents 会整体替换插件的默认列表，留着就收不到以后的适配器版本更新。
