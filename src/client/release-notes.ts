/**
 * The release notes the settings page's 版本记录 tab pages through, newest first. They live
 * as data rather than as the repository's `RELEASE_NOTES_v*.md` files because the client is a
 * browser bundle with no markdown reader, and this tab should read the same offline.
 * @module dsh-ccgui/client/release-notes
 */

/** One line of a release's notes; the optional `title` is the bold lead-in. */
export interface ReleaseNoteItem {
  readonly title?: string
  readonly text: string
}

/** One heading and its lines. */
export interface ReleaseNoteSection {
  /** The category, e.g. `✨ 新功能`, as the release notes file writes it. */
  readonly heading: string
  readonly items: readonly ReleaseNoteItem[]
}

/** One page of the 版本记录 tab. */
export interface ReleaseNote {
  /** Without the leading `v`, like package.json's version. */
  readonly version: string
  /** The release date, ISO-shaped like the notes file's 发布日期. */
  readonly date: string
  readonly sections: readonly ReleaseNoteSection[]
}

/** In display order: the first page is the newest release. */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.0.3',
    date: '2026-11-09',
    sections: [
      {
        heading: '🐛 问题修复',
        items: [
          {
            title: 'Windows 上 npx 系 CLI 起不来',
            text: 'Node.js 安装包自带的 `npx.cmd` 把路径存在变量里，插件之前解析不出来，Claude Code、Codex、Kimi、PI 都报「无法在不经过命令行的情况下启动 npx.cmd」。现在能认出这种写法，用旁边的 `node.exe`（或 `PATH` 里的 node）直接运行 `npx-cli.js`。',
          },
          {
            title: '升级提示',
            text: '之前为了绕过这个问题在 `cordis.patch.yml` 里改成 `cmd /c npx ...` 的，升级后可以删掉那段配置、恢复默认，否则收不到以后的适配器版本更新。',
          },
        ],
      },
    ],
  },
  {
    version: '1.0.2',
    date: '2026-11-08',
    sections: [
      {
        heading: '✨ 新功能',
        items: [
          {
            title: '设置页版本记录',
            text: 'CC GUI 设置新增「版本记录」页签：一个版本一页，用左右箭头或圆点翻看每个版本的更新说明，当前运行的版本会标出来。',
          },
          {
            title: '打包 Kimi CLI',
            text: 'Kimi Code 自带 `acp` 子命令，用固定版本 `npx -y @moonshot-ai/kimi-code@2.5.2 acp` 启动，不需要适配器；真实账号已验证。',
          },
          {
            title: '模型座位接管每个会话',
            text: 'CLI 会话列 CLI 自己的模型，其他会话只列 DSH 自己运行的提供方，旁边是推理等级菜单；同名的模型用说明或 id 区分。',
          },
          {
            title: 'CLI 会话上报 token 用量',
            text: '把 ACP 每次响应里的 usage 映射成 DSH 的 TokenUsage，CLI 会话也能显示速度和缓存命中。',
          },
          {
            title: '设置页提示新版本',
            text: '有更新的 Release 时，版本胶囊变成指向该 Release 说明的链接。',
          },
          {
            title: '切换器里 harness 只列一条',
            text: '所有非 CLI 提供方合并成一条「DeepSeek」，不再逐个列出。',
          },
        ],
      },
      {
        heading: '🐛 问题修复',
        items: [
          {
            title: 'Windows 上 `.cmd` 启动器起不来',
            text: '读出 shim 里的脚本和解释器直接运行；解释器不一定是 node，会沿 `PATH` 最多追 4 层。',
          },
          {
            title: 'macOS / Linux 从 Dock 启动时找不到 node',
            text: '启动时向登录 shell 读一次 `PATH`，读到之前补上常见安装目录，`npx` 系 CLI 不再以退出码 127 失败。',
          },
          {
            title: 'npx 缓存不完整时给出正确提示',
            text: '认出 `_npx` 缓存目录并提示删除后重试，而不是让用户重装。',
          },
        ],
      },
      {
        heading: '🔧 重构',
        items: [
          { text: '模型菜单拆出 `menu-models.ts` 和 `effort-menu.tsx`，渲染行为不变。' },
          { text: '切换器的内置项判断改为 `isBuiltInChoice`，设置页锁定与偏好清理共用同一套规则。' },
        ],
      },
      {
        heading: '📄 文档',
        items: [
          { text: '发版约定写进 AGENTS.md 与 README。' },
          { text: 'README 补充 Kimi CLI 的 Node.js 22.19 要求与登录步骤。' },
        ],
      },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-11-08',
    sections: [
      {
        heading: '🐛 问题修复',
        items: [
          {
            title: '设置页 GitHub 链接指向错误的仓库',
            text: 'GitHub 胶囊原本打开 desktop-cc-gui，现在指向本插件仓库；测试改为从 `package.json` 读仓库地址，避免再次漂移。',
          },
        ],
      },
      {
        heading: '🔧 维护',
        items: [{ text: '发布改用 npm Trusted Publishing，靠 `release.yml` 的 OIDC 身份发布，不再保存令牌。' }],
      },
      {
        heading: '📄 文档',
        items: [{ text: 'README 调整功能表位置并更新包描述。' }],
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-11-08',
    sections: [
      {
        heading: '✨ 新功能',
        items: [
          {
            title: '接入 Agent CLI',
            text: 'Claude Code、Codex CLI、PI CLI、OMP CLI、OpenCode、CodeBuddy CLI 经 ACP 注册成 DSH 的模型提供方，工具调用、审批和改动都走 DSH 原生界面。',
          },
          {
            title: 'CLI 与模型菜单',
            text: '输入框旁切换 CLI；模型菜单列出 CLI 真实可用的模型，会话中途换模型下一条消息生效。',
          },
          {
            title: '变更面板',
            text: '右侧栏把改动分成已暂存、未暂存、未跟踪，可以暂存、撤销、提交、推拉、切换分支，点开文件看行内 diff。',
          },
          {
            title: '启动脚本与终端',
            text: '会话标题栏保存常用命令，一键在终端标签里运行；标题栏的终端按钮开关右侧栏终端。',
          },
          {
            title: '文件和会话状态',
            text: '工作区文件右键「添加到对话」插入 `@路径`；会话列表显示所用 CLI 的图标和运行中的蓝点。',
          },
          {
            title: 'CC GUI 设置',
            text: 'CLI 菜单的顺序和开关、界面交互开关、更多功能预告都集中在一个设置页里。',
          },
        ],
      },
    ],
  },
]
