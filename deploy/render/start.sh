#!/bin/sh
set -eu

cd /app/metaverse

printf '%s\n' '[school-time] applying database migrations'
bunx prisma migrate deploy --schema packages/db/prisma/schema.prisma

printf '%s\n' '[school-time] synchronizing seed data'
bun packages/db/seed.ts

printf '%s\n' '[school-time] starting HTTP API'
bun apps/http/index.ts &
HTTP_PID=$!

printf '%s\n' '[school-time] starting WebSocket server'
bun apps/ws/index.ts &
WS_PID=$!

cleanup() {
  kill -TERM "$HTTP_PID" "$WS_PID" 2>/dev/null || true
  wait "$HTTP_PID" 2>/dev/null || true
  wait "$WS_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

printf '%s\n' '[school-time] starting public gateway on :10000'
nginx -c /etc/nginx/nginx.conf -g 'daemon off;'
