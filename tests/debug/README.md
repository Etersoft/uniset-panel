# Debug Scripts

Эта директория содержит debug скрипты для ручного тестирования UI в браузере при помощи Playwright.

## Скрипты

### debug-opcuaserver-sse.js
Проверяет SSE поддержку в OPCUAServerRenderer:
- ✅ Наличие метода `handleOPCUASensorUpdates()`
- ✅ Отсутствие старого метода `handleSSEUpdate()`
- ✅ Наличие метода `batchRenderUpdates()`
- ✅ Подписка на SSE обновления
- ⚠️ Получение SSE событий (может не работать если backend не эмулирует изменения)

**Запуск:**
```bash
# Запустить test окружение
docker-compose up -d viewer

# Запустить debug скрипт
cd tests && node debug/debug-opcuaserver-sse.js

# Остановить окружение
docker-compose down
```

### debug-subscription.js
Проверяет подписку на Modbus SSE обновления.

**Запуск:**
```bash
cd tests && node debug/debug-subscription.js
```

## Важно

**Эти скрипты НЕ запускаются при `make js-tests`**.

`make js-tests` запускает только тесты из `tests/single/` директории.

Debug скрипты предназначены для ручного запуска во время разработки.
