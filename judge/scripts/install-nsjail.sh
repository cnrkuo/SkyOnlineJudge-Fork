#!/usr/bin/env bash
# Builds nsjail from a pinned upstream release and installs it.
#
#   sudo judge/scripts/install-nsjail.sh            # installs to /usr/local/bin
#   PREFIX=/opt/nsjail judge/scripts/install-nsjail.sh
#
# nsjail is not packaged for Debian/Ubuntu, so it is built from source.
# Requires: apt (for the build dependencies), git, a C++20 compiler.
set -euo pipefail

NSJAIL_TAG="3.6"
NSJAIL_COMMIT="f78475530b46d0186111a9096b30725f816b55fe"
PREFIX="${PREFIX:-/usr/local}"

if command -v apt-get >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q \
    git make g++ pkg-config bison flex protobuf-compiler libprotobuf-dev libnl-route-3-dev
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
git clone -q --depth 1 --branch "$NSJAIL_TAG" --recurse-submodules --shallow-submodules \
  https://github.com/google/nsjail.git "$workdir/nsjail"
actual="$(git -C "$workdir/nsjail" rev-parse HEAD)"
if [[ "$actual" != "$NSJAIL_COMMIT" ]]; then
  echo "nsjail $NSJAIL_TAG resolved to $actual, expected $NSJAIL_COMMIT; refusing to build" >&2
  exit 1
fi
make -C "$workdir/nsjail" -j"$(nproc)"
install -D -m 0755 "$workdir/nsjail/nsjail" "$PREFIX/bin/nsjail"
echo "installed $PREFIX/bin/nsjail ($NSJAIL_TAG)"
