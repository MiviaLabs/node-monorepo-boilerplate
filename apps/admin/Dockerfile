# =============================================================================
# Production-ready Dockerfile for Next.js Admin App
# =============================================================================

FROM node:24-alpine AS deps

RUN npm install -g pnpm@10.29.3 && pnpm --version

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc nx.json tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/project.json ./apps/admin/

RUN pnpm install --frozen-lockfile --prefer-offline

FROM node:24-alpine AS builder

RUN npm install -g pnpm@10.29.3 && pnpm --version

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules

COPY package.json pnpm-workspace.yaml nx.json tsconfig.base.json types.d.ts ./
COPY apps/admin ./apps/admin

RUN npx nx reset
RUN pnpm nx build admin --configuration=production --webpack

FROM node:24-alpine AS runner

RUN apk add --no-cache jq curl unzip gcompat

RUN OP_VERSION="v2.29.0" && \
    curl -sSfLo /tmp/op.zip "https://cache.agilebits.com/dist/1P/op2/pkg/${OP_VERSION}/op_linux_amd64_v2.29.0.zip" && \
    unzip /tmp/op.zip -d /tmp && \
    mv /tmp/op /usr/local/bin/op && \
    chmod +x /usr/local/bin/op && \
    rm -f /tmp/op.zip /tmp/op && \
    op --version && jq --version

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV ADMIN_HOSTNAME=0.0.0.0
ENV PORT=3002

COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone/apps/admin/.next ./apps/admin/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone/apps/admin/package.json ./apps/admin/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone/apps/admin/server.js ./apps/admin/server.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

COPY --chown=nextjs:nodejs apps/admin/entrypoint.sh ./entrypoint.sh
COPY --chown=nextjs:nodejs scripts/load-1password-secrets.sh ./scripts/load-1password-secrets.sh

RUN chmod +x ./entrypoint.sh ./scripts/load-1password-secrets.sh

USER nextjs

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3002/', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
