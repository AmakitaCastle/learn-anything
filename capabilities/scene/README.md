# scene：通用二维情境与概念动画

用人物、物件、气泡、区域和卡片解释情境、观点、归属、边界与叙事变化。它根据课程数据呈现场景，不识别主题或使用课程专用模板。

`model.ts` 同时定义数据校验、动作、状态插值与模型使用说明；`renderer.tsx` 使用内置矢量图形，`index.ts` 提供纯规则和延迟绘制入口。能力 ID 为 `scene`，实现版本为 `1.0.0`。

## 配置与动作

元素 `kind`：`person`、`phone`、`message`、`thought`、`card`、`region`、`text`、`token`、`document`。每项声明 `id`、`label`、中心坐标 `position`；可选 `width`、`height`、`tone`。坐标和尺寸使用 0–100 画布百分比。色调为 `ink/blue/amber/rose/green/muted`，最多 60 个元素、100 条关系。

所有元素初始隐藏，用 `show` 随讲解展示。动作：

| 动作                     | payload                                      |
| ------------------------ | -------------------------------------------- |
| `show` / `hide`          | `{id, duration?}`                            |
| `move`                   | `{id, position:{x,y}, duration?}`            |
| `group`                  | `{id, regionId, position?:{x,y}, duration?}` |
| `emphasize`              | `{id, active?:true, duration?}`              |
| `connect` / `disconnect` | `{id:关系ID, duration?}`                     |
| `camera`                 | `{position:{x,y}, scale, duration?}`         |

`group` 绑定语义归属，并移动到声明的绝对画布坐标；省略位置时移到区域中心。它不建立父子坐标继承。关系在 `config.relations` 中声明 `id/from/to/kind/label?`，`kind` 为 `arrow/line/opposition`，连线随端点移动。区域先绘制在背景层。

动作默认持续 0.8 秒，可设 0–10 秒；相机倍率 0.5–3。元素的位置、显隐和强调具有独立插值轨道，支持途中打断，所有进度由课堂时间决定。配置没有时间字段，动作全部通过 `when` 锚定旁白。

## 课程片段

```json
{
  "visuals": [
    {
      "id": "boundary",
      "grammar": "scene",
      "config": {
        "elements": [
          {
            "id": "mine",
            "kind": "region",
            "label": "我的范围",
            "position": { "x": 25, "y": 50 }
          },
          {
            "id": "action",
            "kind": "card",
            "label": "我的行动",
            "position": { "x": 50, "y": 50 }
          }
        ]
      }
    }
  ],
  "events": [
    {
      "type": "visual",
      "visualId": "boundary",
      "action": "show",
      "payload": { "id": "mine" },
      "when": { "segment": "explain" }
    },
    {
      "type": "visual",
      "visualId": "boundary",
      "action": "show",
      "payload": { "id": "action" },
      "when": { "segment": "explain" }
    },
    {
      "type": "visual",
      "visualId": "boundary",
      "action": "group",
      "payload": { "id": "action", "regionId": "mine" },
      "when": { "segment": "explain", "phrase": "属于我" }
    }
  ]
}
```

这是完整材料的字段片段，需有对应旁白、图文关联与其他必填字段。完整样例见 [课题分离](../../examples/task-separation/lesson.draft.json)。

首版侧重简洁的符号与情境表达。专用地图、复杂角色表演、生成图片等可以扩展此包或注册新的能力包；通用注册和播放机制不需要按学科增加分支。
