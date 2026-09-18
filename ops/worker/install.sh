#!/usr/bin/env bash
# Разворачивает воркер обработки документов на VDS (Ubuntu 24.04).
# Запускать от root: sudo bash install.sh [каталог_с_распакованным_tar] [--start]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC=""
START=0
for arg in "$@"; do
  if [ "$arg" = "--start" ]; then START=1; else SRC="$arg"; fi
done
# без аргумента берём каталог скрипта; внутри распакованного tar скрипт лежит в ops/worker
if [ -z "$SRC" ]; then
  if [ -d "$HERE/dist" ]; then SRC="$HERE"; else SRC="$(cd "$HERE/../.." && pwd)"; fi
fi

APP=/opt/diplox-worker
ENV_FILE=/etc/diplox-worker.env
UNIT=/etc/systemd/system/diplox-worker.service

# 1. Node 22 LTS из NodeSource (в apt Ubuntu 24.04 лежит Node 18, Node 20 — EOL с 30.04.2026)
NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
fi
if [ "$NODE_MAJOR" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# 2. Локальные бинарники пайплайна v6:
#    libreoffice-writer — рендер PDF для номеров страниц в содержании (soffice),
#    poppler-utils — pdftotext, fonts-liberation — метрически совместимы с Times New Roman
#    (без них soffice подменяет шрифт и разбивка на страницы уезжает). pandoc уже стоит.
apt-get update -qq
apt-get install -y --no-install-recommends libreoffice-writer poppler-utils fonts-liberation

# 3. Бандл и данные, которые пайплайн ищет по относительным путям от cwd
mkdir -p "$APP"
rm -rf "$APP/dist"
cp -r "$SRC/dist" "$APP/dist"
mkdir -p "$APP/scripts/pipeline-v6/spike-pandoc"
cp "$SRC/scripts/pipeline-v6/spike-pandoc/reference-gost.docx" "$APP/scripts/pipeline-v6/spike-pandoc/"
rm -rf "$APP/templates"
cp -r "$SRC/templates" "$APP/templates"

# 4. Файл окружения — только шаблон, значения вписывает владелец
if [ ! -f "$ENV_FILE" ]; then
  cp "$SRC/ops/worker/diplox-worker.env.example" "$ENV_FILE"
  chown root:root "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Создан $ENV_FILE — впиши значения до первого запуска."
fi

# 5. Юнит
cp "$SRC/ops/worker/diplox-worker.service" "$UNIT"
systemctl daemon-reload
systemctl enable diplox-worker

# 6. Крон: health-проверка и уборка временных каталогов.
#    Юнит идёт с PrivateTmp=true, поэтому каталоги пайплайна лежат в приватном /tmp
#    и гибнут вместе с процессом; строка find подметает хост-овый /tmp — она нужна
#    только если PrivateTmp когда-нибудь выключат. Оставлена, как просит ADR-016.
add_cron() {
  if ! crontab -l 2>/dev/null | grep -Fq "$2"; then
    (crontab -l 2>/dev/null; echo "$1") | crontab -
    echo "Крон-запись добавлена: $2"
  fi
}
add_cron '*/15 * * * * /opt/diplox-cron.sh /api/health/worker auth' '/api/health/worker'
add_cron "0 4 * * * find /tmp -maxdepth 1 \\( -name 'pandoc-v6-*' -o -name 'v6-*' \\) -mmin +120 -exec rm -rf {} +" 'pandoc-v6-'

# 7. Первый запуск — только по флагу: владелец сперва смотрит env
if [ "$START" = "1" ]; then
  systemctl start diplox-worker
fi

echo
echo "=== Установлено ==="
echo "node:        $(node -v)"
echo "soffice:     $(command -v soffice || echo 'НЕ НАЙДЕН')"
echo "pdftotext:   $(command -v pdftotext || echo 'НЕ НАЙДЕН')"
echo "pandoc:      $(command -v pandoc || echo 'НЕ НАЙДЕН')"
echo "каталог:     $APP"
echo "окружение:   $ENV_FILE (0600 root)"
echo "юнит:        $UNIT (enabled)"
if [ "$START" = "1" ]; then
  echo "служба:      запущена (--start)"
else
  echo "служба:      НЕ запущена — впиши $ENV_FILE и выполни: systemctl start diplox-worker"
fi
