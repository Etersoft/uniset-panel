# Launcher

Launcher позволяет мониторить и управлять процессами UniSet2 через HTTP API Launcher'а.

## Возможности

- Просмотр статуса всех процессов (state, PID, uptime, restarts)
- Группировка процессов по группам
- Управление отдельными процессами (restart, stop, start)
- Массовые операции (restart-all, reload-all)
- Автоматическое обновление статуса каждые 5 секунд
- Индикация critical-процессов
- Независимый контроль доступа для каждого Launcher'а

## Конфигурация

### YAML файл

```yaml
launchers:
  - url: http://localhost:8111
    name: "Основная нода"
    controlToken: "secret-token"    # для управления (restart/stop/start)

  - url: http://192.168.1.100:8111
    name: "Резервная нода"
    # без controlToken — только просмотр
```

| Поле | Обязательно | Описание |
|------|:-----------:|----------|
| `url` | да | URL Launcher HTTP API |
| `name` | нет | Отображаемое имя (по умолчанию — из URL) |
| `id` | нет | Уникальный ID (генерируется из URL) |
| `controlToken` | нет | Токен для операций управления |
| `readToken` | нет | Токен для чтения статуса |

### CLI флаги

```bash
# Один Launcher
./uniset-panel --launcher-url http://localhost:8111

# Несколько Launcher'ов
./uniset-panel --launcher-url http://host1:8111 --launcher-url http://host2:8111
```

При использовании CLI флагов доступен только просмотр (без управления). Для управления используйте YAML конфигурацию с `controlToken`.

## Контроль доступа

Каждый Launcher имеет **независимый** контроль доступа:

- Если `controlToken` задан — в UI появляется кнопка **Take**, по нажатию на которую активируется режим управления для этого конкретного Launcher'а
- Без `controlToken` — Launcher доступен только для чтения
- Контроль над одним Launcher'ом не влияет на другие

`controlToken` передаётся в заголовке `Authorization: Bearer <token>` при POST-запросах к Launcher API.

## UI

В боковой панели появляется секция **Launchers** со списком настроенных Launcher'ов. При клике открывается вкладка с таблицей процессов:

- Процессы сгруппированы по группам (core, io, network и т.д.)
- Цветовая индикация состояний: RUNNING (зелёный), STOPPED (серый), FAILED (красный), RESTARTING/STARTING/STOPPING (оранжевый)
- Кнопки управления: restart (↻), stop (■), start (▶)
- Массовые операции Stop / Start / Restart / Reload в заголовке каждой группы
- Фильтр процессов по имени
- Ссылка **Open Launcher UI** на веб-интерфейс самого Launcher'а

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/launchers` | Список всех Launcher'ов |
| GET | `/api/launchers/{id}/status` | Статус Launcher'а |
| GET | `/api/launchers/{id}/processes` | Список процессов |
| GET | `/api/launchers/{id}/groups` | Группы процессов |
| POST | `/api/launchers/{id}/process/{name}/restart` | Перезапуск процесса |
| POST | `/api/launchers/{id}/process/{name}/stop` | Остановка процесса |
| POST | `/api/launchers/{id}/process/{name}/start` | Запуск процесса |
| POST | `/api/launchers/{id}/stop-all` | Остановка всех |
| POST | `/api/launchers/{id}/start-all` | Запуск всех |
| POST | `/api/launchers/{id}/restart-all` | Перезапуск всех |
| POST | `/api/launchers/{id}/reload-all` | Reload всех |

## SSE события

| Событие | Описание |
|---------|----------|
| `launcher_status` | Изменение статуса процессов |
| `launcher_connection` | Изменение connectivity Launcher'а |
