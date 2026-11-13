# Judge machine image: the daemon, nsjail and the contestants' toolchains.
# Build from the repository root:
#   docker build -f judge/Dockerfile -t skyoj/judge .
#
# The container must be allowed to create user, PID, mount and network
# namespaces (security_opt seccomp, apparmor and systempaths=unconfined):
# every submission runs in its own nsjail jail. The compose files do this.

ARG UBUNTU_IMAGE=docker.io/library/ubuntu:24.04

FROM ${UBUNTU_IMAGE} AS build
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends \
      ca-certificates cmake g++ make git pkg-config libssl-dev \
      bison flex protobuf-compiler libprotobuf-dev libnl-route-3-dev
COPY judge/scripts/install-nsjail.sh /tmp/install-nsjail.sh
# Behind a TLS-intercepting proxy, pass its CA: --secret id=ca,src=ca.pem
RUN --mount=type=secret,id=ca \
    if [ -s /run/secrets/ca ]; then cp /run/secrets/ca /usr/local/share/ca-certificates/build-ca.crt && update-ca-certificates; fi && \
    PREFIX=/opt/nsjail /tmp/install-nsjail.sh
WORKDIR /src
COPY judge/CMakeLists.txt judge/
COPY judge/src judge/src
COPY judge/tests judge/tests
RUN cmake -S judge -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j"$(nproc)"

FROM ${UBUNTU_IMAGE}
# Toolchains offered to contestants (see judge/src/config.cpp) and the
# runtime libraries of nsjail and the judge.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends \
      gcc g++ libc6-dev clang libc++-dev libc++abi-dev python3 \
      libprotobuf32t64 libnl-route-3-200 libssl3t64 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /opt/nsjail/bin/nsjail /usr/local/bin/nsjail
COPY --from=build /src/build/skyoj-judge /usr/local/bin/skyoj-judge
# `docker compose run --rm judge judge-selftest` checks the sandbox on this host.
COPY --from=build /src/build/judge_tests /usr/local/bin/judge-selftest
ENV SKYOJ_API_URL=http://api:3001
VOLUME /var/lib/skyoj-judge
# Runs as root inside the container: nsjail maps each submission to an
# unprivileged uid in its own user namespace.
CMD ["skyoj-judge"]
