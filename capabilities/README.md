# 板书与动画能力包

这里放宿主的扩展能力。新增能力目录后，在 `index.ts` 的 `capabilityPacks` 注册一项，备课、材料校验、时间轴编译、网页与独立播放器共同使用。

- [完整扩展规范](../docs/capability-packs.md)
- [通用情境动画](./scene/README.md)
- [课题分离材料示例](../examples/task-separation/README.md)

纯入口声明规则与备课说明，通过 `loadRenderer` 延迟加载浏览器绘制代码。三个业务模块不相互依赖，也不直接依赖这里的宿主代码。
