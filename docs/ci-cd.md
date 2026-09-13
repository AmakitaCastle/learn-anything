# Git 与 CLI 自动发布

仓库使用 GitHub Actions 的 `CLI CI/CD` 工作流。当前交付是源码 CLI Demo，CD 发布 GitHub Release，不部署在线服务，也不发布 npm 包。

## 日常提交

```bash
git switch -c feat/my-change
# 完成改动和相关检查
git add <改动文件>
git commit -s -m "feat: describe the change"
git push -u origin feat/my-change
```

在 GitHub 创建 PR，检查通过后合并。所有分支提交与 PR 都会执行单元测试、类型检查、生产构建、模块独立消费和 Chromium 浏览器回归。主分支通过后，额外生成源码包与 SHA-256 校验文件，并在干净目录安装和播放自带 Demo；可在 Actions 下载 `cli-source-<commit>` 产物。

测试无需模型或语音密钥。失败时保留浏览器诊断产物 7 天，源码包保留 30 天。普通分支重复提交会取消旧检查，版本标签的运行不会取消。

## 自动发布版本

从已合并的主分支创建新标签：

```bash
git switch main
git pull --ff-only
# 先确认此版本号尚未使用
git tag -a v0.1.1-demo.1 -m "learnAnything v0.1.1-demo.1"
git push origin v0.1.1-demo.1
```

标签必须是 `v主.次.修订`，可附 `-demo.1`、`-rc.1` 等预发布后缀。推送后依次执行：全量检查 → 归档标签指向的同一提交 → 干净源码安装及离线 Demo 播放 → 上传产物 → 创建 Release。任何环节失败都不会发布。

带后缀的版本自动标记为 Pre-release，稳定版本正常发布。源码包使用 Git 已提交文件，排除被忽略的本地配置、依赖和生成缓存。发布只使用仓库自带 `GITHUB_TOKEN`，无需配置个人令牌或付费接口密钥。写权限仅授予最后的发布任务，PR 不执行发布任务。

已有公开版本不覆盖、不移动标签。已发布后需要修改时创建新版本。发布之前失败可以在 Actions 重跑；如果 Release 已存在，创建步骤会拒绝覆盖，应先检查现有发布内容。

## 不发布的流程验证

在 Actions 选择 `CLI CI/CD` → Run workflow，可选择分支运行全量检查与源码包验收。手工触发不会创建 Release，即使选择了版本标签也不会发布。

本地只打包已提交的当前源码：

```bash
bash scripts/package-release.sh
```

产物位于 `outputs/release/`。GitHub Release 页面会提供相同格式的源码包和 `SHA256SUMS`。校验可在 Linux 使用 `sha256sum -c SHA256SUMS`，macOS 使用 `shasum -a 256 -c SHA256SUMS`。

工作流定义见 [.github/workflows/ci.yml](../.github/workflows/ci.yml)，打包脚本见 [scripts/package-release.sh](../scripts/package-release.sh)。GitHub 权限和触发行为参照 [官方工作流语法](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。
