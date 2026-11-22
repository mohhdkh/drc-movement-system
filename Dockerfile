# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./

ARG VITE_AUTH_PROVIDER=entra
ARG VITE_ENTRA_CLIENT_ID
ARG VITE_ENTRA_TENANT_ID
ARG VITE_ENTRA_REDIRECT_URI
ARG VITE_ENTRA_API_SCOPE
ENV VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER \
    VITE_ENTRA_CLIENT_ID=$VITE_ENTRA_CLIENT_ID \
    VITE_ENTRA_TENANT_ID=$VITE_ENTRA_TENANT_ID \
    VITE_ENTRA_REDIRECT_URI=$VITE_ENTRA_REDIRECT_URI \
    VITE_ENTRA_API_SCOPE=$VITE_ENTRA_API_SCOPE
RUN npm run build

FROM node:22-bookworm-slim AS server-dependencies
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
# better-sqlite3 v13 ships native binaries; skip npm's implicit node-gyp rebuild and smoke-test the binary.
RUN npm ci --omit=dev --ignore-scripts \
    && node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.close()" \
    && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    SERVE_CLIENT=true \
    CLIENT_DIST_PATH=/app/client/dist
WORKDIR /app/server

COPY --from=server-dependencies --chown=node:node /app/server/node_modules ./node_modules
COPY --chown=node:node server/package.json server/package-lock.json ./
COPY --chown=node:node server/src ./src
COPY --chown=node:node doc /app/doc
COPY --from=client-build --chown=node:node /app/client/dist /app/client/dist

USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/tools/productionStart.js"]
