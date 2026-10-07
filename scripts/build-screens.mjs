// Bundles the suite screen part (screens/index.mjs) into one browser module: dist/screens.mjs.
// Email's own styles are scoped to its mount root (.email-root) at build time, so nothing in them can
// reach the suite's shell (its top bar, rail or other apps). The standalone app links email.css as it is.
import fs from 'node:fs';
import { build, transform } from 'esbuild';

const scoped = {
  name: 'scoped-css',
  setup(b) {
    b.onLoad({ filter: /\.css$/ }, async (args) => {
      // Page-level rules (html, body, the standalone gate) have no meaning inside the suite: drop them.
      const css = fs.readFileSync(args.path, 'utf8').replace(/^(html|body[^{]*|\.gate-[^{]*|\.ui-gate[^{]*)\{[^}]*\}\s*$/gm, '');
      // Nest every rule under the root and let esbuild flatten it to plain selectors.
      const { code } = await transform(`.email-root{${css}}`, { loader: 'css', target: ['chrome100', 'safari15', 'firefox100'], minify: true });
      return { contents: code, loader: 'text' };
    });
  },
};

export const screensOptions = {
  entryPoints: ['screens/index.mjs'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  plugins: [scoped],
  outfile: 'dist/screens.mjs',
  legalComments: 'none',
  banner: { js: '// wOS Email screen part, built from screens/index.mjs by scripts/build-screens.mjs. AGPL-3.0. Do not edit.' },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await build(screensOptions);
  console.log('built dist/screens.mjs');
}
