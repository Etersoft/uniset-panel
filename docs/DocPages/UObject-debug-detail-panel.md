# UObject Debug — Detail Panel

## Обзор

Panel отладки конкретного UObject'а. Открывается двойным кликом по
ноде в UObject Overview (или по карточке в FB Status panel). Содержит
три вкладки:

- **Variables** — живая таблица переменных объекта: Inputs (`io.in`),
  Outputs (`io.out`), Locals, FB Instances (переменные с точкой в имени).
  Значения обновляются каждые 500 ms через POST-free
  `GET /api/servers/{id}/objects/{name}/snapshot` (proxy к uniset
  `/<Object>/dump`).
- **Trends** — графики выбранных переменных. Клик по строке в Variables
  добавляет переменную в Trends. Window: 30s / 1m / 5m / All. Clear,
  Export CSV. В Spec 4 графики **client-side only** — точки
  накапливаются из snapshot poll с момента select. История из uniset
  отсутствует до Spec 5.
- **Message Log** — поток dispatch-trace записей (Spec 1 uniset-side).
  Enable/Disable переключает сбор на uniset-стороне. Size: 64–1024.
  Pause, Clear, Export CSV, Filter (substring на type/name/supplier).

## Force / Unforce переменных

Для `in_*` и `out_*` (привязанных к SharedMemory) доступен right-click
меню → Force value… / Unforce. Запрос идёт через существующий
`/api/objects/{SM}/ionc/{freeze,unfreeze}`. Требует `--control-token`.

## Эндпоинты (добавлены в Spec 4)

- `GET /api/servers/{id}/objects/{name}/snapshot` — flat snapshot,
  адаптер над uniset `/<Object>/dump`.
- `GET /api/trace/events?object=X&server=S[&interval=N]` — SSE поток
  trace-событий (отдельный канал, независимый от `/api/events`).
- `POST /api/trace/servers/{id}/objects/{name}/enable[?size=N]` —
  прокси к uniset `POST /<name>/trace/enable`.
- `POST /api/trace/servers/{id}/objects/{name}/disable` —
  прокси к uniset `POST /<name>/trace/disable`.

## Persistent state

Состояние панели (активная вкладка, выбранные Trends, window, log
filter/size/paused, collapsed секции Variables) сохраняется в
localStorage по ключу `uniset-panel:detail:<serverId>:<objectName>`.
Debounce 300 ms + flush на beforeunload.

## Ограничения MVP

- Force/Unforce — только для `in_*`/`out_*`.
- Locals / FB Instances — read-only.
- Forced indicator 🔒 — deferred (нет API списка замороженных
  sensor'ов). Пользователь может попробовать Force; SM вернёт
  ошибку, если уже заморожено.
- Message Log ring-buffer — client-side в памяти (5000 записей hard
  cap); server-side archival не реализован.
- Trends — client-side buffer; backend history откладывается в Spec 5
  (per-variable ring buffer на uniset-стороне).

## Related specs

- Spec 1 (uniset-2.x): dispatch-trace ring buffer + `/dump?trace=1`
  (`docs/superpowers/specs/2026-04-18-uobject-debug-api-spec1-design.md`)
- Spec 2 (panel backend): `internal/trace/*` package
  (объединён со Spec 4 в одной ветке)
- Spec 3 (panel frontend infra): UObject Overview + CustomEvent hooks
- **Spec 4** (этот): detail panel
- Future Spec 5: per-variable history ring buffer на uniset-стороне.
