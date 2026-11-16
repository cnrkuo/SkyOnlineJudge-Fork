# Production image of the web app. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t yato/web .
# (`compose.prod.yaml` does this for you.)

# Built with a current Node on Debian 13 (trixie); served by a distroless
# Node 26 image on the same Debian, which has no shell or package manager,
# for x86-64 hosts, running as its unprivileged `nonroot` user (uid 65532).
ARG BUILD_IMAGE=docker.io/library/node:26-trixie-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs26-debian13:nonroot-amd64

FROM ${BUILD_IMAGE} AS build
ENV PNPM_HOME=/pnpm CI=true
WORKDIR /src
# Node 25 and later no longer ship corepack: install the pnpm version that
# package.json pins with npm.
COPY package.json ./
# Behind a TLS-intercepting proxy, pass its CA: --secret id=ca,src=ca.pem
RUN --mount=type=secret,id=ca \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi && \
    npm install --global --no-fund --no-audit "$(node -p "require('./package.json').packageManager")"
COPY pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contract/package.json packages/contract/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=yato-pnpm,target=/pnpm/store --mount=type=secret,id=ca \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi && \
    pnpm install --frozen-lockfile --filter '@yato/web...'
COPY packages/contract/tsconfig.json packages/contract/
COPY packages/contract/src packages/contract/src
COPY apps/web/tsconfig.json apps/web/react-router.config.ts apps/web/vite.config.ts apps/web/server.js apps/web/
COPY apps/web/app apps/web/app
COPY apps/web/public apps/web/public
RUN pnpm --filter @yato/contract run build && pnpm --filter @yato/web run build
RUN --mount=type=cache,id=yato-pnpm,target=/pnpm/store --mount=type=secret,id=ca \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi && \
    pnpm --filter @yato/web deploy --prod --legacy /out && rm -rf /out/app /out/public

FROM ${RUNTIME_IMAGE}
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /out ./
EXPOSE 3000
# The image's entrypoint is node itself (/nodejs/bin/node).
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["server.js"]
