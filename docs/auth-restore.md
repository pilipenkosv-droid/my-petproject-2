# Восстановление auth-токенов для SEO-аналитики

Некоторые API (GA4 Data, Yandex Webmaster) требуют интерактивной OAuth-авторизации — это делает только человек. Ниже — точные команды.

После завершения — напиши "auth готов", и я запущу скрипты для сбора GA4 + Yandex Webmaster данных.

---

## 1. Google ADC — для GA4 Data API (30 секунд)

Текущий `application_default_credentials.json` просрочен. Обновляем:

```bash
gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/userinfo.email
```

Откроется браузер — выбери свой Google-аккаунт, на который подключён diplox.online в GA4, подтверди доступ.

**Проверка успеха:**
```bash
curl -s -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  "https://analyticsadmin.googleapis.com/v1beta/accountSummaries" | head -20
```
Должно вернуть JSON с твоими GA4-аккаунтами (не 401).

---

## 2. Yandex Webmaster OAuth — для keyword API (5 минут)

У текущего `YANDEX_DIRECT_TOKEN` нет scope для Webmaster. Делаем новый токен.

### Шаг 2.1. Зарегистрировать OAuth-приложение

1. Открой https://oauth.yandex.ru/client/new
2. Заполни:
   - **Название:** Diplox SEO Tools
   - **Платформы:** "Веб-сервисы"
   - **Redirect URI:** `https://oauth.yandex.ru/verification_code`
   - **Права доступа (scopes):**
     - `webmaster:hosts` (чтение хостов)
     - `webmaster:verify` (верификация сайта)
3. Сохрани → получишь **ClientID** и **ClientSecret**

### Шаг 2.2. Получить токен

Открой в браузере (подставь свой ClientID):

```
https://oauth.yandex.ru/authorize?response_type=token&client_id=<ClientID>
```

Авторизуешься → редирект с `#access_token=y0_...` в URL. Скопируй этот токен.

### Шаг 2.3. Сохранить в .env.local

Добавь в `/Users/sergejpilipenko/DIplox/.env.local`:

```
YANDEX_WEBMASTER_TOKEN=y0_...твой_токен...
```

**Проверка успеха:**
```bash
curl -s -H "Authorization: OAuth $YANDEX_WEBMASTER_TOKEN" \
  "https://api.webmaster.yandex.net/v4/user/" | head -5
```
Должно вернуть `{"user_id": ...}` без `ACCESS_FORBIDDEN`.

---

## Что будет разблокировано после

| Источник | Что получим |
|---|---|
| GA4 Data API | Сравнение Google vs Yandex по сессиям, конверсиям, landing pages за 28/90 дней |
| GA4 Real-time | Мониторинг — сколько приходит прямо сейчас, по каким запросам |
| Yandex Webmaster | Топ-запросы Яндекса, позиции, clicks, impressions — для честного сравнения с GSC |
| Yandex Webmaster + GSC | **Главная матрица:** какие запросы уникальны для каждой поисковой системы |

---

## Если что-то не получается

- gcloud не установлен: `brew install google-cloud-sdk`
- Браузер не открывается при `gcloud auth`: добавь флаг `--no-launch-browser` — получишь URL для ручного открытия
- OAuth Yandex ругается на scope: убедись, что указаны именно `webmaster:hosts` и `webmaster:verify` (не `direct`)
