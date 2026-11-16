# Node toolchain for the development stack (compose.yaml). The source is
# bind-mounted at /workspace; dependencies live in named volumes.
ARG NODE_IMAGE=docker.io/library/node:26-trixie
FROM ${NODE_IMAGE}
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true \
    # Same volume as node_modules, so pnpm can hard-link from its store.
    npm_config_store_dir=/workspace/node_modules/.pnpm-store
# Behind a TLS-intercepting proxy, pass its CA (BUILD_CA_CERT in compose.yaml).
# Unlike the production images, this development image keeps it, because
# pnpm install runs in the container. Without one the file stays empty.
ENV NODE_EXTRA_CA_CERTS=/etc/yato-dev/extra-ca.pem
COPY package.json /tmp/package.json
RUN --mount=type=secret,id=ca \
    mkdir -p /etc/yato-dev && cat /run/secrets/ca > /etc/yato-dev/extra-ca.pem 2>/dev/null || : ; \
    # Node 25 and later no longer ship corepack: install the pinned pnpm with npm.
    NODE_EXTRA_CA_CERTS=/etc/yato-dev/extra-ca.pem npm install --global --no-fund --no-audit \
      "$(node -p "require('/tmp/package.json').packageManager")"
# Mount points of the dependency volumes, owned by the default dev user
# (node, uid 1000) so fresh volumes start out writable.
RUN mkdir -p /workspace/node_modules /workspace/packages/contract/node_modules \
      /workspace/apps/api/node_modules /workspace/apps/web/node_modules && \
    chown -R node:node /workspace
WORKDIR /workspace
