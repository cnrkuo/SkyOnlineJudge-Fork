# Node toolchain for the development stack (compose.yaml). The source is
# bind-mounted at /workspace; dependencies live in named volumes.
ARG NODE_IMAGE=docker.io/library/node:22-bookworm-slim
FROM ${NODE_IMAGE}
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_HOME=/opt/corepack \
    # Same volume as node_modules, so pnpm can hard-link from its store.
    npm_config_store_dir=/workspace/node_modules/.pnpm-store
# Behind a TLS-intercepting proxy, pass its CA (BUILD_CA_CERT in compose.yaml).
# Unlike the production images, this development image keeps it, because
# pnpm install runs in the container. Without one the file stays empty.
ENV NODE_EXTRA_CA_CERTS=/etc/skyoj-dev/extra-ca.pem
COPY package.json /tmp/package.json
RUN --mount=type=secret,id=ca \
    mkdir -p /etc/skyoj-dev && cat /run/secrets/ca > /etc/skyoj-dev/extra-ca.pem 2>/dev/null || : ; \
    corepack enable && corepack install -g "$(node -p "require('/tmp/package.json').packageManager")" && \
    chmod -R a+rX /opt/corepack
# Mount points of the dependency volumes, owned by the default dev user
# (node, uid 1000) so fresh volumes start out writable.
RUN mkdir -p /workspace/node_modules /workspace/packages/contract/node_modules \
      /workspace/apps/api/node_modules /workspace/apps/web/node_modules && \
    chown -R node:node /workspace
WORKDIR /workspace
