# Production image of the API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t skyoj/api .
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
# Manifests first, so the dependency layer is reused until they change.
COPY pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contract/package.json packages/contract/
COPY apps/api/package.json apps/api/
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
    pnpm --filter @skyoj/api deploy --prod --legacy /out && rm -rf /out/src && \
    mkdir -p /data

FROM ${RUNTIME_IMAGE}
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/var/lib/skyoj/data
WORKDIR /app
COPY --from=build /out ./
# The image has no shell to mkdir with: copy an empty directory, owned by the
# runtime user, so a new data volume starts out writable.
COPY --from=build --chown=nonroot:nonroot /data /var/lib/skyoj/data
EXPOSE 3001
# The image's entrypoint is node itself (/nodejs/bin/node).
# `auth.me` answers guests with null: a cheap request that exercises the whole stack.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3001/auth/me',{method:'POST'}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["dist/main.js"]
