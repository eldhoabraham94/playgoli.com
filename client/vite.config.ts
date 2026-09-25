import react from '@vitejs/plugin-react';
import { networkInterfaces } from 'node:os';
import { defineConfig, type Plugin } from 'vite';

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
        .replace(/\{\{OG_TITLE\}\}/g, 'Goli: marbles with friends')
        .replace(/\{\{OG_DESC\}\}/g, 'The Indian childhood marbles game.')
        .replace(/\{\{OG_URL\}\}/g, '/')
        .replace(/\{\{OG_IMAGE\}\}/g, '/og.png'),
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), devOgPlaceholders()],
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
