# Multi-stage build for Next.js standalone output.
# Builds on the server (no image registry). See docker-compose.yml / deploy.sh.

FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --no-audit --no-fund \
    --fetch-retries=5 \
    --fetch-retry-mintimeout=20000 \
    --fetch-retry-maxtimeout=120000

FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG BUILD_TIME=
RUN BT="${BUILD_TIME}" \
  && if [ -z "$BT" ]; then BT="$(TZ=Europe/Berlin date +%Y-%m-%d-%H-%M-%S)"; fi \
  && echo "Build version: $BT" \
  && NEXT_PUBLIC_BUILD_TIME="$BT" npm run build

FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/data
ENV GROUPS_CONFIG_FILE=/app/config/groups.yml

COPY --from=builder --chown=node:node /app/public ./public
RUN mkdir -p .next data config && chown -R node:node .next data config
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/config/groups.example.yml ./config/groups.example.yml


USER node
EXPOSE 3000
CMD ["node", "server.js"]
