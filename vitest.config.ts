import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The harness provides this package at runtime; component tests get a plain-DOM stand-in.
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(
        new URL('./tests/fixtures/ui-primitives.tsx', import.meta.url),
      ),
    },
  },
  test: {
    // Component tests opt into jsdom per file with `// @vitest-environment jsdom`; the rest stay on node.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // Type-only modules have no runtime code to cover.
      exclude: ['src/**/*.d.ts', 'src/transport.ts', 'src/session/types.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
