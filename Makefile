.PHONY: validate validate-package traceui traceui-deps traceui-check traceui-assets

validate: validate-package traceui-check

validate-package:
	python3 scripts/validate.py

traceui:
	go run ./cmd/traceui

traceui-deps:
	npm --prefix web/traceui ci

traceui-check: traceui-deps
	go test ./...
	npm --prefix web/traceui run check

traceui-assets: traceui-deps
	npm --prefix web/traceui run build
	rm -rf internal/traceui/web
	cp -R web/traceui/dist internal/traceui/web
