#!/bin/bash
# Запуск всех debug тестов последовательно

cd /home/pv/Projects/uniset-panel/tests

PASSED=0
FAILED=0
FAILED_TESTS=""

for test in debug/test-*.js; do
    echo "========================================"
    echo "Running: $test"
    echo "========================================"

    if timeout 45 node "$test" 2>&1; then
        echo "✓ PASSED: $test"
        ((PASSED++))
    else
        EXIT_CODE=$?
        if [ $EXIT_CODE -eq 124 ]; then
            echo "✗ TIMEOUT: $test"
        else
            echo "✗ FAILED: $test (exit code: $EXIT_CODE)"
        fi
        ((FAILED++))
        FAILED_TESTS="$FAILED_TESTS\n  - $test"
    fi
    echo ""
done

echo "========================================"
echo "SUMMARY"
echo "========================================"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
if [ -n "$FAILED_TESTS" ]; then
    echo -e "Failed tests:$FAILED_TESTS"
fi
