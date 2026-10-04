# School Time single-service production image.
# Public HTTP, WebSocket, authentication and the Phaser/React frontend share
# one Render Web Service so the browser can use /api and /socket on one origin.
FROM oven/bun:1.3.14-slim AS dependencies
WORKDIR /app/metaverse

COPY metaverse/package.json metaverse/bun.lock metaverse/.npmrc ./
COPY metaverse/apps/http/package.json apps/http/package.json
COPY metaverse/apps/web/package.json apps/web/package.json
COPY metaverse/apps/ws/package.json apps/ws/package.json
COPY metaverse/packages/db/package.json packages/db/package.json
COPY metaverse/packages/eslint-config/package.json packages/eslint-config/package.json
COPY metaverse/packages/lifecycle/package.json packages/lifecycle/package.json
COPY metaverse/packages/logger/package.json packages/logger/package.json
COPY metaverse/packages/types/package.json packages/types/package.json
COPY metaverse/packages/typescript-config/package.json packages/typescript-config/package.json
COPY metaverse/packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS source
COPY metaverse/ .
# Prisma 7 loads prisma.config.ts during image build; schema generation does not
# need a live database, but the config requires DATABASE_URL to exist.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN cd packages/db && bunx prisma generate

FROM source AS web-build
WORKDIR /app/metaverse/apps/web
RUN bun run build

FROM oven/bun:1.3.14-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default

WORKDIR /app/metaverse
COPY --from=source /app/metaverse /app/metaverse
COPY --from=web-build /app/metaverse/apps/web/dist /usr/share/nginx/html
COPY deploy/render/nginx.conf /etc/nginx/nginx.conf
COPY deploy/render/start.sh /usr/local/bin/school-time-start
RUN chmod +x /usr/local/bin/school-time-start \
  && mkdir -p /run/nginx

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["/usr/local/bin/school-time-start"]
