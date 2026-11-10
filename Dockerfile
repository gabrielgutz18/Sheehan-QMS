# the queue system as one image: the built site and the API on one port, like npm start
# build and run it with compose.yaml (docker compose up -d --build); docs/DEPLOY-DOCKER.md has the steps

# ---------- build: install everything and build the site into dist/ ----------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# VITE_API_URL is built into the site; /api means the same server, which is what this image is
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---------- run: only what the server needs ----------
FROM node:24-bookworm-slim
# tzdata so TZ works for sqlite's 'localtime' too, not just javascript dates: queue numbers restart at local midnight
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    BACKUP_DIR=/backups \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# server/ imports the shared lists from src/data and src/admin, so src/ comes along
COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist

RUN mkdir -p /data /backups && chown node:node /data /backups
USER node

EXPOSE 3000
# the site answers once the server is listening; compose waits on this before calling it healthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server/server.js"]
