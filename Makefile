# WRT-UI 常用任务。Windows 上请用 Git Bash / MSYS2 的 make 执行。
# 注意：源码目录不要放在含中文的路径下编译（mingw 的 ld/windres 会失败），
# 需要时用 `make mirror` 镜像到 ASCII 目录再构建。

SHELL := /bin/bash
NPM   ?= npm
CARGO ?= cargo
MIRROR ?= D:/wrtui-build

.DEFAULT_GOAL := help
.PHONY: help install dev build preview test typecheck fmt fmt-check clippy check \
        tauri-dev bundle exe clean mirror release clean-mirror

help: ## 列出所有可用目标
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

## ---------------------------------------------------------------- 依赖与开发

install: ## 安装前端依赖（npm ci）
	$(NPM) ci

dev: ## 启动 Vite 开发服务器（浏览器预览，IPC 为 mock）
	$(NPM) run dev

tauri-dev: ## 启动 Tauri 开发窗口（真实 Rust 后端）
	npx tauri dev

## ---------------------------------------------------------------- 检查

typecheck: ## TypeScript 类型检查
	$(NPM) run typecheck

test: ## 前端单元测试
	$(NPM) test

fmt: ## 格式化 Rust 代码
	cd src-tauri && $(CARGO) fmt --all

fmt-check: ## 检查 Rust 格式
	cd src-tauri && $(CARGO) fmt --all -- --check

clippy: ## Rust 静态检查（警告即失败）
	cd src-tauri && $(CARGO) clippy --all-targets -- -D warnings

check: typecheck fmt-check clippy test ## 提交前跑一遍：类型 + 格式 + clippy + 测试

## ---------------------------------------------------------------- 构建

build: ## 构建前端静态资源到 dist/
	$(NPM) run build

exe: ## 只产出 release exe（不打安装包）
	npx tauri build --no-bundle

bundle: ## 产出 NSIS 安装包
	npx tauri build --bundles nsis

## ---------------------------------------------------------------- 杂项

mirror: ## 把源码镜像到 ASCII 路径再构建（中文路径必需）
	robocopy "$$(pwd -W)" "$(MIRROR)" /MIR /XD node_modules target dist .git /XF "*.log" /NFL /NDL /NJH /NJS /R:1 /W:1 || true
	@echo "已镜像到 $(MIRROR)；在那里执行 make build / make bundle"

release: ## 校验工作区干净后打 tag：make release VERSION=1.0.1
	@test -n "$(VERSION)" || { echo "用法: make release VERSION=1.0.1"; exit 1; }
	@test -z "$$(git status --porcelain)" || { echo "工作区不干净，先提交或 stash"; exit 1; }
	@node -e "const v=require('./package.json').version; if(v!=='$(VERSION)'){console.error('package.json 版本是 '+v+'，与 VERSION=$(VERSION) 不一致');process.exit(1)}"
	git tag -a "v$(VERSION)" -m "v$(VERSION)"
	git push origin "v$(VERSION)"
	@echo "已推送 v$(VERSION)，GitHub Actions 会构建并创建 Release"

clean: ## 清理构建产物
	rm -rf dist src-tauri/target

clean-mirror: ## 删除镜像目录
	rm -rf "$(MIRROR)"
