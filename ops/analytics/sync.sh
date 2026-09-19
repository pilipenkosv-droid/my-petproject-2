#!/usr/bin/env bash
# Дневной снапшот аналитики → приватный репо diplox-analytics (ADR-018).
# Ставится на VDS как /opt/diplox-analytics-sync.sh, крон 30 0 * * * (UTC).
# Установка и параметры — ops/analytics/README.md.
set -euo pipefail

REPO=/opt/diplox-analytics
LOG=/var/log/diplox-analytics.log
ENV_FILE=/etc/diplox-analytics.env

# shellcheck source=/dev/null
source "$ENV_FILE"

DAY="${1:-$(date -u -d yesterday +%F)}"
URL="https://diplox.online/api/cron/analytics-snapshot?date=$DAY"

mkdir -p "$REPO/daily"
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

STATUS=$(curl -fsS -o "$TMP" -w '%{http_code}' \
  -H "Authorization: Bearer $CRON_SECRET" "$URL") || {
  echo "$(date -u +%FT%TZ) $DAY curl failed (http ${STATUS:-000})" >> "$LOG"
  exit 1
}

jq . "$TMP" > "$REPO/daily/$DAY.json"

cd "$REPO"
git add daily
if git diff --cached --quiet; then
  echo "$(date -u +%FT%TZ) $DAY http $STATUS no changes" >> "$LOG"
else
  git commit -q -m "data: $DAY"
  git push -q
  echo "$(date -u +%FT%TZ) $DAY http $STATUS committed" >> "$LOG"
fi
