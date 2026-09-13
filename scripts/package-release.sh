#!/usr/bin/env bash
set -euo pipefail

release_ref=${RELEASE_REF:-$(git symbolic-ref -q HEAD || true)}
release_sha=${RELEASE_SHA:-$(git rev-parse HEAD)}
prerelease=false
if [[ "$release_ref" == refs/tags/* ]]; then
  version=${release_ref#refs/tags/}
  if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$ ]]; then
    echo 'Expected a version tag such as v0.1.1 or v0.1.1-demo.1' >&2
    exit 1
  fi
  [[ "$version" != *-* ]] || prerelease=true
else
  version="snapshot-${release_sha:0:12}"
fi

archive_name="learn-anything-$version"
mkdir -p outputs/release
rm -f outputs/release/learn-anything-*.tar.gz outputs/release/SHA256SUMS outputs/release/RELEASE-NOTES.md
# Archive committed files only: never include dependencies, credentials or outputs.
git archive --format=tar --prefix="$archive_name/" "$release_sha" | gzip -n > "outputs/release/$archive_name.tar.gz"
node --input-type=module - "$archive_name" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const file = `${process.argv[2]}.tar.gz`;
const digest = createHash('sha256').update(readFileSync(`outputs/release/${file}`)).digest('hex');
writeFileSync('outputs/release/SHA256SUMS', `${digest}  ${file}\n`);
NODE
cat > outputs/release/RELEASE-NOTES.md <<'NOTES'
输入主题，在本机生成包含语音、动态板书和概念动画的课程。

下载并解压源码包，安装 Node.js ≥22.13，然后运行：

```bash
npm ci
npm run demo
```

自带课程无需 API Key、FFmpeg 或已有缓存。生成自己的课程需要配置文本模型与豆包语音，并安装 FFmpeg／FFprobe，详见源码中的 README.md。

SHA256SUMS 用于校验源码包。发布流程检查 Linux 上的程序、浏览器播放和干净源码安装；不会请求付费模型或语音服务，不代替课程内容与听感的人工审核。Windows 尚未实机验收。
NOTES
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "prerelease=$prerelease" >> "$GITHUB_OUTPUT"
fi
