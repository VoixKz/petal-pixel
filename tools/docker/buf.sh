#!/usr/bin/env sh
# Regenerate proto stubs (Go + frontend TS) via pinned buf Docker image.
# Host needs only Docker. Run from anywhere.
set -eu
BUF_IMAGE="bufbuild/buf:1.47.2"
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
echo "buf.sh: generating Go stubs -> flower-backend/gen/go"
docker run --rm -v "$REPO_ROOT":/workspace -w /workspace/flower-backend "$BUF_IMAGE" generate
echo "buf.sh: generating frontend TS stubs -> petal-pixel-studio/src/gen"
docker run --rm -v "$REPO_ROOT":/workspace -w /workspace/flower-backend "$BUF_IMAGE" generate --template buf.gen.frontend.yaml
echo "buf.sh: done. Review 'git diff' before committing."
