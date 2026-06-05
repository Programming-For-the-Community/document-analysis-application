const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const buildOptions = [
  { page: 'home',    entry: 'renderer/home/index.tsx' },
  { page: 'login',   entry: 'renderer/login/index.tsx' },
  { page: 'project', entry: 'renderer/project/index.ts' },
].map(({ page, entry }) => ({
  entryPoints: [entry],
  bundle: true,
  outfile: `dist/renderer/${page}/index.js`,
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
}));

if (watch) {
  Promise.all(
    buildOptions.map((opts) => esbuild.context(opts).then((ctx) => ctx.watch())),
  ).catch(() => process.exit(1));
} else {
  Promise.all(buildOptions.map((opts) => esbuild.build(opts))).catch(() => process.exit(1));
}