import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { defineConfig, type Plugin } from 'vite';
import { splashHtml } from './src/splash/markup';

const PORT = 5173;

/** LAN address, so invite links/QR codes made on localhost still work from a phone in dev. */
function lanOrigin(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return `http://${a.address}:${PORT}`;
    }
  }
  return '';
}

/** In dev, fill the {{OG_*}} placeholders the production server normally fills (see server/src/static.ts). */
function devOgPlaceholders(): Plugin {
  return {
    name: 'goli-dev-og',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html
        .replace(/\{\{(TITLE|OG_TITLE)\}\}/g, 'Goli (dev)')
        .replace(/\{\{OG_DESC\}\}/g, 'The Indian childhood marbles game.')
        .replace(/\{\{(OG_URL|CANONICAL)\}\}/g, '/')
        .replace(/\{\{OG_IMAGE\}\}/g, '/og.png')
        .replace(/\{\{ROBOTS\}\}/g, 'noindex')
        .replace(/\{\{(JSONLD|SEO_BODY)\}\}/g, ''),
  };
}

/**
 * Inline the loading scene (CSS + markup) into index.html so it paints on the very
 * first frame, before the JS bundle arrives. main.tsx fades it out once the app is up.
 */
function inlineSplash(): Plugin {
  const cssPath = new URL('./src/splash/splash.css', import.meta.url);
  return {
    name: 'goli-inline-splash',
    transformIndexHtml: (html) => ({
      html: html.replace('<!--splash-->', splashHtml('Scratching the ring…')),
      tags: [{ tag: 'style', attrs: { id: 'splash-css' }, children: readFileSync(cssPath, 'utf8'), injectTo: 'head' }],
    }),
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), devOgPlaceholders(), inlineSplash()],
  define: {
    __LAN_ORIGIN__: JSON.stringify(command === 'serve' ? lanOrigin() : ''),
  },
  build: {
    target: 'es2020',
  },
  server: {
    host: true, // reachable from a phone on the same Wi-Fi
    port: PORT,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
}));
