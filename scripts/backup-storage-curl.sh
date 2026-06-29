#!/bin/bash
# Параллельная выгрузка Supabase Storage на внешний диск через curl.
# Идемпотентно: пропускает уже скачанные непустые файлы.
# Маршрут к supabase.co должен идти через PROXY (Shadowrocket) — иначе РФ-троттлинг.
#
# Запуск: bash scripts/backup-storage-curl.sh
set -uo pipefail

REPO="/Volumes/Seagate Disk/mac-2026-05-09/Projects/DIplox"
DEST="/Volumes/Seagate Disk/diplox-supabase-backup"
SCR="/private/tmp/claude-501/-Volumes-Seagate-Disk-mac-2026-05-09-Projects-DIplox/cf4b153d-8a39-4923-bab1-a9e136879aa4/scratchpad"
PARALLEL=8

# Защита: не писать внутрь репозитория
case "$DEST" in
  "$REPO"*) echo "[safety] DEST внутри репозитория — отмена"; exit 1;;
esac

set -a; . "$REPO/.env.local"; set +a
export URL="$NEXT_PUBLIC_SUPABASE_URL"
export KEY="$SUPABASE_SERVICE_ROLE_KEY"
export DEST

# Загрузка одного объекта. Аргументы передаются ОТДЕЛЬНО (без разделителей):
#   $1 = bucket, $2 = name
dl_one() {
  local bucket="$1" name="$2" target got
  target="$DEST/storage/$bucket/$name"
  # idempotent: пропуск если файл уже есть и непустой
  if [[ -s "$target" ]]; then return 0; fi
  mkdir -p "$(dirname "$target")"
  curl -s --max-time 120 --retry 3 --retry-delay 2 \
    -o "$target" -H "Authorization: Bearer $KEY" \
    "$URL/storage/v1/object/$bucket/$name"
  got=$(stat -f%z "$target" 2>/dev/null || echo -1)
  if [[ "$got" -le 0 ]]; then
    echo "FAIL $bucket/$name got=$got" >> "$DEST/failures.log"
  fi
}
export -f dl_one

mkdir -p "$DEST/storage/documents" "$DEST/storage/results"
: > "$DEST/failures.log"

for B in documents results; do
  echo "=== $B: $(wc -l < "$SCR/names-$B.txt" | tr -d ' ') объектов ==="
  # каждое имя — отдельный аргумент; bucket фиксирован для цикла
  xargs -P "$PARALLEL" -I{} bash -c 'dl_one "$1" "$2"' _ "$B" {} < "$SCR/names-$B.txt"
  cnt=$(find "$DEST/storage/$B" -type f | wc -l | tr -d ' ')
  sz=$(du -sh "$DEST/storage/$B" | cut -f1)
  echo "=== $B готово: файлов=$cnt размер=$sz ==="
done

echo "=== ИТОГО ==="
du -sh "$DEST/storage"/* 2>/dev/null
echo "failures: $(wc -l < "$DEST/failures.log" | tr -d ' ')"
echo "DONE"
