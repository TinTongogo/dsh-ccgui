<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/illustrations/01-hero-dark.webp" />
  <img alt="DSH 截图：输入框旁的 CLI 菜单列出 Claude Code、Codex CLI、PI CLI、OMP CLI、OpenCode、CodeBuddy CLI" src="./assets/illustrations/01-hero-light.webp" />
</picture>

---
<div align="center"><a name="readme-top"></a>

<img width="120" alt="dsh-ccgui logo" src="./assets/logo.png" />

# DSH CCGUI

**在 DeepSeek Harness 里直接使用 Claude Code、Codex、PI、OMP 等 Agent CLI**

[![CI][ci-shield]][ci-link] [![Coverage][coverage-shield]][coverage-link] [![License][license-shield]][license-link] ![DSH][dsh-shield]

![][stars-shield] ![][forks-shield] ![][issues-shield] ![][contributors-shield]

[快速开始](#快速开始) · [功能](#功能) · [接入其他 CLI](#接入其他-cli) · [已知限制](#已知限制) · [开发](#开发)

</div>

在输入框旁选一个 CLI，就像用模型一样和它对话。工具调用、审批和改动摘要都走 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的原生界面。

---

## 快速开始

需要 DSH `>=0.2.2-rc.1 <0.3.0`，以及已安装并登录的 CLI。

| 功能 | Claude<br>Code | Codex<br>CLI | PI<br>CLI | OMP<br>CLI | Open<br>Code |
| --- | :---: | :---: | :---: | :---: | :---: |
| 真实账号验证 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 免安装（`npx` 自动拉取） | ✅ | ✅ | ✅ | 先装 `omp` | 先装 `opencode` |
| 会话中途换模型<br><sub>输入框右侧的模型菜单</sub> | ✅ | ✅ | ✅ | ✅ | ✅ |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/illustrations/02-install-dark.webp" />
  <img alt="在 DSH 的插件页点「添加插件」，对话框里输入 dsh-ccgui 后点「安装」" src="./assets/illustrations/02-install-light.webp" />
</picture>

1. 点 DSH 左侧栏的「插件」，再点右上角「添加插件」，输入 `dsh-ccgui`，点「安装」。
2. 提示“请重启 DSH 加载它”时，Cmd+Q 完全退出再打开，不要点“立即启用”，否则新旧代码混在一个进程里会启动失败。
3. 新建会话，点输入框 `+` 右边的 CLI 按钮选一个 CLI。

<details>
<summary>用命令行安装</summary>

```sh
# DSH 桌面版：先 Cmd+Q 完全退出，再用应用内置的 dsh 安装
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add dsh-ccgui@1.0.0

# DSH 命令行版（dsh web）
dsh plugin --profile web add dsh-ccgui@1.0.0
```

卸载把 `add ...` 换成 `remove dsh-ccgui`。

</details>

> [!TIP]
> 从源码安装时先 `pnpm install && pnpm run build`，再在「添加插件」里填仓库的本地路径（命令行则把 `dsh-ccgui@1.0.0` 换成仓库路径）；pnpm 的 peerDependencies 警告可以忽略。

<div align="right"><a href="#readme-top">返回顶部 ↑</a></div>

## 功能

### 切换 CLI 和模型

CLI 和模型各有一个菜单。模型菜单列出当前 CLI 真实可用的模型，第一项是它自己的默认模型，超过 4 项可搜索，中途换模型下一条消息生效。CLI 只能在发第一条消息前切换，要换就新建会话。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/illustrations/03-model-menu-dark.webp" />
  <img alt="Claude Code 和 Codex CLI 各自的模型菜单截图，第一项是 CLI 自己的默认模型，顶部可以搜索" src="./assets/illustrations/03-model-menu-light.webp" />
</picture>

<details>
<summary>细节</summary>

- 没安装的 CLI 也会列出来，发消息时提示无法启动。
- 选中 CLI 后插件才启动它询问模型，刚选中时菜单里只有它的名字，通常 1 秒左右换成真实列表；`npx` 启动的 CLI 第一次还要等下载。
- 费用和账号都走 CLI 自己的配置。比如 Codex 配了中转服务时，菜单里的模型不一定都能用，错误会原样显示。
- 只能在标准模式下使用。PTC 模式只接受 `run_code`，会提示切回标准模式。

</details>

### 变更面板

右侧栏「变更」把改动分成已暂存、未暂存、未跟踪，可以暂存、撤销、提交、推拉、切换分支，点开文件看行内 diff。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/illustrations/04-changes-dark.webp" />
  <img alt="变更面板截图：改动按已暂存、未暂存、未跟踪分组，旁边是一个文件的行内 diff" src="./assets/illustrations/04-changes-light.webp" />
</picture>

### 启动脚本

在会话标题栏保存常用命令，按工作目录分别记住。点一下在单独的终端标签里运行，再点会先关掉上一次的。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/illustrations/05-launch-scripts-dark.webp" />
  <img alt="启动脚本截图：会话标题栏的脚本菜单，和终端里运行中的 npm run dev" src="./assets/illustrations/05-launch-scripts-light.webp" />
</picture>

### 文件和终端

「工作区文件」里右键「添加到对话」，把 `@路径` 插到光标处；标题栏的终端按钮一键开关右侧栏终端。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/illustrations/06-workspace-tools-dark.webp" />
  <img alt="截图：文件右键菜单的「添加到对话」、插入输入框的 @路径，以及标题栏的终端按钮" src="./assets/illustrations/06-workspace-tools-light.webp" />
</picture>

### 会话状态

会话列表里每个会话前是它所用 CLI 的图标，回合进行中旁边多一个呼吸的蓝点。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/illustrations/07-session-status-dark.webp" />
  <img alt="会话列表截图：每个会话前是所用 CLI 的图标，运行中的会话旁有蓝点" src="./assets/illustrations/07-session-status-light.webp" />
</picture>

### CC GUI 设置

DSH 设置里的「CC GUI 设置」可以调整 CLI 菜单的顺序和开关，插件加的每项界面交互也能单独关掉，恢复 DSH 原样。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/illustrations/08-settings-dark.webp" />
  <img alt="CC GUI 设置截图：CLI 列表的顺序和开关，后面是界面交互的开关" src="./assets/illustrations/08-settings-light.webp" />
</picture>

<details>
<summary>细节</summary>

- 入口在左侧栏底部的设置，排在「插件市场」后面。设置保存在浏览器本地。
- DeepSeek 是内置模型提供方，始终保留，不能关闭。关掉的 CLI 不再出现在菜单里，行内标出「已关闭」。
- 「界面交互」页签可分别关闭：右侧栏默认打开工作区文件、会话顶部的终端按钮、启动脚本。
- 「更多功能」页签列出还没开放的功能（会话自动命名、WorkTree、Git 信息自动生成、增强提示词、AI 账号限额提示），目前只有说明。
- CodeBuddy CLI 尚未用真实账号验证，默认关闭，需要时在这里打开。
- 列出的 CLI 来自打开过的会话，第一次使用前先打开任一会话。

</details>

<div align="right"><a href="#readme-top">返回顶部 ↑</a></div>

## 审批与停止

> [!WARNING]
> **DSH 的沙箱管不到 CLI。** CLI 自己决定哪些操作要询问，它放行的操作不会弹审批。要拦住操作，请配置 CLI 自己的权限。

| CLI | 写文件和执行命令 | 按停止 |
| --- | --- | --- |
| Claude Code | auto 模式不询问；手动模式走 DSH 审批卡片 | 命令结束；**放到后台的命令继续跑** |
| Codex CLI | 不询问，直接执行 | 回合结束；**已启动的命令继续跑** |
| PI CLI | 不询问，直接执行 | 命令结束 |
| OMP CLI | 不询问，直接执行 | 回合结束 |
| OpenCode | 按它的权限配置询问，走 DSH 审批卡片 | 命令结束 |
| CodeBuddy CLI | 尚未验证 | 尚未验证 |

继续跑的后台命令在会话关闭时才结束。表中是默认配置下在一台机器上的实测结果，配置和版本不同结果也可能不同。

<details>
<summary>让 Claude Code / OpenCode 先询问再执行</summary>

Claude Code（项目的 `.claude/settings.json`，直接用 `claude` 时同样生效）：

```json
{ "permissions": { "defaultMode": "default" } }
```

OpenCode（项目的 `opencode.json`）：

```json
{ "permission": { "edit": "ask", "bash": "ask" } }
```

</details>

## 接入其他 CLI

在 profile 的 `cordis.patch.yml` 里加一个 agent，它就会出现在 CLI 菜单里。这段 `config` 会整体替换默认配置，所以默认的几个也要写上：

```yaml
- id: ccgui
  name: dsh-ccgui
  config:
    agents:
      - { id: claude, name: Claude Code, command: npx, args: [-y, '@agentclientprotocol/claude-agent-acp@0.101.0'] }
      - { id: codex, name: Codex CLI, command: npx, args: [-y, '@agentclientprotocol/codex-acp@2.5.0'] }
      - { id: pi, name: PI CLI, command: npx, args: [-y, 'pi-acp@0.0.34'] }
      - { id: omp, name: OMP CLI, command: omp, args: [acp] }
      - { id: opencode, name: OpenCode, command: opencode, args: [acp] }
      - { id: codebuddy, name: CodeBuddy CLI, command: codebuddy, args: [--acp] }
      - { id: kimi, name: Kimi, command: kimi, args: [acp] }
```

> [!TIP]
> 用 `npx` 启动时请写死版本号。这样从第二次起插件会直接运行已缓存的包，省掉 `npx` 每次向 npm 询问的时间（实测 Pi 要多等 4 到 26 秒）。不要用 `--prefer-offline`：缓存元数据旧于固定版本时会启动失败，还会通过环境变量影响 Agent 在你项目里跑的 npm 命令。

<div align="right"><a href="#readme-top">返回顶部 ↑</a></div>

## 已知限制

- 不支持 `/compact`、fork、回滚和运行中插话；运行中发的消息会排队到这一轮结束。
- 只转发文本和你自己写的消息、定时任务；图片和 DSH 写给自己模型的提醒不会发给 CLI。
- 上下文用量显示不准，因为 CLI 自己管理上下文。
- 每个打开的会话占一个 CLI 进程，会话关闭或 DSH 退出时才结束。

<details>
<summary>更多限制</summary>

- `/model` 命令和 DeepSeek 等提供方的模型菜单仍会列出所有提供方。不要用它们在同一会话里在 DeepSeek 和 CLI 之间切换：切到 CLI 时它没有之前的上下文，切出时压缩摘要可能失败。同一 CLI 内换模型没问题。
- 每次启动 DSH 后第一次用到某个 CLI，会短暂启动它询问模型。临时会话放在 DSH 主目录的 `ccgui/model-probe`；能删的会删掉，OMP 只支持关闭，每次会留下约 4KB 记录。
- CLI 启动的时间上限是 `startTimeoutMs`，默认 120 秒。Claude Code 的适配器连同依赖约 400MB，实测第一次启动约 100 秒，网速慢时要先调大。
- CodeBuddy CLI 要先登录或配好 API Key，否则提示 `Authentication required`。
- “默认”后面的模型名按用户级配置询问得到，项目配置（比如 `opencode.json`）指定了别的模型时名字可能对不上，但实际仍按 CLI 的设置走。
- Codex 按停止后已启动的命令留在后台，DSH 退出时才清理，ACP 没有提供停止它们的办法。Claude Code 会把预计超过 10 分钟的命令放到后台，同样如此；它也拒绝单独的 `sleep`。
- 失败那一轮的消息不会自动补发（见[工作原理](#工作原理)），需要重新发送。
- CLI 的错误原文会显示并进入会话日志，可能带路径等信息。
- 折叠行显示内部名 `cli_tool`，状态文字仍是 DSH 的“深度求索中”。

</details>

## 工作原理

CLI 注册为 DSH 的模型提供方，不需要改 agent loop。一轮 CLI 回合跨越多个 DSH 步骤：每遇到工具调用就结束这一步，CLI 上报结果后下一步接着读。工具都由 CLI 自己执行，DSH 侧只做记录。

<details>
<summary>展开细节</summary>

- `cli_tool` 只负责记录，只对 CLI 的步骤开放，名字也不和任何真工具相同，不会把命令再执行一遍。
- Claude Code 不上报“运行中”。插件在命令的上报停下 1 秒后就显示它，否则长命令运行时界面一片空白。其他工具要等询问审批或完成时才显示，避免冻结一张没有 diff 的卡片。
- 模型列表来自 ACP 的 `configOptions`。它只在会话上报告，所以第一次选中某个 CLI 时插件会开一个临时会话询问，不发消息、不调用模型，清理放在后台。没选过的 CLI 不会被启动。换模型在每轮开始前用 `session/set_config_option`。
- 写死版本且已缓存的 `npx` 包直接运行；缓存不完整、版本不符、`.npmrc` 改过缓存目录或在 Windows 上时仍交给 `npx`。
- 权限请求转给 DSH 审批界面。CLI 的会话 ID 存在会话日志里，重启后优先用 `session/resume` 接回。
- 一条用户消息最多发给 CLI 一次，重发可能让它重复做事，所以重试是关闭的。
- DSH 这一轮一结束（包括在两步之间按停止），插件就取消 CLI 的回合并丢弃剩余输出。

</details>

## 账号和条款

插件不处理登录、不接触 token，只沿用 CLI 已有的登录状态。各 CLI 的订阅账号能否在第三方工具里使用，以它们自己的条款为准。

DSH 启动 CLI 时会去掉名字含 `KEY`、`PASSWORD`、`SECRET`、`TOKEN` 的环境变量，`ANTHROPIC_API_KEY` 这类变量要写在 agent 配置的 `env` 里。

<details>
<summary>关于 Claude Code</summary>

- **依赖**：经 [claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp)（Apache-2.0）运行，它基于 Claude Agent SDK。SDK 不是开源协议，本插件没有依赖或打包它，是 `npx` 在你机器上从 npm 下载的。
- **账号**：登录订阅账号时，用量[计入订阅额度](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)。Anthropic 的[条款](https://code.claude.com/docs/en/legal-and-compliance)要求基于 Agent SDK 开发产品的开发者使用 API Key，不允许代用户通过订阅凭据发送请求，并保留不经通知采取措施的权利。分发带这个默认项的版本前请先确认。
- **图标**：Claude 图标和 CC GUI 相同，图形来自 lobe-icons。条款允许纯文本提及 Claude Code，其他方式使用 Anthropic 的名称和 Logo 需要书面许可，分发前请一并确认。

</details>

<div align="right"><a href="#readme-top">返回顶部 ↑</a></div>

## 开发

```sh
pnpm test            # 单元和集成测试
pnpm run coverage
pnpm run typecheck
```

<details>
<summary>端到端测试</summary>

驱动真实的 DSH Web 界面，全程隔离在 `/tmp` 并关闭遥测。需要一份已构建的 DSH 源码（没有 `.git` 时构建要加 `DSH_CLIENT_COMMIT_HASH=0000000`）：

```sh
export DSH_REPO=/path/to/deepseek-harness
export CHROMIUM_PATH=/path/to/chromium   # Playwright 自带的浏览器版本不匹配时才需要

e2e/start-server.sh &             # 另开一个终端也可以
node e2e/fake-cli.mjs             # 脚本化的假 CLI，结果确定

# 真实 CLI，会消耗对应账号的额度，只发几条短消息。选一个便宜的模型：
E2E_CLI='Claude Code' E2E_CLI_ID=claude E2E_MODEL='Haiku 5.5' node e2e/real-cli.mjs
E2E_CLI='Codex CLI' E2E_CLI_ID=codex E2E_KEEPS_BACKGROUND_COMMANDS=1 node e2e/real-cli.mjs
E2E_CLI='PI CLI' E2E_CLI_ID=pi E2E_MODEL='deepseek/DeepSeek V4.1 Flash' node e2e/real-cli.mjs
E2E_CLI='OMP CLI' E2E_CLI_ID=omp node e2e/real-cli.mjs
E2E_CLI=OpenCode E2E_CLI_ID=opencode E2E_MODEL='opencode/DeepSeek V4.1 Flash Free' node e2e/real-cli.mjs
E2E_CLI='CodeBuddy CLI' E2E_CLI_ID=codebuddy node e2e/real-cli.mjs   # 要先登录

# 停掉服务后重启，验证恢复会话、且不重放失败的消息：
e2e/start-server.sh --keep &
E2E_CLI_ID=opencode node e2e/real-cli-resume.mjs   # 每个 CLI 各跑一次
node e2e/fake-cli-resume.mjs
```

真实 CLI 的测试会在它们各自的历史里留下几条工作目录在 `/tmp` 下的会话。

</details>

## 贡献者

<a href="https://github.com/zhukunpenglinyutong/dsh-ccgui/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=zhukunpenglinyutong/dsh-ccgui" alt="Contributors" />
</a>

<details>
<summary><kbd>Star History</kbd></summary>

[![Star History Chart](https://star-history.dera.page/svg?repos=zhukunpenglinyutong/dsh-ccgui&type=date&legend=top-left)](https://star-history.dera.page/#zhukunpenglinyutong/dsh-ccgui&type=date&legend=top-left)

</details>

---

## 协议

MIT。`src/stdio-transport.ts` 改编自 DSH 的 `subagent-acp`（同为 MIT），见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。ACP 行为依据[公开规范](https://agentclientprotocol.com/protocol/overview)和对真实 CLI 的抓包实现。

<!-- LINK GROUP -->

[ci-shield]: https://img.shields.io/github/actions/workflow/status/zhukunpenglinyutong/dsh-ccgui/ci.yml?branch=main&label=CI&labelColor=black&style=flat-square
[ci-link]: https://github.com/zhukunpenglinyutong/dsh-ccgui/actions/workflows/ci.yml
[coverage-shield]: https://img.shields.io/codecov/c/github/zhukunpenglinyutong/dsh-ccgui?label=coverage&labelColor=black&style=flat-square
[coverage-link]: https://codecov.io/gh/zhukunpenglinyutong/dsh-ccgui
[license-shield]: https://img.shields.io/github/license/zhukunpenglinyutong/dsh-ccgui?color=white&labelColor=black&style=flat-square
[license-link]: ./LICENSE
[dsh-shield]: https://img.shields.io/badge/DSH-%3E%3D0.2.2--rc.1%20%3C0.3.0-4d6bfe?labelColor=black&style=flat-square
[stars-shield]: https://img.shields.io/github/stars/zhukunpenglinyutong/dsh-ccgui?color=ffcb47&labelColor=black&style=flat-square
[forks-shield]: https://img.shields.io/github/forks/zhukunpenglinyutong/dsh-ccgui?color=8ae8ff&labelColor=black&style=flat-square
[issues-shield]: https://img.shields.io/github/issues/zhukunpenglinyutong/dsh-ccgui?color=ff80eb&labelColor=black&style=flat-square
[contributors-shield]: https://img.shields.io/github/contributors/zhukunpenglinyutong/dsh-ccgui?color=c4f042&labelColor=black&style=flat-square
