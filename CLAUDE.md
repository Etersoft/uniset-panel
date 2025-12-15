# Claude Code Guidelines

## Testing

E2E тесты (Playwright) запускаются через docker-compose:

```bash
# Запуск всех тестов
make js-tests

# Перед запуском остановить dev-профиль (если запущен)
docker-compose --profile dev down
```

Не запускать тесты напрямую через `npx playwright test` — это может вызвать проблемы с окружением и портами.

## Development Server

```bash
# Запуск dev-сервера
docker-compose --profile dev up -d --build

# Dev-сервер доступен на http://localhost:8000
```

## Build

```bash
# Сборка бинарника
go build -o uniset2-viewer-go ./cmd/server

# Сборка через make
make build
```
