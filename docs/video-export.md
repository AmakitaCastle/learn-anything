# 导出课程视频

把已经保存的课程导出为带旁白的 MP4，不请求文本模型或语音服务，也不改变原课程文件。导出使用原播放器的时间轴、笔画与动画，按固定帧时间渲染；不录屏、不受播放倍速／静音设置影响，也不需要等待旁白实际播放。

## 安装与使用

需要 Node.js ≥22.13、仓库依赖、FFmpeg（包含 libx264）／FFprobe，以及 Chromium：

```bash
npm ci
npx playwright install chromium
# Linux 缺少系统库时：npx playwright install --with-deps chromium
```

FFmpeg 安装见 README。只播放自带课程仍不需要这些导出工具。

```bash
# 导出已保存课程为竖屏视频
npm run lesson -- --play outputs/runs/<id>/<run> \
  --export-video outputs/lesson-portrait.mp4 --aspect-ratio 9:16

# 导出自带课程，无需密钥或语音缓存
npm run demo -- --export-video outputs/demo-landscape.mp4 --aspect-ratio 16:9

# 生成课程后直接导出；生成阶段可能消耗接口额度
npm run lesson -- "水循环" --generate \
  --export-video outputs/water-cycle-square.mp4 --aspect-ratio 1:1

# 已有材料，仅缓存编译后导出；缓存缺失停止，不请求付费接口
npm run lesson -- --draft <目录>/lesson.draft.json --cached \
  --export-video outputs/lesson.mp4 --fps 30
```

`--export-video` 指定一个**不存在**的 `.mp4` 文件，其父目录须已存在且可写。导出结束后退出，不启动交互播放器；生成阶段的课程仍保存于运行目录。纯离线预检不能导出，比例／帧率参数也不能单独使用。

| 比例           | 输出尺寸    | 适合     |
| -------------- | ----------- | -------- |
| `16:9`（默认） | 1280 × 720  | 横屏观看 |
| `9:16`         | 720 × 1280  | 竖屏观看 |
| `1:1`          | 1080 × 1080 | 方形分享 |

`--fps` 为 1–60 的整数，默认 24。输出采用 H.264／yuv420p 画面、AAC 旁白，MP4 启用 faststart；没有播放器按钮。竖屏和方形采用图上文下布局，内容等比缩小以适应画面，不拉伸、不直接裁切宽屏录屏。全文板书在视频中展示当前讲解段及关联图示，交互播放器仍保留完整历史板书和自动跟随。超长单段或复杂图示可能缩小文字，应先预览并人工复核；导出不会修订教学内容。

## 失败与取消

工具、目标文件与输出目录在生成请求前预检。音频缺失或与课程时间轴相差超过 0.3 秒时拒绝导出。课程资源从封闭的本机服务加载，导出不加载外网资源、不执行课程生成的脚本。

已有视频不会覆盖。导出先在目标目录内编码临时视频，完整成功后原子创建目标文件；取消、渲染／编码失败会清理临时文件，不留下半成品 MP4，也不删除已保存课程。按 Ctrl+C 取消，可用同一课程另选输出文件重试。

导出按帧渲染，耗时与课程长度、帧率、内容复杂度和机器性能有关。音视频时钟取自同一份编译产物；视频长度存在不足一帧的采样精度，AAC 封装也可能有极小的编码延迟。当前验收以 macOS Chromium／FFmpeg 为准，其他平台兼容性需对应实机或 CI 复核。

实现位于宿主 `scripts/lesson-video.ts` 与 `viewer/export.tsx`。FFmpeg 和 Chromium 不进入材料生成／课程编译／React 播放模块的运行依赖，课程协议不变。相关 API 依据 [Playwright 帧截图](https://playwright.dev/docs/api/class-page#page-screenshot)与 [FFmpeg image2pipe](https://ffmpeg.org/ffmpeg-formats.html#image2) 官方文档。

## 本轮验收（2026-09-13）

- 110 项单元／边界测试、33 项 Chromium 浏览器回归通过；类型检查、代码检查、生产构建和仓库外生产包消费通过。
- 新增实际 MP4 检查覆盖三种输出尺寸、H.264／AAC、旁白时长、解码后非空画面、帧重建一致、内容适配、取消清理、并发目标防覆盖和音频时长不匹配拒绝。模型与语音使用离线夹具，不消耗接口额度。
- 另用自带真实旁白课导出 9:16／24 帧样例：720 × 1280，MP4／AAC 时长 52.092 秒，视频轨 52.083333 秒，误差不足一帧。
- 首次与构建并行运行时，原有曲线课静音按钮检查失败；未修改原测试或放宽标准，独立复核及随后全量回归通过。

本轮不修改课程协议，不合并主分支或创建版本标签，不部署网站；其他系统的真实账号、播放设备兼容和教学质量不由这些测试保证。
