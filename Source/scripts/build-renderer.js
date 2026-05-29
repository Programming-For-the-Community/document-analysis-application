const esbuild = require('esbuild');

const pages = ['home', 'login', 'project'];

const watch = process.argv.includes('--watch');

const buildOptions = pages.map((page) => ({
  entryPoints: [`renderer/${page}/index.ts`],
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