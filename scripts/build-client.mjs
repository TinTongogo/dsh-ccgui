// Emits lib/client.js in the shape the harness's client loader expects: a factory
// registered on window.__ModuleLoader__, resolving shared modules through its `require`.
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  // The settings page shows the version; the QR code is small enough to inline.
  define: { __DSH_CCGUI_VERSION__: JSON.stringify(version) },
  loader: { '.png': 'dataurl' },
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: {
    js: 'window.__ModuleLoader__.load({ id: "dsh-ccgui", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
})
