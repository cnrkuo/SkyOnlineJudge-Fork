# Production image of the API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t skyoj/api .
# (`compose.prod.yaml` does this for you.)

ARG NODE_IMAGE=docker.io/library/node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src
# Manifests first, so the dependency layer is reused until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contract/package.json packages/contract/
COPY apps/api/package.json apps/api/
# Behind a TLS-intercepting proxy, pass its CA: --secret id=ca,src=ca.pem
RUN --mount=type=cache,id=skyoj-pnpm,target=/pnpm/store --mount=type=secret,id=ca \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi && \
    pnpm install --frozen-lockfile --filter '@skyoj/api...'
# Only the sources are copied, never host build output or node_modules.
COPY packages/contract/tsconfig.json packages/contract/
COPY packages/contract/src packages/contract/src
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/api/migrations apps/api/migrations
RUN pnpm --filter '@skyoj/api...' run build
# A self-contained copy: production dependencies plus the built contract.
RUN --mount=type=cache,id=skyoj-pnpm,target=/pnpm/store --mount=type=secret,id=ca \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi && \
    pnpm --filter @skyoj/api deploy --prod --legacy /out && rm -rf /out/src

FROM ${NODE_IMAGE}
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/var/lib/skyoj/data
WORKDIR /app
COPY --from=build /out ./
RUN mkdir -p /var/lib/skyoj/data && chown -R node:node /var/lib/skyoj
USER node
EXPOSE 3001
# `auth.me` answers guests with null: a cheap request that exercises the whole stack.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/auth/me',{method:'POST'}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
