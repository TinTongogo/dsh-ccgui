// @vitest-environment jsdom
/// <reference lib="dom" />

import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LaunchScriptEntry } from '../../src/client/launch-script-entry.tsx'
import type { CwdList } from '../../src/client/launch-script-entry.tsx'
import { registerLaunchScripts } from '../../src/client/launch-script-register.ts'
import type { LaunchScriptContext } from '../../src/client/launch-script-register.ts'
import type { LaunchRunner, LaunchSidebar, LaunchTerminals } from '../../src/client/launch-script-run.ts'
import { LAUNCH_SCRIPT_STYLES } from '../../src/client/launch-script-styles.ts'
import { createScriptBook, storageKey } from '../../src/client/launch-scripts.ts'
import type { LaunchScript, ScriptStorage } from '../../src/client/launch-scripts.ts'

const CWD = '/work/app'
const DEV: LaunchScript = { id: 'dev', name: '开发服务器', command: 'npm run dev' }
const TEST: LaunchScript = { id: 'test', name: '', command: 'pnpm test --watch' }

function storageWith(scripts: readonly LaunchScript[] = []) {
  let items: Readonly<Record<string, string>> = { [storageKey(CWD)]: JSON.stringify(scripts) }
  return {
    getItem: (key: string) => items[key] ?? null,
    setItem: vi.fn((key: string, value: string) => {
      items = { ...items, [key]: value }
    }),
  } satisfies ScriptStorage
}

function sessionList(cwd: string | undefined = CWD): CwdList {
  return { subscribe: () => () => undefined, getSnapshot: () => ({ byId: { s1: { cwd } } }) }
}

function setup(
  options: { scripts?: readonly LaunchScript[]; storage?: ScriptStorage; run?: LaunchRunner['run'] } = {},
) {
  const storage = options.storage ?? storageWith(options.scripts)
  const book = createScriptBook(storage)
  const runner = { run: vi.fn(options.run ?? (() => Promise.resolve())) }
  let counter = 0
  const newId = () => {
    counter += 1
    return `new-${counter}`
  }
  render(<LaunchScriptEntry sessionId="s1" list={sessionList()} book={book} runner={runner} newId={newId} />)
  return { book, runner }
}

const dialog = () => screen.getByRole('dialog')

afterEach(() => {
  cleanup()
})

describe('LaunchScriptEntry with nothing saved', () => {
  it('offers to set one up and goes straight to the form', async () => {
    setup()
    expect(screen.queryByRole('button', { name: '启动脚本' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '设置启动脚本' }))
    expect(dialog()).toHaveProperty('ariaLabel', '添加启动脚本')
    expect(within(dialog()).getByRole('button', { name: '保存' })).toHaveProperty('disabled', true)
    await userEvent.click(within(dialog()).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('saves the first script and shows it as the default', async () => {
    const { book } = setup()
    await userEvent.click(screen.getByRole('button', { name: '设置启动脚本' }))
    await userEvent.type(within(dialog()).getByLabelText('名称'), '开发服务器')
    await userEvent.type(within(dialog()).getByLabelText('命令'), 'npm run dev')
    await userEvent.click(within(dialog()).getByRole('button', { name: '保存' }))
    expect(book.read(CWD)).toEqual([{ id: 'new-1', name: '开发服务器', command: 'npm run dev' }])
    expect(dialog()).toHaveProperty('ariaLabel', '启动脚本')
    expect(within(dialog()).getByText('默认')).toBeTruthy()
    await userEvent.click(within(dialog()).getByRole('button', { name: '完成' }))
    expect(screen.getByRole('button', { name: '运行：开发服务器' })).toBeTruthy()
  })

  it('saves with Cmd+Enter and explains an over-long command', async () => {
    const { book } = setup()
    await userEvent.click(screen.getByRole('button', { name: '设置启动脚本' }))
    const command = within(dialog()).getByLabelText('命令')
    await userEvent.click(command)
    await userEvent.paste('x'.repeat(4001))
    expect(within(dialog()).getByRole('alert').textContent).toContain('4000')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(book.read(CWD)).toEqual([])
    await userEvent.clear(command)
    await userEvent.type(command, 'ls{Meta>}{Enter}{/Meta}')
    expect(book.read(CWD)).toEqual([{ id: 'new-1', name: '', command: 'ls' }])
  })
})

describe('LaunchScriptEntry with saved scripts', () => {
  it('runs the default script from the header button', async () => {
    const { runner } = setup({ scripts: [DEV, TEST] })
    await userEvent.click(screen.getByRole('button', { name: '运行：开发服务器' }))
    expect(runner.run).toHaveBeenCalledWith('s1', DEV)
  })

  it('lists every script in the menu, runs the one picked and opens the manager', async () => {
    const { runner } = setup({ scripts: [DEV, TEST] })
    await userEvent.click(screen.getByRole('button', { name: '启动脚本' }))
    const items = screen.getAllByRole('menuitemradio')
    expect(items.map((item) => item.textContent)).toEqual([
      '开发服务器npm run dev',
      'pnpm test --watch',
      '管理启动脚本…',
    ])
    await userEvent.click(screen.getByText('pnpm test --watch'))
    expect(runner.run).toHaveBeenCalledWith('s1', TEST)
    await userEvent.click(screen.getByRole('button', { name: '启动脚本' }))
    await userEvent.click(screen.getByText('管理启动脚本…'))
    expect(dialog()).toHaveProperty('ariaLabel', '启动脚本')
    await userEvent.click(screen.getByRole('button', { name: '启动脚本' }))
    await userEvent.click(screen.getByText('stub-close'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('edits, promotes and deletes from the manager', async () => {
    const { book } = setup({ scripts: [DEV, TEST] })
    await userEvent.click(screen.getByRole('button', { name: '启动脚本' }))
    await userEvent.click(screen.getByText('管理启动脚本…'))
    await userEvent.click(within(dialog()).getByRole('button', { name: '编辑 pnpm test --watch' }))
    expect(dialog()).toHaveProperty('ariaLabel', '编辑启动脚本')
    await userEvent.type(within(dialog()).getByLabelText('名称'), '测试')
    await userEvent.click(within(dialog()).getByRole('button', { name: '保存' }))
    expect(book.read(CWD)[1]).toEqual({ ...TEST, name: '测试' })

    await userEvent.click(within(dialog()).getByRole('button', { name: '设为默认' }))
    expect(book.read(CWD).map((script) => script.id)).toEqual(['test', 'dev'])

    const remove = within(dialog()).getByRole('button', { name: '删除 开发服务器' })
    await userEvent.click(remove)
    expect(book.read(CWD)).toHaveLength(2)
    await userEvent.click(within(dialog()).getByRole('button', { name: '再点一次删除' }))
    expect(book.read(CWD).map((script) => script.id)).toEqual(['test'])
  })

  it('goes back to the list from an edit without saving', async () => {
    const { book } = setup({ scripts: [DEV] })
    await userEvent.click(screen.getByRole('button', { name: '启动脚本' }))
    await userEvent.click(screen.getByText('管理启动脚本…'))
    await userEvent.click(within(dialog()).getByRole('button', { name: '添加脚本' }))
    await userEvent.type(within(dialog()).getByLabelText('命令'), 'ls')
    await userEvent.click(within(dialog()).getByRole('button', { name: '返回' }))
    expect(dialog()).toHaveProperty('ariaLabel', '启动脚本')
    expect(book.read(CWD)).toEqual([DEV])
  })

  it('closes the manager when a script runs from it, so the terminal is in view', async () => {
    const { runner } = setup({ scripts: [DEV] })
    await userEvent.click(screen.getByRole('button', { name: '启动脚本' }))
    await userEvent.click(screen.getByText('管理启动脚本…'))
    await userEvent.click(within(dialog()).getByRole('button', { name: '运行 开发服务器' }))
    expect(runner.run).toHaveBeenCalledWith('s1', DEV)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('tells the user when a run fails', async () => {
    setup({ scripts: [DEV], run: () => Promise.reject(new Error('终端没有准备好')) })
    await userEvent.click(screen.getByRole('button', { name: '运行：开发服务器' }))
    const toast = await screen.findByRole('alert')
    expect(toast.textContent).toContain('没能运行「开发服务器」：终端没有准备好')
    await userEvent.click(within(toast).getByText('stub-toast-done'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the manager open with a message when saving fails', async () => {
    const storage = storageWith([DEV])
    storage.setItem.mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    setup({ storage })
    await userEvent.click(screen.getByRole('button', { name: '启动脚本' }))
    await userEvent.click(screen.getByText('管理启动脚本…'))
    await userEvent.click(within(dialog()).getByRole('button', { name: '删除 开发服务器' }))
    await userEvent.click(within(dialog()).getByRole('button', { name: '再点一次删除' }))
    expect(within(dialog()).getByRole('alert').textContent).toBe('没能保存启动脚本：quota exceeded')
    await userEvent.click(within(dialog()).getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('registerLaunchScripts', () => {
  it('waits for the sidebar and terminals and puts the control left of the terminal button', () => {
    const registrations: { options: { id: string; name: string; order?: number; inject(id: string): unknown } }[] = []
    const dependencies: (readonly string[])[] = []
    const sidebar: LaunchSidebar = { tabsIn: () => [], openTabIn: vi.fn(), closeIn: vi.fn() }
    const terminals: LaunchTerminals = { view: vi.fn() }
    const slots: LaunchScriptContext['slots'] = {
      inject: (_name, add) => add(),
      register: (options) => {
        registrations.push({ options })
        return undefined
      },
    }
    const ctx: LaunchScriptContext = {
      slots,
      inject: (deps, apply) => {
        dependencies.push(deps)
        apply({ slots, inject: ctx.inject, sidebarRight: sidebar, webTerminals: terminals })
        return undefined
      },
    }
    registerLaunchScripts(ctx, sessionList(), storageWith(), () => 'id')
    expect(dependencies).toEqual([['sidebarRight', 'webTerminals']])
    expect(registrations.map(({ options }) => [options.id, options.name, options.order])).toEqual([
      ['dsh-ccgui.launch-scripts', 'conversation.session.header.utilities', -2],
    ])
    expect(registrations[0]?.options.inject('s1')).toHaveProperty('book')
  })

  it('ships styles for its classes', () => {
    expect(LAUNCH_SCRIPT_STYLES).toContain('.dsh-ls-run')
  })
})
