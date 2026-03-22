-- Пропускаем существующие 17 статей, чтобы не спамить все разом при первом запуске cron
INSERT INTO blog_distribution_log (slug, platform, status, distributed_at)
SELECT p.slug, pl.platform, 'skipped', now()
FROM unnest(ARRAY[
  'bot-teper-ponimaet-foto',
  'zachem-studentu-ai-bot-v-telegram-399-rubley',
  'ai-naparnik-telegram-bot-dlya-studentov',
  'kak-oformit-diplom-po-gostu',
  'trebovaniya-k-kursovoj-rabote',
  'otstupy-i-intervaly-po-gostu',
  'spisok-literatury-gost-7-1',
  'formatirovanie-tablic-i-risunkov',
  'bezopasnost-antiplagiat',
  'kak-rabotaet-antiplagiat',
  'gosty-dlya-oformleniya-nauchnyh-rabot',
  'kak-oformit-titulnyj-list-po-gostu',
  'numeraciya-stranic-po-gostu',
  'oformlenie-vvedeniya-i-zaklyucheniya',
  'kak-oformit-snoski-v-word',
  'ai-servisy-dlya-formatirovaniya-rabot-2026',
  '6-instrumentov-dlya-podgotovki-nauchnyh-rabot'
]) AS p(slug)
CROSS JOIN (VALUES ('telegram'),('vk'),('vc'),('habr')) AS pl(platform)
ON CONFLICT (slug, platform) DO NOTHING;
