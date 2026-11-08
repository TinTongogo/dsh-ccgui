// Deterministic scenarios against tests/fixtures/fake-acp-agent.mjs.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { openHarness, sessionEvents, turnEnds, WORKSPACE } from './lib.mjs'

const {
  page,
  sleep,
  bodyText,
  shot,
  until,
  newSession,
  newCliSession,
  cliSwitcher,
  modelTrigger,
  modelNames,
  chooseModel,
  send,
  scenario,
  finish,
  openCcguiSettings,
  closeSettings,
} = await openHarness()
const FAKE = 'Fake CLI'
const FAILED_PROMPT = 'CRASH before restart'
const inWorkspace = (file) => join(WORKSPACE, file)
const untilText = (text, timeout) => until(async () => (await bodyText()).includes(text), `text "${text}"`, timeout)
const idle = (prompt, turns = 1) => until(() => turnEnds(prompt).length >= turns, `turn end of ${prompt}`)
const harnessSeatDisplays = () =>
  page
    .locator('[data-slot="conversation.input.model"]')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).display))

// Must stay first, on a fresh server: for `npx` commands, starting a CLI downloads and runs
// a package, which nobody should get just by opening the app.
await scenario('lazy: opening the app starts no CLI', async () => {
  await sleep(2000)
  await newSession('标准模式')
  await sleep(1000)
  const running = (() => {
    try {
      return execFileSync('pgrep', ['-f', 'fixtures/fake-acp-agent.mjs']).toString().trim()
    } catch {
      return ''
    }
  })()
  if (running !== '') throw new Error(`already running: ${running}`)
})

// Also needs the fresh server, while the session is not on a CLI yet. The harness's seat
// would list every CLI here too, which a started session cannot move to.
await scenario("seat: a session not on a CLI lists the harness's providers, not the CLIs", async () => {
  if ((await page.locator('.dsh-cli-model').count()) !== 1) throw new Error("the plugin's control is missing")
  const seats = await harnessSeatDisplays()
  if (!seats.every((display) => display === 'none')) throw new Error(`harness seat: ${seats.join()}`)
  await modelTrigger().click()
  await sleep(500)
  // This home signs in to no provider, so the harness may have nothing of its own to list.
  const headings = await page.locator('.dsh-cli-model-heading').allInnerTexts()
  const rows = await page
    .getByRole('menuitemradio')
    .evaluateAll((items) => items.map((item) => item.getAttribute('title')))
  await shot('model-menu-harness')
  await page.keyboard.press('Escape')
  await sleep(250)
  if (headings.includes(FAKE) || rows.some((name) => name?.startsWith('Fake')))
    throw new Error(`lists a CLI: ${headings.join()} / ${rows.join()}`)
})

await scenario('allow: permission gates the write, then the file appears', async () => {
  await newCliSession(FAKE)
  await send('WRITE allow.txt')
  await untilText('等待审批')
  if (existsSync(inWorkspace('allow.txt'))) throw new Error('file written before approval')
  await page.getByRole('button', { name: '允许一次' }).click()
  await untilText('done')
  await idle('WRITE allow.txt')
  if (!existsSync(inWorkspace('allow.txt'))) throw new Error('file missing after approval')
})

await scenario('diff: the turn shows the CLI file change in the native card', async () => {
  await until(async () => /已编辑\s*allow\.txt/.test(await bodyText()), 'diff summary card')
  const types = sessionEvents('WRITE allow.txt').map((event) => event.type)
  if (!types.includes('tool/call') || !types.includes('tool/result'))
    throw new Error(`tool events missing: ${types.join(',')}`)
})

await scenario('reject: the CLI is told no and the file never appears', async () => {
  await newCliSession(FAKE)
  await send('WRITE reject.txt')
  await untilText('等待审批')
  await page.getByRole('button', { name: '拒绝' }).click()
  await untilText('The write was rejected.')
  await idle('WRITE reject.txt')
  if (existsSync(inWorkspace('reject.txt'))) throw new Error('file written after rejection')
})

await scenario('auto: a call the CLI does not ask about still shows and finishes', async () => {
  await newCliSession(FAKE)
  await send('AUTO auto.txt')
  await untilText('done')
  await idle('AUTO auto.txt')
  if (!existsSync(inWorkspace('auto.txt'))) throw new Error('file missing')
  const toolResults = sessionEvents('AUTO auto.txt').filter((event) => event.type === 'tool/result')
  if (toolResults.length !== 1 || toolResults[0].data.isError) throw new Error('bad tool result')
})

await scenario('silent end: a turn ending after a tool with no text is not an error', async () => {
  await newCliSession(FAKE)
  await send('READ')
  await idle('READ')
  const [end] = turnEnds('READ')
  if (end.data.reason.kind !== 'completed')
    throw new Error(`turn ended as ${JSON.stringify(end.data.reason).slice(0, 200)}`)
})

await scenario('cancel: stop ends the turn and the session still works', async () => {
  await newCliSession(FAKE)
  await send('HANG')
  await untilText('working')
  await sleep(300)
  await page
    .getByRole('button', { name: /停止|中断|取消/ })
    .last()
    .click()
  await idle('HANG')
  const [end] = turnEnds('HANG')
  if (end.data.reason.kind !== 'aborted')
    throw new Error(`turn ended as ${JSON.stringify(end.data.reason).slice(0, 200)}`)
  await sleep(500)
  await send('after cancel')
  await untilText('echo: after cancel')
  await idle('HANG', 2)
})

await scenario('crash: a dead CLI reports an error and the next message recovers without replaying', async () => {
  await newCliSession(FAKE)
  await send('CRASH')
  await untilText('退出码 3')
  await sleep(500)
  await send('after crash')
  // The fake CLI crashes again if it receives CRASH twice, so this also proves no replay.
  await untilText('echo: after crash')
  await idle('CRASH', 2)
})

await scenario('approval text: the person deciding sees what would be written', async () => {
  await newCliSession(FAKE)
  await send('WRITE shown.txt')
  await untilText('等待审批')
  const text = await bodyText()
  if (!text.slice(text.indexOf('等待审批')).includes('shown.txt:'))
    throw new Error('no file preview in the approval card')
  await page.getByRole('button', { name: '拒绝' }).click()
  await idle('WRITE shown.txt')
})

// Left in this state on purpose; e2e/fake-cli-resume.mjs reopens it after a restart.
await scenario('setup: leave a session whose last turn failed', async () => {
  await newCliSession(FAKE)
  await send(FAILED_PROMPT)
  await untilText('退出码 3')
  await idle(FAILED_PROMPT)
})

await scenario('position: the switcher sits between the + button and the permission control', async () => {
  await newCliSession(FAKE)
  const left = (await page.getByRole('button', { name: '添加文件或调用指令' }).last().boundingBox())?.x
  const switcher = await cliSwitcher().boundingBox()
  const permission = (
    await page
      .getByRole('button', { name: /^访问模式/ })
      .last()
      .boundingBox()
  )?.x
  await shot('switcher')
  if (!(left < switcher.x && switcher.x < permission))
    throw new Error(`order: + ${left}, switcher ${switcher.x}, permission ${permission}`)
})

await scenario('models: the menu shows what the CLI reports, naming its default', async () => {
  await newCliSession(FAKE)
  await until(async () => (await modelNames(FAKE)).length === 3, 'three model rows', 30_000)
  const names = await modelNames(FAKE)
  if (names.join() !== 'Fake Small（默认）,Fake Small,Fake Large') throw new Error(`rows: ${names.join()}`)
})

await scenario("flat menu: one click shows only this CLI's models, with no second level", async () => {
  await modelTrigger().click()
  await sleep(300)
  const names = await page
    .getByRole('menuitemradio')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('title')))
  if (names.join() !== 'Fake Small（默认）,Fake Small,Fake Large') throw new Error(`rows: ${names.join()}`)
  if (
    await page
      .getByRole('menuitem', { name: /^模型/ })
      .isVisible()
      .catch(() => false)
  )
    throw new Error('still has a second level')
  await shot('model-menu')
  await page.keyboard.press('Escape')
  await sleep(250)
  if ((await modelTrigger().getAttribute('aria-expanded')) === 'true') throw new Error('Escape left the menu open')
})

await scenario("flat menu: the harness's control is out of the row", async () => {
  const seats = await harnessSeatDisplays()
  if (!seats.every((display) => display === 'none')) throw new Error(`harness seat: ${seats.join()}`)
  if ((await page.getByRole('button', { name: /^(选择模型|请选择模型)/ }).count()) !== 1)
    throw new Error('more than one model control')
})

await scenario('flat menu: arrows move, Enter settles, and the trigger takes the name', async () => {
  await modelTrigger().click()
  await sleep(300)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await until(async () => (await modelTrigger().getAttribute('title')) === 'Fake Large', 'trigger naming Fake Large')
  if ((await modelTrigger().getAttribute('aria-expanded')) === 'true') throw new Error('selection left the menu open')
  await chooseModel(FAKE, 'Fake Small（默认）')
})

await scenario('flat menu: a press elsewhere closes it', async () => {
  await modelTrigger().click()
  await sleep(300)
  await page.mouse.click(5, 5)
  await sleep(250)
  if ((await page.getByRole('menuitemradio').count()) !== 0) throw new Error('list still open')
})

await scenario('flat menu: a press inside it keeps it open', async () => {
  await modelTrigger().click()
  await sleep(300)
  // The padding beside the rows, halfway up: a corner of the box is outside the rounded card.
  const card = await page.locator('.dsh-cli-model-menu').boundingBox()
  const x = card.x + 2
  const y = card.y + card.height / 2
  const onCard = await page.evaluate(
    ([px, py]) => {
      const hit = document.elementFromPoint(px, py)
      return hit?.closest('.dsh-cli-model-menu') !== null && hit?.closest('button') === null
    },
    [x, y],
  )
  if (!onCard) throw new Error("the press would miss the card's padding")
  await page.mouse.click(x, y)
  await sleep(250)
  if ((await page.getByRole('menuitemradio').count()) === 0) throw new Error('the press closed the list')
  await page.keyboard.press('Escape')
  await sleep(250)
})

await scenario('model switch: the chosen model reaches the CLI before the prompt', async () => {
  await newCliSession(FAKE)
  await chooseModel(FAKE, 'Fake Large')
  await send('WHICH MODEL')
  await untilText('model=fake-large')
  await idle('WHICH MODEL')
})

await scenario('model switch mid-session: the next message runs on the new model', async () => {
  await chooseModel(FAKE, 'Fake Small')
  await send('WHICH MODEL')
  await untilText('model=fake-small')
})

await scenario('locked: a started session keeps its CLI, and says how to change', async () => {
  if (!(await cliSwitcher().isDisabled())) throw new Error('switcher still enabled after the session started')
  const title = await cliSwitcher().getAttribute('title')
  if (!title.includes('新建会话')) throw new Error(`hint: ${title}`)
})

await scenario('PTC: a CLI refuses clearly in the mode it cannot run in', async () => {
  await newSession('PTC')
  await chooseModel(FAKE, 'Fake Small')
  await send('ptc refused')
  await untilText('CLI_WRONG_PRESET')
  if (!(await bodyText()).includes('标准模式')) throw new Error('message does not name the way out')
  await shot('ptc-refused')
})

await scenario('marks: the switcher, its menu and the session list say which CLI is which', async () => {
  await newCliSession(FAKE)
  if ((await cliSwitcher().locator('[data-cli-mark]').count()) !== 1) throw new Error('no mark on the switcher')
  await cliSwitcher().click()
  await sleep(300)
  const marks = await page
    .locator('[data-cli-mark]:visible')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-cli-mark')))
  await page.keyboard.press('Escape')
  await sleep(300)
  for (const mark of ['opencode', 'omp', 'codex', 'pi']) {
    if (!marks.includes(mark)) throw new Error(`menu lacks ${mark}: ${marks.join()}`)
  }
  await send('MARKED ROW')
  await untilText('echo: MARKED ROW')
  await idle('MARKED ROW')
  await sleep(800)
  const row = page.locator('[data-row-key^="session:"]').filter({ hasText: 'MARKED ROW' })
  // The status mark (session-status-mark.tsx) portals a second, hidden copy into the same cell,
  // so count only the leading slot's own mark.
  if ((await row.locator('.dsh-cli-session-mark [data-cli-mark="cli"]').count()) !== 1)
    throw new Error('the session row shows no mark')
  // The row has one 16px cell, so a mark the harness placed first has to keep it.
  const yields = await row.locator('.dsh-cli-session-mark').evaluate((mine) => {
    const earlier = document.createElement('span')
    mine.before(earlier)
    const hidden = getComputedStyle(mine).display === 'none'
    earlier.remove()
    return hidden && getComputedStyle(mine).display !== 'none'
  })
  if (!yields) throw new Error('the mark does not give way to an earlier occupant')
  await shot('marks')
})

await scenario('sidebar: opening it shows 工作区文件 instead of the guide, with 变更 beside it', async () => {
  const expand = page.getByRole('button', { name: '打开右侧边栏' })
  const files = () => page.locator('[data-files-page]').filter({ visible: true }).count()
  await until(() => expand.isVisible(), 'sidebar expand button')
  await expand.click()
  await until(async () => (await files()) === 1, 'files page shown')
  if ((await page.locator('[data-sidebar-right-guide]').count()) !== 0) throw new Error('the guide is still open')
  await shot('sidebar-files')
  // 变更 opens beside 工作区文件 the way CC GUI's panel does, with 文件 in front.
  // Each chip holds its close button, so a tab's name is "变更 关闭"; match the start.
  const changesTab = page.getByRole('tab', { name: /^变更/ })
  await until(async () => (await changesTab.count()) === 1, '变更 tab beside the files page')
  if ((await page.locator('.dsh-ccgui-changes').filter({ visible: true }).count()) !== 0)
    throw new Error('变更 is in front of 工作区文件')
  await changesTab.click()
  const branch = page.locator('.dsh-ccgui-changes-branch-button').filter({ visible: true })
  await until(async () => (await branch.count()) === 1, '变更 panel with its branch picker')
  await until(async () => /main|master/.test(await branch.innerText()), 'branch name in the picker')
  await shot('sidebar-changes')
  await page.getByRole('tab', { name: /^文件/ }).click()
  await until(async () => (await files()) === 1, 'back on the files page')
  await page.getByRole('button', { name: '收起右侧边栏' }).click()
  await until(async () => (await files()) === 0, 'sidebar collapsed')
})

await scenario('terminal: the header button opens, hides and brings back one terminal', async () => {
  const button = page.getByRole('button', { name: '切换终端' })
  const shown = () => page.locator('[data-sidebar-terminal]').filter({ visible: true }).count()
  await until(() => button.isVisible(), 'terminal button')
  await button.click()
  await until(async () => (await shown()) === 1, 'terminal shown')
  await shot('terminal-open')
  await button.click()
  await until(async () => (await shown()) === 0, 'terminal hidden')
  await button.click()
  await until(async () => (await shown()) === 1, 'terminal shown again')
  // Bringing it back must reuse the shell, not stack a second one.
  if ((await page.locator('[data-sidebar-terminal]').count()) !== 1) throw new Error('a second terminal was opened')
  await button.click()
})

await scenario('launch script: saved once, it runs in a terminal tab of its own and restarts there', async () => {
  // Arithmetic, so the echoed command line cannot satisfy the check; only the output can.
  const output = () => page.locator('[data-sidebar-terminal]').filter({ hasText: 'LAUNCH_OK_42' }).count()
  // Count tabs, not mounted terminals: the sidebar mounts only its active tab, so a terminal
  // left open by an earlier scenario is a tab with no [data-sidebar-terminal] on the page.
  const terminals = () =>
    page
      .locator('[data-dockkit-tab]:has([data-sidebar-right-tab])')
      .filter({ hasNotText: /^\s*(文件|变更)\s*$/ })
      .count()
  await page.getByRole('button', { name: '设置启动脚本' }).click()
  const dialog = page.getByRole('dialog', { name: '添加启动脚本' })
  await dialog.getByLabel('名称').fill('回显')
  await dialog.getByLabel('命令').fill('echo LAUNCH_OK_$((40+2))')
  await shot('launch-script-form')
  await dialog.getByRole('button', { name: '保存' }).click()
  const list = page.getByRole('dialog', { name: '启动脚本' })
  await until(() => list.isVisible(), 'script list')
  await shot('launch-script-list')
  await list.getByRole('button', { name: '完成' }).click()
  const before = await terminals()
  await page.getByRole('button', { name: '运行：回显' }).click()
  await until(async () => (await output()) === 1, 'script output in a terminal', 20_000)
  await shot('launch-script-ran')
  if ((await terminals()) !== before + 1) throw new Error('the script did not get a terminal of its own')
  const firstRun = await page.locator('[data-sidebar-terminal]').filter({ hasText: 'LAUNCH_OK_42' }).elementHandle()
  await page.getByRole('button', { name: '启动脚本' }).click()
  await page
    .getByRole('menuitem', { name: /回显/ })
    .or(page.getByRole('menuitemradio', { name: /回显/ }))
    .click()
  await until(() => firstRun.evaluate((node) => !node.isConnected), 'the first run closed', 20_000)
  await until(async () => (await terminals()) === before + 1, 'the rerun replaced its own tab', 20_000)
  await until(async () => (await output()) === 1, 'script output after the rerun', 20_000)
})

await scenario('settings: switching a feature off restores the harness interaction at once', async () => {
  const terminalSwitch = page.getByRole('switch', { name: '会话顶部的终端按钮' })
  const filesSwitch = page.getByRole('switch', { name: '右侧栏默认打开工作区文件' })
  const terminalButton = page.getByRole('button', { name: '切换终端' })
  const openSettings = async () => {
    await openCcguiSettings()
    // The page opens on its CLI 列表 tab; the feature switches live on the next one.
    await page.getByRole('tab', { name: '界面交互' }).click()
    await until(() => terminalSwitch.isVisible(), 'settings page')
  }
  await openSettings()
  await shot('settings-page')
  await page.getByRole('tab', { name: '更多功能' }).click()
  await until(() => page.getByText('即将开放…').first().isVisible(), 'upcoming features')
  await shot('settings-more')
  await page.getByRole('tab', { name: '界面交互' }).click()
  await until(() => terminalSwitch.isVisible(), 'settings page')
  await terminalSwitch.click()
  await filesSwitch.click()
  if ((await terminalSwitch.getAttribute('aria-checked')) !== 'false') throw new Error('the switch did not turn off')
  await closeSettings()
  // A fresh, started session: its right column starts empty, so the harness seeds its guide,
  // and only a started session has a header. The startup script control, still on, shows
  // the header is there.
  await newCliSession(FAKE)
  await send('SETTINGS OFF')
  await idle('SETTINGS OFF')
  await until(() => page.getByRole('button', { name: '启动脚本' }).isVisible(), 'session header')
  if (await terminalButton.isVisible()) throw new Error('the terminal button is still in the header')
  await page.getByRole('button', { name: '打开右侧边栏' }).click()
  await until(
    async () => (await page.locator('[data-sidebar-right-guide]').filter({ visible: true }).count()) === 1,
    'guide shown',
  )
  if ((await page.locator('[data-files-page]').filter({ visible: true }).count()) !== 0)
    throw new Error('the files page replaced the guide while switched off')
  await shot('settings-off')
  await page.getByRole('button', { name: '收起右侧边栏' }).click()
  await openSettings()
  await terminalSwitch.click()
  await filesSwitch.click()
  await closeSettings()
  await page.locator('[data-row-key^="session:"]').filter({ hasText: 'SETTINGS OFF' }).click()
  await until(() => terminalButton.isVisible(), 'terminal button back in the header')
})

await scenario('settings: the CLI list orders the switcher and hides what is switched off', async () => {
  const missingSwitch = page.getByRole('switch', { name: '启用 Missing CLI' })
  const rows = () =>
    page.locator('.dsh-ccgui-cli-prefs li').evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))
  // CLIs can start switched off (CodeBuddy does), so the menu is what the switches leave on.
  const shownRows = () =>
    page
      .locator('.dsh-ccgui-cli-prefs li')
      .evaluateAll((items) =>
        items
          .filter((item) => item.querySelector('[role="switch"]')?.getAttribute('aria-checked') !== 'false')
          .map((item) => item.getAttribute('aria-label')),
      )
  const menuNames = async () => {
    await cliSwitcher().click()
    const items = page.getByRole('menuitemradio').or(page.getByRole('menuitem'))
    await items.first().waitFor({ timeout: 10_000 })
    const names = await items.evaluateAll((items) => items.map((item) => (item.textContent ?? '').trim()))
    await page.keyboard.press('Escape')
    return names
  }
  const openSettings = async () => {
    await openCcguiSettings()
    await until(() => missingSwitch.isVisible(), 'CLI list on the settings page')
  }
  await openSettings()
  const before = await rows()
  const lastName = before.at(-1)
  await page.getByRole('button', { name: `上移 ${lastName}` }).click()
  await missingSwitch.click()
  const arranged = await rows()
  if (arranged.at(-2) !== lastName) throw new Error(`rows after moving: ${arranged.join()}`)
  const expected = await shownRows()
  if (expected.includes('Missing CLI')) throw new Error('Missing CLI is still switched on')
  await shot('settings-cli-list')
  await closeSettings()
  let restored
  try {
    await newSession('标准模式')
    await until(() => cliSwitcher().isVisible(), 'CLI switcher')
    const shown = await menuNames()
    await shot('settings-cli-menu')
    if (shown.join() !== expected.join()) throw new Error(`menu: ${shown.join()} (expected ${expected.join()})`)
  } finally {
    // Put things back, so later scenarios see the configured order and can pick Missing CLI.
    await page.keyboard.press('Escape')
    await openSettings()
    await missingSwitch.click()
    await page.getByRole('button', { name: `下移 ${lastName}` }).click()
    restored = await rows()
    // Closed even when the check above failed, so the next scenario is not stuck behind the dialog.
    await closeSettings()
  }
  if (restored.join() !== before.join()) throw new Error('could not restore the order')
})

await scenario('not installed: choosing a CLI that is missing explains what is wrong', async () => {
  await newCliSession('Missing CLI')
  await send('anyone there')
  await until(() => turnEnds('anyone there').length >= 1, 'turn end', 30_000)
  await shot('missing-cli')
  const text = await bodyText()
  if (!/Missing CLI/.test(text) || !/dsh-ccgui-no-such-command|启动|安装/.test(text))
    throw new Error('the error does not say which CLI or why')
})

await finish()
