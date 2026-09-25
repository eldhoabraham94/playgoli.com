// Bundles the server (and @goli/shared, zod, socket.io) into one file: server/dist/index.js.
// The production image then needs no node_modules at all.
import { build } from 'esbuild';

await build({
  entryPoints: [new URL('./src/index.ts', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')],
  outfile: new URL('./dist/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  // Optional native speed-ups for ws; it works without them.
  external: ['bufferutil', 'utf-8-validate'],
  // Bundled CommonJS deps call require(); give ESM output a real one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
