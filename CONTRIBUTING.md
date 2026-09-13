# 贡献指南

第一版重点是终端备课、编译和本地播放。提交前先阅读 [README](./README.md)、[架构](./docs/module-architecture.md)和[路线图](./ROADMAP.md)。

## 开发

需要 Node.js ≥22.13、FFmpeg／FFprobe。运行 `npm ci` 后，使用 `npm run demo` 体验；原网页示例使用 `npm run dev`。

修改时保持三个业务模块独立：模型生成材料，编译器生成播放资源，播放器只执行课程数据。新动画须提供校验、固定输入及暂停／seek／重播验证，见[动画指南](./docs/visual-grammars.md)。

按改动运行对应检查：

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:modules
npx playwright install chromium
npm run test:browser
```

测试使用夹具，不需要提交密钥或调用付费服务。真实账号联调应自行配置忽略的 `.env.local`，不要提交课程中的私人资料、配置、输出缓存或原始接口响应。

提交、PR 检查和版本标签发布步骤见 [Git 与 CLI 自动发布](./docs/ci-cd.md)。

## Issue 与 Pull Request

问题报告请给出系统、Node 版本、复现步骤和脱敏错误类别。PR 说明用户遇到的问题、修改后的行为及验证结果；不要混入无关重构。

提交请使用 `git commit -s`，以 Developer Certificate of Origin 1.1 的方式确认有权提交贡献：https://developercertificate.org/ 。贡献代码沿用 Apache-2.0；第三方资源保留原许可证，并更新 NOTICE。
