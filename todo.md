* Функцию в modbus не показывает у датчиков
* определить что завязано на configure.xml, попробовать развязать или поддержать несколько

## UObject Debug panel — паритет с JScript debug-ui

* Trends: селектор окна (30s / 1m / 5m / All) — сейчас фикс 60s.
  Файл: `ui/static/js/src/60-detail-trends.js`, state `trendsWindow`.
* Variables: boolean значения как lamp (● зелёный / ○ серый) вместо текста.
  Файл: `ui/static/js/src/60-detail-variables.js::formatVarValue`, CSS `.detail-var-table` в `style.css`.
* Forced-indicator: показывать 🔒 и жёлтый фон для forced переменных
  (CSS `.detail-var-table tr.forced` уже есть — нужно выставлять класс из `snapshot.forced[]`).
  Требует поля `forced[]` в ответе `/snapshot` — проверить, отдаёт ли uniset `/<Object>/dump`;
  если нет — вывести из состояния SM ionc (список freeze-активных sensor_id).
  Файлы: `internal/debug/client.go`, `internal/debug/types.go`, `ui/static/js/src/60-detail-variables.js`.
