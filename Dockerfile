FROM node:24.5.0-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.app.json tsconfig.json tsconfig.node.json tsconfig.server.json vite.config.ts ./
COPY server ./server
COPY src ./src
RUN npm run build && npm prune --omit=dev && npm audit --omit=dev

FROM node:24.5.0-bookworm-slim

ENV NODE_ENV=production \
    PORT=8080 \
    STACKMAP_DB_PATH=/config/stackmap.db \
    STACKMAP_STATIC_ROOT=/app/dist

WORKDIR /app
COPY --from=build --chown=10001:10001 /app/package.json /app/package-lock.json ./
COPY --from=build --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/dist ./dist
COPY --from=build --chown=10001:10001 /app/dist-server ./dist-server
RUN mkdir /config && chown 10001:10001 /config

USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist-server/index.js"]
