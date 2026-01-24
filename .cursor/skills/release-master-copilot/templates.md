# Шаблоны для Release Master Copilot

## Release Plan

```
# Release Plan: [Название релиза]

## Контекст
[1-2 предложения: что за релиз, почему сейчас, бизнес-ценность]

## Содержание релиза
### Основные изменения
- [Фича 1]: [краткое описание]
- [Фича 2]: [краткое описание]

### Технические изменения
- [Задача/тикет]: [описание]
- [Задача/тикет]: [описание]

### Миграции и breaking changes
- [Если есть]: [описание + план миграции]

## Риски и зависимости
### High Risk
- [Риск]: [вероятность] [impact] [план mitigation]

### Зависимые системы
- [Система]: [что может сломаться + план проверки]

## Критерии готовности (Go/No-Go)
- [ ] Все acceptance criteria выполнены
- [ ] Тесты пройдены (unit/integration/e2e)
- [ ] Performance/load testing завершено
- [ ] Security review пройден
- [ ] Rollback plan готов
- [ ] Monitoring/alerting настроен

## Таймлайн
- Code freeze: [дата/время]
- QA sign-off: [дата/время]
- Deployment window: [дата/время, продолжительность]
- Go-live: [дата/время]

## Ответственные
- Release Manager: [имя]
- Tech Lead: [имя]
- QA Lead: [имя]
- DevOps: [имя]
- Business Owner: [имя]

## Коммуникации
- Go/No-Go митинг: [дата/время/ссылка]
- Status updates: [канал/частота]
- Rollback triggers: [критерии + ответственный]
```

## Release Checklist

```
# Release Checklist: [Название релиза]

## Pre-Release (за 24-48 часов)
- [ ] Feature freeze соблюден
- [ ] Все PR смержены в release branch
- [ ] CI/CD пайплайн прошел успешно
- [ ] Тесты: unit (100%), integration (100%), e2e (95%+)
- [ ] Performance baseline установлен
- [ ] Database migrations протестированы
- [ ] Rollback plan задокументирован
- [ ] Monitoring dashboards готовы
- [ ] Alert thresholds настроены
- [ ] Stakeholder notification отправлена

## Deployment (D-day)
- [ ] Pre-deployment backup создан
- [ ] Deployment window подтвержден
- [ ] All hands on deck собрана
- [ ] Go/No-Go митинг проведен
- [ ] Deployment скрипт выполнен
- [ ] Smoke tests пройдены
- [ ] Feature flags активированы поэтапно

## Post-Release (первые 24-48 часов)
- [ ] Application health checks (200 OK, logs clean)
- [ ] Business metrics мониторятся
- [ ] Error rates в норме (< 1%)
- [ ] Performance не degraded (> 95% baseline)
- [ ] User feedback собирается
- [ ] Rollback readiness проверена (можно откатить за N минут)
- [ ] Retrospective запланирована
```

## Release Notes (для пользователей)

```
# Релиз [Версия] - [Дата]

## 🚀 Новые возможности
### [Категория фичи]
- **Фича**: [Описание что нового, пример использования]
- **Фича**: [Описание что нового, пример использования]

## 🔧 Улучшения
- **Улучшение**: [Что стало лучше/быстрее/проще]
- **Улучшение**: [Что стало лучше/быстрее/проще]

## 🐛 Исправления
- **Фикс**: [Что было сломано, как исправлено]
- **Фикс**: [Что было сломано, как исправлено]

## 📋 Известные ограничения
- [Если есть]: [Описание + план исправления в следующем релизе]

## 📞 Поддержка
При возникновении вопросов обращайтесь в [канал/почта/телефон поддержки]
```

## Release Notes (внутренние)

```
# Release [Версия] - Internal Notes

## Команды разработки
### Deployed changes
- [TASK-123]: [Заголовок] ([responsible dev])
- [TASK-456]: [Заголовок] ([responsible dev])

### Breaking changes & migrations
- [Если есть]: [Подробное описание + rollback инструкции]

### Monitoring points
- Watch metric: [метрика] (threshold: [значение])
- Check logs: [паттерн для поиска]
- Alert if: [условие]

## Команды поддержки
### Новые фичи для пользователей
- [Фича]: [Как работает, где найти, как помочь пользователю]

### Известные issues
- [Issue]: [Описание + workaround + ссылка на фикс]

### Контакты при проблемах
- Tech issues: [dev on-call]
- Business issues: [product owner]

## Команды QA/Ops
### Тест кейсы добавлены
- [Ссылка на тест кейсы]
- [Критичные сценарии для регрессии]

### Infrastructure changes
- [Если есть]: [Что изменилось + monitoring]
```

## Rollback Plan

```
# Rollback Plan: [Название релиза]

## Критерии для отката
- Business impact: [критичные метрики/функции]
- Technical triggers: [error rates, response times, etc.]
- Time window: [в первые N часов после релиза]

## Rollback процедура
### Шаг 1: Остановка трафика
```bash
# Остановить ingress/routing
kubectl scale deployment app --replicas=0
```

### Шаг 2: Rollback кода
```bash
# Git rollback или container rollback
git checkout [previous-tag]
# или
kubectl rollout undo deployment/app
```

### Шаг 3: Rollback базы данных
```bash
# Если есть migrations - откатить
# Backup restore если нужно
```

### Шаг 4: Восстановление конфигурации
```bash
# Feature flags, environment variables
# External integrations restore
```

## Время выполнения
- Полный rollback: [N] минут
- Business impact window: [M] минут

## Post-rollback действия
- [ ] Health checks всех сервисов
- [ ] Data consistency verification
- [ ] User communication (если нужно)
- [ ] Root cause analysis запланирована
```

## Monitoring & Validation Plan

```
# Post-Release Monitoring: [Название релиза]

## Health Checks (автоматические)
### Application
- HTTP 200 responses: > 99.9%
- Error rate: < 1%
- Response time P95: < [baseline + 10%]

### Infrastructure
- CPU usage: < 80%
- Memory usage: < 85%
- Disk space: > 20% free

## Business Metrics (следить 24-48 часов)
- [Метрика 1]: baseline [значение], alert if < [threshold]
- [Метрика 2]: baseline [значение], alert if < [threshold]

## Manual Validation (QA team)
- [ ] Critical user journeys tested
- [ ] Data integrity verified
- [ ] Third-party integrations working
- [ ] Performance under load checked

## Alert Configuration
### Immediate alerts (< 5 min)
- Application down
- Critical errors > 10/min
- Database connection issues

### Escalation alerts (< 15 min)
- Error rate > 5%
- Response time degradation > 50%
- Business metric drop > 20%

## Communication Plan
- Status updates: every [N] hours to [канал]
- Escalation: [критерии] → [ответственный] → [менеджмент]
- All clear: [когда объявлять успех]
```

## Git Branching Strategy

```
# Release Branching Model

## Основные ветки
- main/master: production-ready code
- develop: integration branch
- release/v[version]: release preparation
- feature/*: feature development

## Release flow
1. Feature branches → develop (merge via PR)
2. develop → release/vX.Y.Z (cut release branch)
3. release/vX.Y.Z → main (tag + deploy to prod)
4. Hotfixes: release/vX.Y.Z-hotfix → main

## Тэги
- v[major].[minor].[patch] - release tags
- v[major].[minor].[patch]-rc.[num] - release candidates
- v[major].[minor].[patch]-hotfix.[num] - hotfix releases

## CI/CD Pipeline
- feature/*: build + unit tests
- develop: build + integration tests + deploy to staging
- release/*: build + full test suite + deploy to pre-prod
- main: build + smoke tests + deploy to prod
```
