# Task 1.1: Добавление LiteGraph.js vendor-файла и script-тега

Metadata:
- Dependencies: Нет (foundation задача)
- Provides: `ui/static/js/vendor/litegraph.js`, script-тег в `index.html`
- Size: Small (2 файла)

## Содержание задачи

Добавить vendor-копию библиотеки LiteGraph.js v0.7.15 и подключить её через `<script>` тег в `index.html`. LiteGraph.js -- Canvas2D библиотека для визуализации графов узлов (~480KB, MIT, zero deps). Выбрана в ADR `docs/plans/system-overview-adr.md`.

## Целевые файлы
- [x] `ui/static/js/vendor/litegraph.js` (Create)
- [x] `ui/templates/index.html` (Modify)

## Шаги реализации

### 1. Получение vendor-файла
- [x] Скачать LiteGraph.js v0.7.15 из npm/GitHub
  ```bash
  # Вариант через npm
  cd /tmp && npm pack litegraph.js@0.7.15 && tar xf litegraph.js-0.7.15.tgz
  cp package/build/litegraph.js /home/pv/Projects/uniset-panel/ui/static/js/vendor/litegraph.js
  ```
  Или скачать напрямую из GitHub releases.
- [x] Убедиться что файл содержит глобальные объекты `LiteGraph`, `LGraph`, `LGraphCanvas`

### 2. Добавление script-тега в index.html
- [x] Прочитать текущий `ui/templates/index.html`
- [x] Найти секцию с подключением JS-файлов (перед `app.js`)
- [x] Добавить строку:
  ```html
  <script src="/static/js/vendor/litegraph.js"></script>
  ```
- [x] Script-тег должен быть **перед** `<script src="/static/js/app.js">`, чтобы LiteGraph был доступен при инициализации app.js

### 3. Проверка
- [x] `make build` проходит успешно
- [x] Vendor-файл доступен по URL `/static/js/vendor/litegraph.js`

## Критерии завершения
- [x] Файл `ui/static/js/vendor/litegraph.js` существует и содержит LiteGraph.js v0.7.15
- [x] `<script>` тег добавлен в `index.html` перед `app.js`
- [x] `make build` успешен
- [x] Верификация: L3 (Build Success)

## Команды верификации
```bash
# Проверка сборки
make build

# Проверка наличия файла
ls -la ui/static/js/vendor/litegraph.js

# Проверка script-тега в index.html
grep 'litegraph' ui/templates/index.html
```

## Заметки
- Область влияния: Только добавление нового vendor-файла и script-тега
- Ограничения: Не модифицировать существующие script-теги и не менять порядок загрузки существующих JS файлов
- Vendor-файл не конкатенируется в `app.js` -- он загружается отдельно как глобальная библиотека (аналогично Chart.js через CDN)
