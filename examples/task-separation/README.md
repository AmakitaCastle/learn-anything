# 《课题分离》情境动画样例

保留原课的六段旁白与局部重点，把原来的文字流程／状态图改成四个数据驱动场景：

1. 未回复的消息、反复猜测与替别人承担情绪。
2. 后果归属，区分自己的行动与他人的评价。
3. 发消息的具体例子，把表达／跟进和回复／原因分别放回双方区域。
4. 混淆责任到分开归属，突出自己的行动，淡去猜测。

这些内容全部在 `lesson.draft.json`，`scene` 能力没有这堂课的专用分支。

离线预检：

```bash
npm run lesson -- --draft examples/task-separation/lesson.draft.json
```

已有相同旁白和语音配置的缓存时，重新编译并播放：

```bash
npm run lesson -- --draft examples/task-separation/lesson.draft.json --cached
```

缓存缺失时需要自行配置语音服务，并显式使用 `--generate` 允许合成。动画替换不要求重新生成旁白；本次人工预览复用了全部六段真实缓存，约 89.598 秒。

本机已生成的预览重播：

```bash
npm run lesson -- --play outputs/previews/task-separation-scene-v2
```

预览目录是本机产物，未纳入版本控制；其他 checkout 用材料重新编译。样例用于验证视觉表达，内容与语音仍需人工审核。
