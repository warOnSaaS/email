// Bundles the suite screen part (screens/index.mjs) into one browser module: dist/screens.mjs.
import { build } from 'esbuild';

await build({
  entryPoints: ['screens/index.mjs'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  loader: { '.css': 'text' },
  outfile: 'dist/screens.mjs',
  legalComments: 'none',
  banner: { js: '// wOS Email screen part, built from screens/index.mjs by scripts/build-screens.mjs. AGPL-3.0. Do not edit.' },
});
console.log('built dist/screens.mjs');
