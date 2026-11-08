# AGENTS.md

DSH 插件：把外部 agent CLI（Claude Code、Codex、OpenCode 等）通过 ACP 接成 DeepSeek Harness 的会话。用户文档见 README.md。

## 完成标准

一项改动只有满足下面全部条件才算做完：

1. `pnpm check` 通过（格式、类型、lint、架构、死代码、类型覆盖率、测试覆盖率）。
2. 改了 `src/` 就跑 `pnpm build`。
3. 改了行为就在 `tests/` 里补测试或调整测试；修 bug 先写一个能复现的失败测试。
4. 改了 `src/client/` 的界面或交互，跑 `node e2e/fake-cli.mjs`（启动方式见 README 的「开发」一节）。跑不了就明确说出来，不要声称已验证。

## 检查不通过时

改代码，不改规则。

- 不要为了让检查通过去修改 `eslint.config.js`、`tsconfig*.json`、`.dependency-cruiser.cjs`、`knip.json`、`vitest.config.ts` 里的阈值、`lefthook.yml`、`.github/workflows/`。确实觉得规则不对，停下来说明理由，等用户决定。
- 不要用 `git commit --no-verify` 或 `git push --no-verify` 绕过钩子。
- 不要用 `any`、`as unknown as X`、非空断言 `!`、`@ts-ignore`、`@ts-expect-error` 来消除类型错误。
- 不要删测试，不要加 `.skip` / `.only`，不要靠降低覆盖率门槛过关。
- `eslint-disable` 只在规则对这段代码确实不成立时使用：一次只针对一行、写明具体规则，并用 `-- 理由` 说明原因（lint 会强制检查）。

## 架构边界（`pnpm arch` 强制）

- `src/client/` 会被打包进浏览器：只能依赖 `src/client/**` 和 `src/constants.ts`，不能用 Node 内置模块。
- Node 端代码不能依赖 `src/client/`；`src/` 不能依赖 `tests/`。
- `react`、`react-dom`、`@deepseek-ai/dsh-client-ui-primitives` 由宿主在运行时提供（类型声明在 `src/client/host.d.ts`），不要加进 dependencies。
- `@deepseek-ai/*` 是 peerDependencies；其中 `dsh-*` 包的版本范围要和 `engines.dsh` 保持一致。

## 代码约定

工具检查不到、但这个代码库一直遵守的写法：

- **不可变**：状态更新一律生成新对象、新数组、新 Set（`this.items = [...this.items, item]`），不要 `push` / `splice` / 直接修改参数。
- **相对导入带 `.ts` 扩展名**：`import { x } from './foo.ts'`。
- **语言**：代码注释用英文；面向用户的文字（错误信息、界面文案）用中文。
- **注释写「为什么」**：说明约束、时序和取舍，不复述代码在做什么。
- **错误**：交给宿主的错误抛 `LlmError(message, code)`，并带上 `{ cause }`；`catch` 的参数写成 `error: unknown`。不要写空的 `catch`，有意忽略的错误要在函数体里注释原因。
- **常量**：超时、限制、文案等提成具名常量放在文件顶部。

## 模块与体量

lint 强制的上限：源码单文件 500 行、测试单文件 800 行（都不计空行和注释），函数 50 行、参数 4 个、嵌套 4 层、圈复杂度 20。

- **动手前先看体量**：改一个文件前跑 `pnpm size`。文件已经标为 `SPLIT SOON`（≥ 400 行），先把一块独立职责拆出去，再加新代码；不要等撞到 500 行的上限才拆。
- **按职责拆，不按行数切**：一个类的私有字段如果能分成几组、每组只被固定几个方法使用，每一组就是一个该独立出去的协作对象（参考 `src/session/` 里从 `CliSession` 拆出来的模块）。不要拆成 `part1` / `part2`、`utils2` 这类没有含义的文件。
- **新文件**：一个文件只做一件事，开头写 `@module` 文档注释说清它负责什么；拆出来的模块要有直接针对它的测试，或者能被现有测试完整覆盖（看 `pnpm coverage`）。
- **对外接口不变**：拆分时保持原模块的导出不变（需要时重新导出），调用方和现有测试不跟着改。

### 模块地图

| 位置 | 职责 |
|---|---|
| `src/index.ts` | 插件入口：配置 schema，把各部分接到宿主的 llm / agents / subprocess / tools 服务 |
| `src/cli-session.ts` | 一个会话的总调度：启动、准备 step、把 CLI 事件接到下面各模块 |
| `src/session/` | `CliSession` 的协作对象：连接（connect）、回合队列（turn-queue）、工具镜像（tool-mirror、drive-tool）、权限队列（permission-queue）、模型（model-state）、读取 step（read-step）、结束原因（outcomes） |
| `src/stdio-transport.ts`、`src/transport.ts` | ACP 传输：子进程和协议细节 |
| `src/session-registry.ts`、`src/adapter.ts`、`src/cli-tool.ts` | 会话注册、作为模型提供方接入、镜像工具 |
| `src/client/` | 浏览器端 UI：CLI 切换器、模型菜单、图标 |

### 新增一个 CLI

1. `cordis.patch.yml` 的 `agents` 里加一条（`id`、`name`、`command`、`args`），`npx` 拉取的适配器要锁定版本。
2. `src/client/provider-marks.ts` 的 `OWN_MARKS` 和 `ProviderMarkId` 里加上它的 id。
3. `src/client/marks.tsx` 里画它的图标。
4. `tests/cli-registry-consistency.test.ts` 会检查前三步是否一致，漏了哪一步它会直接说出来。
5. 在 README 开头的 CLI 状态表和「审批与停止行为」表里补上实测结果，没测过就写「尚未验证」。

只要 CLI 通过 ACP 通信，就不需要写针对它的代码。行为上的差异按行为处理（参考 `src/tool-record.ts` 对代码块外壳的处理），不要写 `if (cli === 'xxx')`。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm check` | 全量门禁，push 前和 CI 都会跑 |
| `pnpm lint:fix` / `pnpm format` | 自动修复 lint 和格式问题 |
| `pnpm test` / `pnpm coverage` | 测试 / 测试加覆盖率 |
| `pnpm size` | 列出接近或超过行数上限的源码文件（`--all` 列出全部） |
| `pnpm mutation` | 变异测试，检验测试是否真的能发现错误（较慢，不在门禁里） |
| `pnpm build` | 构建 `lib/` |
