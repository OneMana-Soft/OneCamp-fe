# The OneCamp web app as a container, so a self-hosted server can serve it
# itself instead of needing a second deployment somewhere else.
#
# Everything the browser needs to know is baked in at build time (NEXT_PUBLIC_*),
# so the image is built on the server it runs on, for that server's domain:
#
#   docker build --build-arg ONECAMP_DOMAIN=example.com -t onecamp-web .
#
# The OneCamp server's installer does this for you (the "web" profile).
FROM node:22-alpine AS build
WORKDIR /app
# Pinned: newer pnpm refuses to install until each package with a build
# script is approved, which an unattended server build cannot answer.
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG ONECAMP_DOMAIN
# The same script `pnpm configure` runs by hand: every service address from one
# domain, written to .env.production.local, which the build then reads.
RUN test -n "$ONECAMP_DOMAIN" || { echo "Pass --build-arg ONECAMP_DOMAIN=your-domain.com" >&2; exit 1; } \
 && node scripts/setup-env.mjs --domain "$ONECAMP_DOMAIN" --force
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone \
    NODE_OPTIONS=--max-old-space-size=4096
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
