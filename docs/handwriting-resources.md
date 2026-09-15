# 通用课程手写资源

`compileLessonDraft()` 默认从课程标题、板书、图示标签中收集可见非 ASCII 字符，用 Tegaki 官方字体生成管线从 Ma Shan Zheng 中文手写字体生成逐字笔画资源。字符按字体内容哈希、固定 Tegaki 版本与生成参数缓存。再次调整锚点或编译同样用字时复用缓存，生成阶段不请求模型、不下载字体、不重新合成语音。

输出新增：

- `lesson.handwriting`：经过共享协议校验的 Tegaki v0 压缩笔画、字体度量与字体资源 URL；纯数据，不含脚本或 CSS。
- `compiled.handwritingFont`：宿主需要保存的字体 Buffer。
- `compiled.resources.handwritingFont`：对应的托管 URL。
- `compiled.report.handwriting`：生成方法、字形数与源字体不支持的字符；不把回退文字当成逐笔动画。

`lesson:compile` 将字体保存为产物目录的 `handwriting.ttf`。集成时除了 MP3/VTT/lesson.json，还必须将这个文件保存到 `lesson.handwriting.fontUrl` 指定的地址。字体地址使用内容哈希，不同课程使用同一字体可共用资源。字符笔画只包含本课可见用字，随 JSON 离线播放。

## 程序化配置

```ts
const compiled = await compileLessonDraft(draft, {
  speech,
  handwriting: createTegakiHandwritingProvider({
    cacheRoot: '/absolute/path/to/glyph-cache',
    // 可选：使用自己的合法字体文件与托管地址
    // fontPath: '/absolute/path/to/source.ttf',
    // fontUrl: '/fonts/custom.ttf',
  }),
});
```

缺省 Provider 使用随包提供的字体，缓存位于系统临时目录；CLI 明确使用 `outputs/handwriting`。也可注入 `LessonHandwritingProvider`，或以 `handwriting: false` 保留旧编译产物。`compileAlignedLessonDraft()` 仍是同步纯时间轴编译，不读文件、不生成字体；已有编译产物可先用 Provider 生成资源，再把 `handwriting` 附加到 `createLessonArtifacts()` 的输入。

## 播放行为

播放器的 `HandwritingProvider` 加载中文与 Caveat 字体，`HandwrittenLine` 按连续片段分配资源：中文使用本课笔画，ASCII 英文／数字使用 Caveat。缺字只在对应片段以手写字体逐字呈现，不再导致整行降级。所有片段与下划线使用课程 `currentTime`，暂停冻结，跳转或重播恢复同一笔画状态。没有新资源字段的旧 LessonSpec 仍使用原中文子集，不改写旧字形。

当前 Ma Shan Zheng 不覆盖所有 Unicode 字符。例如升温课的 `·、→、≠` 仍是单独字体回退，但该课全部中文已有笔画。Tegaki 根据字体轮廓推导路径，呈现手写绘制效果，不保证规范汉字笔顺，也不是现场真人书写采样。

## 第三方与验证

当前版本官方 generator 为私有源码包。固定源代码版本及 Node 适配说明位于 `packages/content-generator/vendor/README.md`，保留 MIT 许可证；字体保留 OFL。没有引入 React/播放器依赖到内容编译器。

测试覆盖：真实官方管线生成新中文、缓存复用、非法资源拒绝、单字符回退保留其余笔画，以及浏览器中的中途书写、暂停不变和跳转恢复；不以最终静态截图代替书写动画验收。

## 内置字体选择

中文与英文／数字各支持三款字体，独立选择并保存。视频导出默认沿用 CLI 字体偏好，也可用 `--export-font-chinese`、`--export-font-latin` 单独覆盖，不修改原课程或语音时间轴。详见[字体选择](./font-selection.md)。
