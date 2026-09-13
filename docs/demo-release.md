# 第一版 CLI Demo 发布

## 固定范围

```text
终端主题输入 → LLM → LessonDraft 0.1.0
→ compileLessonDraft() → MP3 + LessonSpec 0.1.0 + VTT
→ lesson-player → 本机浏览器课堂
```

课程同时包含手写资源和词时间报告。第一版为 GitHub 开源源码 Demo，协议为 0.1.0；不以 npm 全局安装或公网服务作为交付要求。发布标签为 `v0.1.0-demo`。

## 首次使用验收

- 从干净源码执行 `npm ci`，无需预先构建业务模块。
- `npm run demo` 在无模型／语音配置、无 FFmpeg 和无缓存时可播放自带升温课。
- 填写 `.env.local` 并安装 FFmpeg 后，主题命令生成材料、编译全部资源并打开播放器。
- 保存课程可以通过 `--play` 重播，旧服务端口不影响资源读取。
- 模型或语音失败时输出可理解的错误；材料已生成时可用 `--draft` 恢复，不重新备课。
- 暂停、跳转、重播和页面刷新恢复正确课堂状态。

## 发布前检查

```bash
npm test
npm run typecheck
npm run build
npm run typecheck:modules
npm run lint
npm run test:modules
npx playwright install chromium
npm run test:browser
```

检查当前源码和将要推送的 Git 历史不含本地配置、凭证、私人课程和生成缓存。公开自带案例应有明确来源和人工审稿记录；自动测试只能证明程序行为，不能替代知识与听感审核。

GitHub 首次发布时：创建公开仓库、推送源码、启用 CI、以 `v0.1.0-demo` 创建 Release。Release 说明首次安装、体验／生成命令、产物格式、系统验证范围和已知限制。下载源码即可使用，不附本机 `.env.local` 或 `outputs/`。

## 当前实际验证的口径

本地模型生成记录中已有 DeepSeek Flash 的 Redis 材料，后来原样导入编译成约 311 秒课程。该记录不是一次命令无中断完成的证明，也不是全部模型兼容性或课程知识质量验收。该私人运行目录不作为默认公开课程发布。

离线自动测试使用模型传输夹具与合成词时间，部分使用实际 FFmpeg 编码的静音 MP3。发布时应分别注明自动检查结果和真实模型／语音的人工检查情况。

## 本地验收记录（2026-09-13）

- 97 项单元／边界测试通过，31 项 Chromium 浏览器测试最终全量通过。
- 根项目和四个模块类型检查、代码检查、生产构建及仓库外模块复用通过。
- 终端端到端测试材料补齐全文板书模式和图文关联，保留模型输出校验。
- 独立播放器显式编译生产 JSX，修复继承 `NODE_ENV=development` 时停在载入页的问题；离线 Demo 浏览器测试覆盖该环境。
- 从源码归档在仓库外干净目录执行 `npm ci` 成功；无密钥、无音频工具、无生成缓存时 Demo 启动、课程 JSON、音频 Range 和资源隔离检查通过。
- 将发布的源码文件及现有 Git 历史未匹配到当前本地配置中的凭证；归档排除本地配置、依赖、运行缓存和 Git 目录。
- README 使用实际课堂截图。未请求付费文本模型或语音接口。

GitHub 已发布：[公开仓库](https://github.com/AmakitaCastle/learn-anything)、[v0.1.0-demo Release](https://github.com/AmakitaCastle/learn-anything/releases/tag/v0.1.0-demo)。Release 包含源码归档和 SHA-256 校验文件，对应代码提交 `87a98b6`。GitHub Linux CI 已启动，结果在下方补充；Windows 尚未实机验收。

## 首次 GitHub CI 修正

干净 Linux 环境中，业务模块类型检查依赖共享协议的构建产物。首次工作流把模块检查放在构建之前，因找不到协议声明失败；已将生产构建提前，不依赖开发机器的已有 dist。课程生成和播放实现未改动。
