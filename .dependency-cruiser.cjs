/**
 * 架构约束
 * - src/client 是打包进浏览器的 UI，只能依赖自身和共享常量，不能拉进 Node 端代码
 * - Node 端代码不能依赖 src/client
 * - 源码不能依赖测试；禁止循环依赖
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '禁止循环依赖',
      from: {},
      to: { circular: true },
    },
    {
      name: 'client-stays-in-browser',
      severity: 'error',
      comment: 'src/client 只能依赖 src/client/** 和 src/constants.ts',
      from: { path: '^src/client/' },
      to: { path: '^src/', pathNot: ['^src/client/', '^src/constants\\.ts$'] },
    },
    {
      name: 'client-no-node-builtins',
      severity: 'error',
      comment: '浏览器端不能使用 Node 内置模块',
      from: { path: '^src/client/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'server-not-to-client',
      severity: 'error',
      comment: 'Node 端代码不能依赖浏览器端 UI',
      from: { path: '^src/', pathNot: '^src/client/' },
      to: { path: '^src/client/' },
    },
    {
      name: 'src-not-to-tests',
      severity: 'error',
      comment: '源码不能依赖测试代码',
      from: { path: '^src/' },
      to: { path: '^tests/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '^(node_modules|lib)/' },
  },
}
