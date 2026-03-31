# ADR-002: Атомарный декремент использований

**Дата:** 2026-03-31
**Статус:** Принято
**Контекст:** Баг — использования не списывались у подписчиков

## Проблема

С момента запуска подписок (~22 марта) до 31 марта `remaining_uses` не декрементировался у подписчиков. Пользователи получали обработки бесплатно сверх лимита.

### Причины (3 бага одновременно)

1. **Не атомарный декремент** — `consumeUse()` читал значение в JS (`access.remainingUses`), вычислял `value - 1`, записывал обратно. При любом сбое (сеть, таймаут) запись терялась, а race condition позволял двум запросам прочитать одно значение.

2. **Возврат `consumeUse()` не проверялся** — в `process-gost/route.ts` и `process/route.ts` вызов был `await consumeUse(userId)` без проверки результата. Если декремент проваливался — обработка продолжалась бесплатно.

3. **`/api/process` пропускал подписки** — условие `access.accessType !== "subscription"` означало, что для подписчиков `consumeUse()` вообще не вызывался.

### Масштаб ущерба

- 5 подписчиков затронуты, суммарно 8 обработок не списаны
- Данные исправлены вручную через RPC `decrement_remaining_uses`

## Решение

### 1. SQL RPC для атомарного декремента

```sql
CREATE FUNCTION decrement_remaining_uses(p_user_id UUID) RETURNS INTEGER
  UPDATE user_access
  SET remaining_uses = remaining_uses - 1, updated_at = NOW()
  WHERE user_id = p_user_id AND remaining_uses > 0
  RETURNING remaining_uses;
  -- Возвращает -1 если нечего списывать
```

- `SECURITY DEFINER` — обходит RLS
- `WHERE remaining_uses > 0` — не уйдёт в минус
- Атомарная операция — нет race condition
- Миграция: `supabase/migration-011-atomic-decrement.sql`

### 2. Единый путь декремента в consumeUse()

- Все типы (subscription, subscription_plus, one_time) используют один RPC
- Fallback на `.update().gt("remaining_uses", 0)` если RPC недоступен
- Логирование ошибок через `console.error("[consumeUse] ...")`

### 3. Обязательная проверка возврата в API routes

```typescript
const consumed = await consumeUse(userId);
if (!consumed) {
  return NextResponse.json(
    { error: "Ошибка списания использования." },
    { status: 500 }
  );
}
```

## Правила на будущее

1. **Любая операция с счётчиками — только через SQL-атомарные операции** (RPC/функции). Никогда read-then-write в JS.
2. **Возврат критических функций всегда проверять.** Если `consumeUse` вернул `false` — не давать результат.
3. **Новый API route для обработки → копировать шаблон** из `process-gost/route.ts`, не писать с нуля.
4. **При добавлении нового access_type** — проверить что `consumeUse()` его обрабатывает (есть тест).
5. **`getSupabaseAdmin()` должен использовать `SUPABASE_SERVICE_ROLE_KEY`** — если переменная не задана, fallback на anon key опасен для записи. Добавить warning в лог.

## Файлы

| Файл | Изменение |
|------|-----------|
| `supabase/migration-011-atomic-decrement.sql` | RPC-функция |
| `src/lib/payment/access.ts` | Единый атомарный `consumeUse()` |
| `src/app/api/process-gost/route.ts` | Проверка возврата `consumeUse` |
| `src/app/api/process/route.ts` | Проверка возврата + фикс условия для подписок |
