#!/bin/sh
set -eu
cd /app/apps/api
pnpm exec prisma migrate deploy
pnpm exec tsx prisma/seed.ts
exec node dist/main.js
