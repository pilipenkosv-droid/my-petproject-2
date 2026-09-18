#!/usr/bin/env bash
# Сборка бандла воркера на Mac и доставка на VDS: build -> tar -> scp -> install.sh.
# Запускать из корня репозитория: bash ops/worker/deploy.sh [--start] [--no-restart] [--dry-run]
set -euo pipefail

WORKER_HOST="${WORKER_HOST:-root@194.87.43.23}"
WORKER_SSH_KEY="${WORKER_SSH_KEY:-$HOME/.ssh/id_ed25519_vds}"
REMOTE_TAR=/tmp/diplox-worker.tar.gz
REMOTE_DIR=/tmp/diplox-worker-unpack

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
START=""
RESTART=1
DRY=0
for arg in "$@"; do
  case "$arg" in
    --start) START="--start" ;;
    --no-restart) RESTART=0 ;;
    --dry-run) DRY=1 ;;
    *) echo "Неизвестный аргумент: $arg" >&2; exit 1 ;;
  esac
done

run() {
  if [ "$DRY" = "1" ]; then
    printf '%s\n' "$*"
  else
    "$@"
  fi
}

TAR_FILE="${TMPDIR:-/tmp}/diplox-worker-$$.tar.gz"

run npm run worker:build
run tar -czf "$TAR_FILE" -C "$ROOT" \
  ops/worker/dist \
  scripts/pipeline-v6/spike-pandoc/reference-gost.docx \
  templates \
  ops/worker/install.sh \
  ops/worker/diplox-worker.service \
  ops/worker/diplox-worker.env.example
run scp -i "$WORKER_SSH_KEY" "$TAR_FILE" "$WORKER_HOST:$REMOTE_TAR"
# dist приезжает как ops/worker/dist — install.sh ждёт его в корне распаковки
run ssh -i "$WORKER_SSH_KEY" "$WORKER_HOST" \
  "set -e; rm -rf $REMOTE_DIR; mkdir -p $REMOTE_DIR; tar -xzf $REMOTE_TAR -C $REMOTE_DIR; mv $REMOTE_DIR/ops/worker/dist $REMOTE_DIR/dist; bash $REMOTE_DIR/ops/worker/install.sh $REMOTE_DIR $START"
if [ "$RESTART" = "1" ]; then
  run ssh -i "$WORKER_SSH_KEY" "$WORKER_HOST" "systemctl restart diplox-worker"
fi
run ssh -i "$WORKER_SSH_KEY" "$WORKER_HOST" "systemctl status diplox-worker --no-pager"
run rm -f "$TAR_FILE"
