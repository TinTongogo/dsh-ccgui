// Lists source files by code lines (blank lines and comments excluded, the same count
// ESLint's max-lines uses), flagging those near or over the limit.
//   pnpm size          files at or above the warning line
//   pnpm size --all    every file
import { ESLint } from 'eslint'

const WARN_AT = 400
const LIMIT = 500
const showAll = process.argv.includes('--all')

const eslint = new ESLint({
  overrideConfig: { rules: { 'max-lines': ['error', { max: 1, skipBlankLines: true, skipComments: true }] } },
})
const results = await eslint.lintFiles(['src/**/*.{ts,tsx}'])
const sizes = results
  .map((result) => {
    const message = result.messages.find((m) => m.ruleId === 'max-lines')
    const lines = message === undefined ? 0 : Number(/\((\d+)\)/.exec(message.message)?.[1] ?? 0)
    return { file: result.filePath.slice(process.cwd().length + 1), lines }
  })
  .sort((a, b) => b.lines - a.lines)

const shown = showAll ? sizes : sizes.filter(({ lines }) => lines >= WARN_AT)
for (const { file, lines } of shown) {
  const status = lines > LIMIT ? 'OVER' : lines >= WARN_AT ? 'SPLIT SOON' : 'ok'
  console.log(`${String(lines).padStart(5)}  ${status.padEnd(10)}  ${file}`)
}
if (shown.length === 0) console.log(`No source file at or above ${WARN_AT} code lines (limit ${LIMIT}).`)
