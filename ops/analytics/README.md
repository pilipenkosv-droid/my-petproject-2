# Архив аналитики: дневные снапшоты

Зачем: `jobs` живут 30 дней, `download_events` 90, `page_views` 30 — динамику воронки
старше месяца восстановить нельзя. Раз в сутки агрегат за прошедшие UTC-сутки уходит
в таблицу `analytics_daily` и в приватный репо `diplox-analytics`. См. ADR-018.

## Схема снапшота

```jsonc
{
  "day": "2026-09-18", "generated_at": "...", "schema": 1,
  "partial": [],            // ["jobs","page_views"] — день старше TTL, эти поля null, а не 0
  "registrations": 12,
  "page_views": 340,
  "jobs": { "total": 40, "auth": 25, "anon": 15,
            "by_status": {}, "by_work_type": {}, "by_requirements_mode": {},
            "full_version": 9, "top_referrers": [{ "host": "yandex.ru", "n": 12 }] },
  "downloads": { "total": 30, "original": 10, "formatted": 20 },
  "payments": { "initiated": 5, "completed": 3, "failed": 1, "revenue_rub": 1197,
                "by_offer_type": { "one_time": { "n": 2, "rub": 798 } },
                "hook": { "attempts": 2, "completed": 1 },
                "direct": { "attempts": 3, "completed": 2 },
                "median_hours_reg_to_pay": 4.5 },
  "csat": { "reviews": 4, "avg": 4.5, "distribution": { "5": 2 }, "by_source": {} },
  "cumulative": { "users": 1450, "payments_completed": 210, "revenue_rub": 83790 }
}
```

Персональных данных нет: ни email, ни `user_id`, ни `job_id`. `completed`/`revenue`
считаются по `payments.completed_at`, `initiated` — по `created_at`, задачи — по
`jobs.created_at` с `shadow_of IS NULL`. `cumulative` — состояние на конец дня.

## Установка на VDS (root@194.87.43.23)

```bash
# 1. Deploy key для приватного репо
ssh-keygen -t ed25519 -f /root/.ssh/id_ed25519_analytics -N ''
# локально: gh repo deploy-key add /path/to/id_ed25519_analytics.pub \
#   --repo pilipenkosv-droid/diplox-analytics --allow-write --title diplox-vds
cat >> /root/.ssh/config <<'CFG'
Host github-analytics
  HostName github.com
  User git
  IdentityFile /root/.ssh/id_ed25519_analytics
CFG

# 2. Клон
git clone github-analytics:pilipenkosv-droid/diplox-analytics /opt/diplox-analytics
cd /opt/diplox-analytics && git config user.email hello@diplox.online && git config user.name "diplox-vds"

# 3. Секрет (тот же CRON_SECRET, что у /api/cleanup)
printf 'CRON_SECRET=...\n' > /etc/diplox-analytics.env && chmod 600 /etc/diplox-analytics.env

# 4. Скрипт и крон
scp ops/analytics/sync.sh root@194.87.43.23:/opt/diplox-analytics-sync.sh
chmod +x /opt/diplox-analytics-sync.sh
( crontab -l; echo '30 0 * * * /opt/diplox-analytics-sync.sh' ) | crontab -
```

Проверка: `bash /opt/diplox-analytics-sync.sh` → новый коммит в репо, строка в
`/var/log/diplox-analytics.log`. Скрипт принимает дату аргументом:
`/opt/diplox-analytics-sync.sh 2026-09-18`.

## Бэкфилл (локально)

```bash
npx tsx scripts/analytics/backfill-daily.ts --from=2026-01-01 --out=/path/to/diplox-analytics
npx tsx scripts/analytics/backfill-daily.ts --from=2026-09-17 --dry-run
```

Без `--from` берётся самая ранняя дата из платежей и регистраций, без `--to` — вчера.
Скрипт пишет и в `analytics_daily`, и в `<out>/daily/YYYY-MM-DD.json`; коммит и пуш — руками.
