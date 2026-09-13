# LLM 材料 → 编译 → 动态板书

本课《温度升高，就一定升得越来越快吗》的 `lesson.draft.json` 由本次 Codex LLM 会话生成，不是新增自动调用模型的服务。使用通用 `compileLessonDraft()`，以豆包真实语音和词时间戳编译为 `LessonSpec 0.1.0`、MP3、VTT；没有手填绝对事件时间。坐标轴和手写资源均由通用编译／播放能力处理，没有主题专用的编译回调。

运行 `npm run dev` 后访问 `/examples/heating-rate`。现有首页和示例保留原样。

课程长 52.092 秒，3 段旁白，11 个板书／曲线动作。实际测量点为 (0,20)、(1,40)、(2,50)，比较两个一分钟区间的平均升温速度，明确不能据此推断每一瞬间都减速。使用通用 plot 坐标配置：横轴范围 0–2 分钟，刻度 0/1/2；纵轴范围 0–60°C，刻度 0/20/40/60，开启网格。数据直接使用真实单位，不再映射为布局坐标。

产物：`public/lessons/heating-rate.json`、`public/audio/heating-rate.mp3`、`public/lessons/heating-rate.vtt`，以及 LessonSpec 指定的 `public/fonts/handwriting-6d2546bb189c732a.ttf`。本地编译报告在忽略目录 `outputs/compiled/heating-rate/handwriting-v1/alignment.json`，其中低置信度词和声音自然度仍需人工试听复核。本课 51 个非 ASCII 字形通过通用 Tegaki 管线生成，全部中文已有动画笔画；`·、→、≠` 单独回退，不影响同一行其余字符。

复用本机已有语音缓存重新编译（不再调用合成接口）：

```bash
npm run lesson:compile -- --draft examples/heating-rate/lesson.draft.json --cached
```

在没有缓存的机器上，配置本地语音凭据后可用 `--generate`，会消耗接口额度。编译命令只生成产物目录，不自动发布到 `public`；必须将产物映射到 LessonSpec 的资源地址。板书时机调整只需修改语义锚点再编译，不必重新合成相同旁白。

浏览器回归：`npm run test:browser -- tests/browser/heating-rate.spec.ts`。
