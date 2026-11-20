## 这个 PR 做了什么

<!-- 一句话说明目的；关联的 issue 请写 Closes #123 -->

Closes #

## 变更类型

- [ ] 修复 bug（不改变现有行为）
- [ ] 新功能
- [ ] 重构 / 性能（行为不变）
- [ ] 界面 / 设计系统
- [ ] 文档 / CI / 构建

## 影响范围

<!-- 勾选受影响的模块，方便评审聚焦 -->

- [ ] 前端界面（`src/`）
- [ ] 设计令牌 / 主题（`src/styles/`、`src/theme.ts`）
- [ ] 国际化（`src/i18n/`）
- [ ] Rust 外壳（`src-tauri/src/`）
- [ ] 业务核心（`src-tauri/core/`）
- [ ] 构建脚本 / CI（`scripts/`、`.github/`）

## 怎么验证的

<!-- 必填：写实际执行过的命令或操作，不要写「应该没问题」 -->

```bash
npm run typecheck
npm test
npm run build
cd src-tauri && cargo fmt --all -- --check && cargo clippy --all-targets -- -D warnings && cargo test
```

界面改动请附亮色 / 暗色截图（1440 与 1024 宽度各一张）。涉及真实应用的改动请说明在哪个 Windows 版本上跑过。

## 自查清单

- [ ] 没有新增圆角、渐变、模糊阴影，颜色只来自设计令牌
- [ ] 新增文案已补齐全部 10 种语言，`zh-Hans.ts` 键集保持一致
- [ ] 没有把凭据、令牌、本机绝对路径提交进仓库
- [ ] 改动涉及的文档（README / `docs/`）已同步
- [ ] 破坏性变更已在描述里写明迁移方式
