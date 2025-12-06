.PHONY: build test js-tests js-tests-multi coverage clean

# Go build
build:
	go build -mod=vendor -o uniset2-viewer ./cmd/server

# Go unit tests
test:
	go test -mod=vendor -v ./internal/...

# Test coverage
coverage:
	go test -mod=vendor -coverprofile=coverage.out ./internal/...
	go tool cover -func=coverage.out | tail -1

# E2E tests with Playwright in Docker (all tests)
js-tests:
	docker-compose up --build --abort-on-container-exit --exit-code-from e2e
	docker-compose down
	docker-compose -f docker-compose.multi.yml up --build --abort-on-container-exit --exit-code-from e2e-multi
	docker-compose -f docker-compose.multi.yml down

# E2E tests with Playwright in Docker (multi-server)
js-tests-multi:
	docker-compose -f docker-compose.multi.yml up --build --abort-on-container-exit --exit-code-from e2e-multi
	docker-compose -f docker-compose.multi.yml down

# All E2E tests
js-tests-all: js-tests js-tests-multi

# Clean
clean:
	rm -f uniset2-viewer
	docker-compose down -v --rmi local 2>/dev/null || true
	docker-compose -f docker-compose.multi.yml down -v --rmi local 2>/dev/null || true
