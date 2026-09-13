# 全文板书与图文跟随

新备课默认使用 `boardMode: "full-narration"`。旁白全文由编译器直接生成板书，不依赖模型再摘抄一次，不因行数限制删掉讲解过程。

## 播放行为

- 每张图与关联的完整旁白组成一个讲解区块。多个段落可以关联同一张图，返回旧图讲解时继续使用原区块。
- 讲到一句才显示该句，句内按语音词时间戳逐字书写；已讲过的全文保留。词内各字符的时间采用均匀插值，不冒充逐字实测时间。
- 尚未讲到的图文区块不展开。拖动进度时由目标时间重建全文、图示和圈画状态；跳回前面时不显示未来内容。
- 页面跟随当前讲解句滚动，桌面端图区在所属区块内吸顶，方便同时看图和文字。窄屏改为上图下文。
- 用户滚轮、触屏滑动、滚动键或拖动页面滚动条回看时，停止自动跟随，音频继续播放。点击“回到当前讲解”恢复。
- 普通句子不默认强调；只对模型选出的局部术语、公式、对比或因果关系画圈。圈画绑定文字范围，短语讲完后开始，不使用模型猜测的页面坐标。
- 已完成句子的播放时间固定在完成帧；各段笔画进度不变时复用画布，避免长课程每帧重绘历史全文、拖慢当前文字。后退或重播时仍按目标时间重建笔画。
- 重点圈画按进度截取实际贝塞尔曲线，进度为零时路径为空。不能用归一化虚线配合 `non-scaling-stroke` 隐藏缩放后的圈线，这种组合会在零进度漏出半圈，与文字是否绘制完成无关。

## 材料字段

```json
{
  "boardMode": "full-narration",
  "segments": [
    {
      "id": "mechanism",
      "label": "解释机制",
      "text": "主线程用事件循环监听连接。网络等待不会占住命令执行过程。",
      "visualId": "event-loop",
      "emphasis": [{ "phrase": "事件循环" }]
    }
  ]
}
```

这是字段片段，需放入完整 `LessonDraft 0.1.0`。`visualId` 引用已声明的图；每张图必须至少关联一个旁白段，本段图示动作也必须操作关联的图。纯文字段可省略。`emphasis` 每段最多 8 项，每个 `phrase` 最多 40 字符；重复短语指定 `occurrence`，从 1 开始。整句、跨句、重叠重点及未知图引用会在材料预检阶段被拒绝。

旁白必须把条件、操作、中间结果和结论讲完整；全文板书不会自动补足旁白里缺失的推导。`board.write` 仅用于额外单列的公式或补充推导，可以为空；`board.remove` 只清理这些额外内容，不能删除全文。编译器把每段全文、词时间戳、重点范围与对应图写入 `LessonSpec.teaching`，播放器不调用模型。

## 可播放示例

启动开发服务后访问 `/examples/full-board`。示例保留原升温课的三段旁白，使用曲线和阅读推断流程两个图；旁白全文共 12 句，选出 7 处局部重点。音频和词边界来自已有真实语音缓存，未重新调用付费合成接口。

材料在 [`examples/heating-rate/full-board.draft.json`](../examples/heating-rate/full-board.draft.json)，播放数据在 [`public/lessons/heating-full-board.json`](../public/lessons/heating-full-board.json)。仅复用语音缓存重新编译：

```bash
npm run lesson:compile -- --draft examples/heating-rate/full-board.draft.json --cached
```

新生成的课程通过原来的 `npm run lesson -- "主题" --generate` 自动使用此模式。不含 `teaching` 的既有播放数据继续使用旧布局；升级旧材料需要补上 `boardMode`、图文关联和局部重点后重新编译，旁白不变时可以复用语音缓存。仅重放旧 `lesson.json` 不会重新备课。

## 验证

`tests/full-board.test.ts` 检查全文字符无遗漏、词边界保留、图文关联与重点拒绝。`tests/browser/full-board.spec.ts` 检查真实音频下的逐步展开、完整全文、局部圈画、自动滚动、手动回看／恢复、逆向跳转后的笔画一致性与窄屏换行。协议通过仍不能保证知识或重点选择正确，生成课程需要人工审稿与试听。

`tests/browser/circle.spec.ts` 使用独立 SVG 像素测试，在不同宽高缩放下验证零进度没有墨迹、圈线逐步增加、完成后闭合以及后退后清空。Chromium 和 WebKit 均可离线运行测试，不启动课程服务：

```bash
npx playwright install webkit # 首次安装测试运行时
npx playwright test --config playwright.circles.config.ts
```

独立终端播放器启动时会打包前端，已经打开的运行不会自动更新；修改播放器后需用 `--play <已保存目录>` 重新启动，不需要重新备课或合成语音。
