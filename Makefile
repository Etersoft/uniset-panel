.PHONY: build test js-tests coverage clean

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

# E2E tests with Playwright in Docker
js-tests:
	docker-compose up --build --abort-on-container-exit --exit-code-from e2e
	docker-compose down

# Clean
clean:
	rm -f uniset2-viewer
	docker-compose down -v --rmi local 2>/dev/null || true
