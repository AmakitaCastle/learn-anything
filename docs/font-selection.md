# 课程字体选择

播放器底部展开「字体」，中文和英文／数字分别选择，课程标题、板书和图示标签一起应用。字号和界面控件不变。首次选择需要准备相应字形；资源准备完成前继续显示原字体，不重置播放位置、倍速或静音。

| 类别       | 选项                        | 标识            |
| ---------- | --------------------------- | --------------- |
| 中文       | 马善政 · 毛笔（当前默认）   | `ma-shan-zheng` |
| 中文       | 小赖 · 硬笔                 | `xiaolai`       |
| 中文       | 霞鹜文楷 · 楷书             | `wenkai`        |
| 英文／数字 | Caveat · 随手写（当前默认） | `caveat`        |
| 英文／数字 | Klee One · 规整手写         | `klee-one`      |
| 英文／数字 | Parisienne · 连笔           | `parisienne`    |

字体选择自动保存。本地 CLI 播放器将选择写入 `~/.config/learn-anything/fonts.json`，再次打开课程、换一个本地端口或从终端导出时都能沿用；网页宿主使用本浏览器的本地存储。CLI 偏好文件不可用或损坏时使用当前默认字体；网页存储被禁用时仍可切换，关闭页面后可能无法保留。

## 导出

省略字体参数时沿用 CLI 播放器已经保存的选择。也可分别指定一项或两项，仅影响本次导出，不修改偏好或原课程文件：

```bash
npm run lesson -- --play outputs/runs/<id>/<run> \
  --export-video outputs/lesson.mp4 --aspect-ratio 9:16 \
  --export-font-chinese wenkai --export-font-latin klee-one
```

`--export-font-chinese` 支持 `ma-shan-zheng`、`xiaolai`、`wenkai`；`--export-font-latin` 支持 `caveat`、`klee-one`、`parisienne`。显式指定两项默认值可以恢复当前原字体导出。比例、配色、帧率和导出倍速仍可组合使用。字体准备与导出均不请求模型／语音服务，不重新编译语音和时间轴，不加载外网字体。

## 动效与缺字

每款字体使用其自己的轮廓、度量和 Tegaki 笔画，继续使用当前笔压、收笔、语音字级时间和手绘标记。字体轮廓推导出的书写路径不保证规范汉字笔顺；这一能力与当前实现相同。

缺字只影响对应字符：优先使用当前默认中文／Caveat 字体的笔画；两者都没有对应笔画时采用现有逐字渐显，其余文字继续逐笔书写。标点等非 ASCII 字符随中文字体选择。SVG 图示中的既有静态标签保留其显示时机，分别使用两类选定字体，不新增动画。

字体改变可能改变字宽和换行；字号不变。导出继续对完整内容等比适配画面，应预览长标题、超长单段和复杂图示。

## 模块集成

`ClassroomPlayer` 增加可选的 `initialFonts`、`onFontSelectionChange` 和 `loadChineseFont`。播放器只加载并执行资源，不引入 Node 字体生成器。无额外配置时，播放包提供示例用字的两款中文字形子集；需要完整覆盖自己的课程时，由宿主用 `generateHandwritingCharacters()` 准备资源并通过 `loadChineseFont` 提供经过协议校验的字体包。

CLI 宿主对保存的 LessonSpec 收集所需非 ASCII 用字，首次选择该字体时在本机生成笔画并缓存；完整字体来源固定在仓库 `assets/fonts/`，不接受任意字体文件路径或外部字体名称。笔画缓存仍按源字体哈希、固定生成器版本和生成参数隔离。课程协议和原编译产物保持兼容。

第三方资源版本、SHA-256、许可证和子集重新生成方式见 [字体来源](../assets/fonts/README.md)。
