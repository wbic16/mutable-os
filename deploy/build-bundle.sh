#!/usr/bin/env bash
# Build a mutable-os deploy bundle OFF the web box, and optionally push it
# straight to the box.
#
#   bash deploy/build-bundle.sh [--push]
#
# The web box has 3.8 GiB RAM and also runs phext-edit, SQ, and nginx.
# Building there is the fallback, not the plan (see deploy.md): the Vite
# client build needed a 3072 MB heap cap on the pre-update tree. This
# script installs, builds, prunes to production dependencies, and packs
# exactly what the server reads at runtime:
#
#   dist/               built client + server (server/index.ts serves
#                       dist/ statically and runs dist/server/index.js)
#   node_modules/       production-only (npm prune --omit=dev)
#   package.json        the server resolves its module tree against it
#   data/               templates + default document/workspace roots
#                       (server/index.ts: SPEEDY_*_ROOT or ../../data)
#   src/assets/hosted/  /video-backgrounds + /image-backgrounds roots
#                       (server/index.ts reads ../../src/assets/hosted)
#
# plus mutable-bundle.tar.gz.sha256 (SHA-256) beside the tarball.
# deploy/deploy.sh on the box verifies the hash and extracts the bundle
# instead of building.
#
# --push additionally scp's both files to PUSH_TARGET (default
# wbic16@44.248.235.76:/source/mutable-os/), e.g. from a ranch node such
# as aletheia-core, which can reach the box directly. Pushing is opt-in;
# the default is to only write the bundle next to this checkout.
#
# Native modules in the bundle (N-API, so the Node 22 box runtime and a
# Node 24 build host agree on ABI -- but the build host must still be
# linux x86_64 glibc, like the target): @surrealdb/node-native,
# better-sqlite3 (bundled prebuilds), @napi-rs/canvas, @img/sharp.
#
# Note: the prune step rewrites THIS checkout's node_modules to
# production-only. Run `npm install` here afterwards to restore dev
# dependencies. Any failed step aborts the script; no bundle is written
# from a failed build.
set -euo pipefail

PUSH=0
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    -h | --help)
      sed -n '2,40p' "$0"
      exit 0
      ;;
    *) printf 'build-bundle.sh: unknown argument: %s\n' "$arg" >&2; exit 1 ;;
  esac
done

PUSH_TARGET="${PUSH_TARGET:-wbic16@44.248.235.76:/source/mutable-os/}"
# Heap cap for the build. Measured floors: the pre-update tree's client
# build died at 2048 and needed 3072; after the 2026-11-03 dependency
# update (vite 8) the client build passes at 1024. 3072 stays the default
# so the script also works for an un-updated checkout; build hosts for
# this bundle (ranch node, this VM) have the RAM for it.
BUILD_NODE_OPTIONS="${BUILD_NODE_OPTIONS:---max-old-space-size=3072}"

cd "$(dirname "$0")/.."
[[ -f package.json && -f package-lock.json ]] || {
  printf 'build-bundle.sh: run from a mutable-os checkout (package.json/package-lock.json not found)\n' >&2
  exit 1
}

commit=$(git rev-parse --short HEAD 2>/dev/null || printf 'unknown')
printf 'build-bundle: building %s\n' "$commit"

# Install. NOT `npm ci`: with the updated lockfile, plain `npm ci` aborts
# on ERESOLVE (solid-devtools@0.34.5, unused in src/config, declares
# peerOptional vite ^2-^7 against vite 8). And NOT with install scripts:
# the only install scripts in the lockfile are esbuild's (validates the
# platform binary, which the @esbuild/linux-x64 package already ships),
# fsevents (macOS-only), and fs-ext's node-gyp build -- optional, absent
# from the verified production tree, and its node-gyp header extraction
# hard-fails in sandboxes that cannot chown (EPERM fchown), taking the
# whole install with it. Every native module the runtime needs ships
# prebuilds (@surrealdb/node-native, better-sqlite3, @napi-rs/canvas,
# @img/sharp), so --ignore-scripts loses nothing and needs no compiler
# toolchain on the build host. `npm install` against the committed,
# in-sync lockfile installs exactly the locked versions.
npm install --legacy-peer-deps --ignore-scripts --no-audit --no-fund

NODE_OPTIONS="$BUILD_NODE_OPTIONS" npm run build
[[ -f dist/server/index.js ]] || { printf 'build-bundle: dist/server/index.js missing after build\n' >&2; exit 1; }
[[ -f dist/index.html ]] || { printf 'build-bundle: dist/index.html missing after build\n' >&2; exit 1; }

npm prune --omit=dev --legacy-peer-deps

for path in dist node_modules package.json data src/assets/hosted; do
  [[ -e "$path" ]] || { printf 'build-bundle: required runtime path missing: %s\n' "$path" >&2; exit 1; }
done

rm -f mutable-bundle.tar.gz mutable-bundle.tar.gz.sha256
tar -czf mutable-bundle.tar.gz dist node_modules package.json data src/assets/hosted
sha256sum mutable-bundle.tar.gz > mutable-bundle.tar.gz.sha256

size=$(du -h mutable-bundle.tar.gz | awk '{print $1}')
sum=$(awk '{print $1}' mutable-bundle.tar.gz.sha256)
printf 'build-bundle: mutable-bundle.tar.gz  size=%s  sha256=%s\n' "$size" "$sum"

if [[ "$PUSH" == "1" ]]; then
  scp mutable-bundle.tar.gz mutable-bundle.tar.gz.sha256 "$PUSH_TARGET"
  printf 'build-bundle: pushed to %s\n' "$PUSH_TARGET"
  printf 'build-bundle: on the box, run: bash /source/mutable-os/deploy/deploy.sh\n'
fi
