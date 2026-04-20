#!/bin/bash
# Запуск debug тестов параллельно (20 одновременно)

cd /home/pv/Projects/uniset-panel/tests

PARALLEL=5
TIMEOUT=45
RESULTS_DIR="/tmp/test-results-$$"
mkdir -p "$RESULTS_DIR"

# Получаем список тестов
TESTS=(debug/test-*.js)
TOTAL=${#TESTS[@]}

echo "Total tests: $TOTAL"
echo "Running $PARALLEL tests in parallel..."
echo ""

# Функция запуска теста
run_test() {
    local test=$1
    local result_file="$RESULTS_DIR/$(basename "$test" .js).result"

    if timeout $TIMEOUT node "$test" > "$result_file.log" 2>&1; then
        echo "PASS" > "$result_file"
    else
        local code=$?
        if [ $code -eq 124 ]; then
            echo "TIMEOUT" > "$result_file"
        else
            echo "FAIL:$code" > "$result_file"
        fi
    fi
    echo "$test: $(cat "$result_file")"
}

export -f run_test
export RESULTS_DIR TIMEOUT

# Запускаем параллельно
printf '%s\n' "${TESTS[@]}" | xargs -P $PARALLEL -I {} bash -c 'run_test "$@"' _ {}

echo ""
echo "========================================"
echo "SUMMARY"
echo "========================================"

PASSED=$(grep -l "^PASS$" "$RESULTS_DIR"/*.result 2>/dev/null | wc -l)
FAILED=$(grep -l "^FAIL" "$RESULTS_DIR"/*.result 2>/dev/null | wc -l)
TIMEOUT_COUNT=$(grep -l "^TIMEOUT$" "$RESULTS_DIR"/*.result 2>/dev/null | wc -l)

echo "Passed:  $PASSED"
echo "Failed:  $FAILED"
echo "Timeout: $TIMEOUT_COUNT"
echo ""

if [ $FAILED -gt 0 ] || [ $TIMEOUT_COUNT -gt 0 ]; then
    echo "Failed/Timeout tests:"
    for f in "$RESULTS_DIR"/*.result; do
        result=$(cat "$f")
        if [ "$result" != "PASS" ]; then
            testname=$(basename "$f" .result)
            echo "  - $testname: $result"
            echo "    Log: $(head -5 "$f.log")"
        fi
    done
fi

# Cleanup
rm -rf "$RESULTS_DIR"
