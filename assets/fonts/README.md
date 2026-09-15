# 内置字体来源

完整中文源字体供 CLI 宿主在本机生成任意课程所需的笔画，不由播放器下载外网资源。保留原版权和 OFL 许可证。原马善政字体仍在 content-generator 内，英文／数字字体仍由固定 Tegaki 0.22.1 依赖提供。

- `xiaolai.ttf`：官方 [小赖字体 v3.126](https://github.com/lxgw/kose-font/releases/tag/v3.126) 的 `Xiaolai-Regular.ttf`。许可证 `OFL-xiaolai.txt`。
- `wenkai.ttf`：官方 [霞鹜文楷 v1.522](https://github.com/lxgw/LxgwWenKai/tree/v1.522/fonts/TTF) 的 `LXGWWenKai-Regular.ttf`。许可证 `OFL-wenkai.txt`。
- 英文 Klee One 许可证来自 [Fontworks Klee](https://github.com/fontworks-fonts/Klee/blob/master/OFL.txt)，Parisienne 许可证来自 [Google Fonts](https://github.com/google/fonts/blob/main/ofl/parisienne/OFL.txt)。同样复制到播放包中随生产包分发。

完整源字体哈希记录在 `SHA256SUMS`。播放器自带的中文子集及其 Tegaki 数据覆盖仓库 `public/lessons/*.json` 中的示例用字；子集使用新的 LearnAnything 名称，原度量与轮廓不变，保留原版权及许可证。

重新生成示例资源（开发步骤，用户播放／导出不需要 FontTools 或 Python）：

```bash
npm run build:modules
node --conditions=learn-anything-source --experimental-strip-types scripts/generate-font-presets.ts
# 使用装有 fonttools==4.65.0 的 Python 环境
python scripts/subset-font-presets.py
```

FontTools 子集化记录为 4.65.0；笔画生成仍采用仓库固定的 Tegaki 0.22.1 管线。生成期间不下载字体、不调用模型或语音接口。
