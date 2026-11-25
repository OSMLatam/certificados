# Production API. Chromium renders certificates. The process runs as the
# unprivileged node user; the sandbox needs host capabilities this image does
# not assume, so PUPPETEER_NO_SANDBOX stays on.
FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/api apps/api
COPY docs/anexos docs/anexos
ENV DATABASE_URL=postgresql://certificados:certificados@postgres:5432/certificados
RUN pnpm --filter @certificados/shared build \
  && pnpm --filter api exec prisma generate \
  && pnpm --filter api build

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY --from=build /app /app
COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint
RUN chmod 755 /usr/local/bin/api-entrypoint && chown -R node:node /app

ENV NODE_ENV=production \
    PORT=3000 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_NO_SANDBOX=true \
    HOME=/home/node

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["api-entrypoint"]
