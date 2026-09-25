# Goli: one image that serves the game (static client + Socket.IO server).

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
# Install with only the manifests first so this layer is cached between code changes.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

# ---- run ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    TRUST_PROXY=1
# The server is a single bundled file; no node_modules needed at runtime.
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:${PORT}/healthz || exit 1
CMD ["node", "--enable-source-maps", "server/dist/index.js"]
