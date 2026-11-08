// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs'

export default tseslint.config(
  { ignores: ['lib', 'coverage', 'reports', '.stryker-tmp', 'node_modules'] },
  js.configs.recommended,

  // 豁免注释必须写理由（`// eslint-disable-next-line 规则 -- 理由`），失效的豁免直接报错
  comments.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
    },
  },

  // TypeScript 源码与测试：类型感知的严格规则
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 类型安全：AI 最常偷懒的地方
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // 与 no-non-null-assertion 互相矛盾，保留后者
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      // 数字直接进模板字符串是安全的
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // 允许 `() => void fn()` 风格的箭头简写
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // 下划线开头表示有意不用（实现接口签名时常见）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Promise.withResolvers<void>() 之类的泛型实参是合法用法，此规则在这里只产生误报
      '@typescript-eslint/no-invalid-void-type': 'off',
      // 字符串用 || 是有意把空串也当作缺省，改成 ?? 会改变行为
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true } }],

      // 体量与复杂度（对应 ~/.claude/rules/coding-style.md）
      // 源码单文件 500 行（不计空行和注释）；达到 400 行时 `pnpm size` 会提示，应先拆再加
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 4],
      'max-params': ['error', 4],
      // ESLint 把每个 ?. 和 ?? 都算一个分支，空值安全写法多的代码会虚高，故用默认值 20
      complexity: ['error', 20],

      // 卫生
      'no-console': 'error',
      'no-param-reassign': ['error', { props: true }],
      // `x != null` 同时判断 null 和 undefined，是惯用法
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // 浏览器端 React 代码
  {
    files: ['src/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    // 只用经典的两条规则；其余是 React Compiler 规则，本项目由宿主提供 React 18，未启用 Compiler
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // 测试：允许长 describe 块和测试替身里的宽松写法
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
      // 断言 mock 方法、空桩函数是测试里的正常写法
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      // 测试替身：不需要 await 的异步桩；expect.objectContaining 返回 any
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  // 纯 JS 脚本（构建脚本、e2e、fixtures）：不做类型检查
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  // e2e 里传给 page.evaluate 的函数运行在浏览器中
  {
    files: ['e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },

  prettier,
)
