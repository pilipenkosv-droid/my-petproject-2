#!/usr/bin/env bash
# Разворачивает ночной конвейер блога на сервере (Ubuntu 24.04, системный python3).
# Запускать от root: sudo bash install.sh [путь_к_исходникам]
set -euo pipefail

SRC="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
APP=/opt/diplox-blog
DATA=/var/lib/diplox-blog
LOGS=/var/log/diplox-blog
ENV_FILE=/etc/diplox-blog.env

mkdir -p "$APP" "$DATA" "$LOGS"
cp "$SRC"/*.py "$SRC"/config.toml "$SRC"/seeds.txt "$APP"/
mkdir -p "$APP/prompts" "$APP/schemas"
cp "$SRC"/prompts/* "$APP/prompts/"
cp "$SRC"/schemas/* "$APP/schemas/"
cp -r "$SRC/tests" "$APP/tests"
# ручной импорт частотности Wordstat: ищем рядом с исходниками или в репо
mkdir -p "$APP/docs"
for cand in "$SRC/docs/wordstat-raw-data.json" "$SRC/../../docs/wordstat-raw-data.json"; do
  [ -f "$cand" ] && cp "$cand" "$APP/docs/" && break
done
chmod +x "$APP/run.py"

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'ENV'
CROMINM_API_KEY=
CROMINM_BASE_URL=https://api.crominm.com/v1
BLOG_PUBLISH_TOKEN=
SITE_URL=https://diplox.online
# необязательно:
# GSC_SERVICE_ACCOUNT_JSON=/root/.config/indexing-api/service-account.json
ENV
  chmod 600 "$ENV_FILE"
  echo "Создан $ENV_FILE — впиши ключи."
fi

# крон не читает /etc/diplox-blog.env сам — подгружаем в строке
CRON_LINE='0 2 * * * set -a; . /etc/diplox-blog.env; set +a; /usr/bin/python3 /opt/diplox-blog/run.py --stage all >> /var/log/diplox-blog/cron.log 2>&1'
if ! crontab -l 2>/dev/null | grep -Fq '/opt/diplox-blog/run.py'; then
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "Крон-запись добавлена."
fi

echo "Готово. Сухой прогон:"
echo "  set -a; . $ENV_FILE; set +a; BLOG_DRY_RUN=1 python3 $APP/run.py --stage all"
