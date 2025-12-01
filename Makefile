.PHONY: build test js-tests clean

# Go build
build:
	go build -mod=vendor -o uniset2-viewer ./cmd/server

# Go unit tests
test:
	go test -mod=vendor -v ./internal/...

# E2E tests with Playwright in Docker
js-tests:
	docker-compose up --build --abort-on-container-exit --exit-code-from e2e
	docker-compose down

# Clean
clean:
	rm -f uniset2-viewer
	docker-compose down -v --rmi local 2>/dev/null || true
