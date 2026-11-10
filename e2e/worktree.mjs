// 新建 Worktree from a workspace's context menu, against the e2e server's git workspace.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { E2E_ROOT, openHarness, WORKSPACE } from './lib.mjs'

const { page, sleep, bodyText, shot, until, newSession, scenario, finish } = await openHarness()
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
// git reports real paths, and on macOS /tmp is a link to /private/tmp.
const WORKTREES = join(realpathSync(dirname(WORKSPACE)), 'default-workspace-worktrees')
const ORIGIN = join(E2E_ROOT, 'origin.git')
const dialog = () => page.getByRole('dialog', { name: '新建 Worktree' })
const untilText = (text, timeout) => until(async () => (await bodyText()).includes(text), `text "${text}"`, timeout)
const group = () => page.locator('[data-ccgui-worktrees]')
const groupHeader = (count) => group().getByRole('button', { name: `Worktrees · ${String(count)}` })
const worktreeRow = (branch) => group().getByRole('treeitem', { name: branch, exact: true })
/** The worktree's own workspace row, which should have left the top level. */
const topLevelRow = (title) => page.locator('[data-row-key^="workspace:"]').filter({ hasText: title })

async function openWorktreeDialog() {
  // The harness shows the default workspace under a localized name; its folder is default-workspace.
  const row = page.locator('[data-row-key^="workspace:"]').filter({ hasText: '默认工作区' }).first()
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '新建 Worktree…' }).click()
  await dialog().getByText('基于仓库 default-workspace').waitFor({ timeout: 15_000 })
}

// A remote with a pull request head, the way GitHub publishes one under refs/pull/.
function seedPullRequest() {
  if (existsSync(ORIGIN)) return git(E2E_ROOT, 'ls-remote', ORIGIN, 'refs/pull/1/head').split('\t')[0]
  git(E2E_ROOT, 'init', '-q', '--bare', ORIGIN)
  git(WORKSPACE, 'remote', 'add', 'origin', ORIGIN)
  const contributor = join(E2E_ROOT, 'contributor')
  mkdirSync(contributor, { recursive: true })
  git(WORKSPACE, 'push', '-q', 'origin', 'HEAD:refs/heads/main')
  git(ORIGIN, 'symbolic-ref', 'HEAD', 'refs/heads/main')
  git(E2E_ROOT, 'clone', '-q', ORIGIN, contributor)
  git(
    contributor,
    '-c',
    'user.email=e2e@example.invalid',
    '-c',
    'user.name=e2e',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'pr',
  )
  git(contributor, 'push', '-q', 'origin', 'HEAD:refs/pull/1/head')
  return git(contributor, 'rev-parse', 'HEAD')
}

await scenario('worktree: the workspace menu opens the dialog with the current branch as base', async () => {
  await newSession('标准模式')
  await sleep(1000)
  await openWorktreeDialog()
  // Past the dialog's fade-in, so the screenshot shows it settled.
  await sleep(600)
  await shot('worktree-dialog')
  const base = await dialog().getByLabel('基于（base）').inputValue()
  if (base !== git(WORKSPACE, 'branch', '--show-current')) throw new Error(`base is "${base}"`)
})

await scenario('worktree: a new branch becomes a workspace with a session open in it', async () => {
  await dialog().getByLabel('分支名').fill('e2e/new-branch')
  const placeholder = await dialog().getByLabel('位置').getAttribute('placeholder')
  if (placeholder !== join(WORKTREES, 'e2e-new-branch')) throw new Error(`default location is "${placeholder}"`)
  await dialog().getByRole('button', { name: '创建 Worktree' }).click()
  await until(async () => !(await dialog().isVisible()), 'dialog closed', 60_000)
  const path = join(WORKTREES, 'e2e-new-branch')
  if (git(path, 'branch', '--show-current') !== 'e2e/new-branch') throw new Error('worktree is on the wrong branch')
  await untilText('default-workspace / e2e/new-branch')
  await sleep(800)
  await shot('worktree-created')
})

await scenario('worktree: it is nested under its repository, open on the new session', async () => {
  await groupHeader(1).waitFor({ timeout: 15_000 })
  await worktreeRow('e2e/new-branch').waitFor({ timeout: 5_000 })
  if (await topLevelRow('default-workspace / e2e/new-branch').isVisible()) throw new Error('still at the top level')
  const selected = group().locator('[role="treeitem"][aria-selected="true"]')
  if ((await selected.count()) !== 1) throw new Error('the open session is not listed under the worktree')
  await shot('worktree-nested')
})

await scenario('worktree: a pull request is fetched into its own branch', async () => {
  const tip = seedPullRequest()
  await openWorktreeDialog()
  await dialog().getByRole('tab', { name: '从 PR 创建' }).click()
  await dialog().getByLabel('PR').fill('#1')
  const branch = await dialog().getByLabel('分支名').inputValue()
  if (branch !== 'pr-1') throw new Error(`PR branch name is "${branch}"`)
  await dialog().getByRole('switch').click()
  await dialog().getByRole('button', { name: '创建 Worktree' }).click()
  await until(async () => !(await dialog().isVisible()), 'dialog closed', 60_000)
  if (git(join(WORKTREES, 'pr-1'), 'rev-parse', 'HEAD') !== tip) throw new Error('worktree is not at the PR head')
  await groupHeader(2).waitFor({ timeout: 15_000 })
  await worktreeRow('pr-1').waitFor({ timeout: 5_000 })
})

await scenario('worktree: right-click brings the harness menu, and the group folds away', async () => {
  await worktreeRow('pr-1').click({ button: 'right' })
  await page.getByRole('menuitem', { name: '新建 Worktree…' }).waitFor({ timeout: 5_000 })
  const items = await page.getByRole('menuitem').allInnerTexts()
  if (!items.some((text) => text.includes('重命名'))) throw new Error(`menu has ${items.join(', ')}`)
  await shot('worktree-menu')
  await page.keyboard.press('Escape')
  await sleep(300)
  await groupHeader(2).click()
  await sleep(300)
  if (await worktreeRow('pr-1').isVisible()) throw new Error('the group did not fold')
  await groupHeader(2).click()
  await worktreeRow('pr-1').waitFor({ timeout: 5_000 })
})

await scenario('worktree: git refusing explains why and keeps the dialog open', async () => {
  await openWorktreeDialog()
  await dialog().getByLabel('分支名').fill('e2e/new-branch')
  await dialog().getByRole('button', { name: '创建 Worktree' }).click()
  await dialog().getByRole('alert').waitFor({ timeout: 15_000 })
  const alert = await dialog().getByRole('alert').innerText()
  if (!alert.includes('分支已存在：e2e/new-branch')) throw new Error(`alert says "${alert}"`)
  await shot('worktree-error')
  await dialog().getByRole('button', { name: '取消' }).click()
})

await finish()
