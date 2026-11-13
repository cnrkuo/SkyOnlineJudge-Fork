# Production image of the web app. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t skyoj/web .
# (`compose.prod.yaml` does this for you.)

ARG NODE_IMAGE=docker.io/library/node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contract/package.json packages/contract/
COPY apps/web/package.json apps/web/
# Behind a TLS-intercepting proxy, pass its CA: --secret id=ca,src=ca.pem
RUN --mount=type=cache,id=skyoj-pnpm,target=/pnpm/store --mount=type=secret,id=ca \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi && \
    pnpm install --frozen-lockfile --filter '@skyoj/web...'
COPY packages/contract/tsconfig.json packages/contract/
COPY packages/contract/src packages/contract/src
COPY apps/web/tsconfig.json apps/web/react-router.config.ts apps/web/vite.config.ts apps/web/
COPY apps/web/app apps/web/app
COPY apps/web/public apps/web/public
RUN pnpm --filter @skyoj/contract run build && pnpm --filter @skyoj/web run build
RUN --mount=type=cache,id=skyoj-pnpm,target=/pnpm/store --mount=type=secret,id=ca \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi && \
    pnpm --filter @skyoj/web deploy --prod --legacy /out && rm -rf /out/app /out/public

FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "node_modules/@react-router/serve/bin.cjs", "build/server/index.js"]
