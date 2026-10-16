# iPhone 17 Pro Max：iOS 打包

本分支把 Folia 的网页前端资源打包到 Capacitor WKWebView，沿用上游 AGPL-3.0 许可证。iOS 工具链放在 `packaging/ios/`；根项目增加精确版本的 `@capacitor/core`，供音乐服务局部原生请求使用。生成的 `packaging/ios/native/` 和 `packaging/ios/output/` 不提交到 Git。

当前默认构建是**无后端界面体验包**：可以检查中文界面、屏幕比例、按键、安全区和内置歌词动画预览；没有附送在线音乐后端，也没有内置可试听歌曲。安装后可在设置中填写自己的音乐服务地址，无需因此重新编译。本地音频导入尚未移植到 iOS，此包尚未完成离线音乐播放器所需的音频导入与真机播放验收。

## 构建产物的含义

- 目标：真实 iPhone 的 arm64 **未签名 IPA**，不是模拟器应用，也不是把 ZIP 文件改后缀。
- 包内包含本地编译的 `dist`；没有使用 `server.url` 替换成远程网页。
- 安装前需要使用自己的 Apple 签名方式重新签名。证书、描述文件和账号密钥不放进源码、IPA 或发布页附件。
- `BUILD-INFO.json` 记录源码提交标识、是否配置后端、体验包说明和产物 SHA-256；旁边的 `.sha256` 用于下载后核验。
- GitHub Actions 变绿表示设备端归档、IPA ZIP、plist、arm64 架构及未签名状态检查成功；不等于真机音频、锁屏播放或全部在线账号流程已验证。

## 在线服务地址

iOS 不包含 Electron 桌面版内置的 Node.js 音乐后端。当前没有后端时保持下列变量为空即可构建界面体验包。以后如需在线功能，请先按上游网页部署说明配置自己的 HTTPS 后端，再提供以下**公开服务地址**；服务端密钥留在服务端。

| 变量 | 格式 / 用途 |
| --- | --- |
| `VITE_FOLIA_API_BASE` | **纯 HTTPS 站点源地址**，例如 `https://music.example.org`；不带 `/api`、子路径、查询参数、账号或密码。相对 `/api/...` 请求由客户端解析到此源地址，保留请求路径及查询参数。 |
| `VITE_NETEASE_API_BASE` | 自己的网易云 API HTTPS 根地址；同站点代理也可填写 `/api/netease`。 |
| `VITE_KUGOU_API_BASE` | 可选的酷狗 API HTTPS 根地址，或此站点源地址下的相对路径。 |
| `VITE_QQ_API_BASE` | 可选的 QQ API HTTPS 根地址；同站点云函数代理常用 `/api/qq`。 |

相对音乐服务地址要求同时填写 `VITE_FOLIA_API_BASE`。脚本会拒绝 HTTP、协议相对地址以及在地址中嵌入密码。WKWebView 的请求来源是 `capacitor://localhost`；网页回退、歌词代理及音频资源仍须分别核对跨域、会话策略和 HTTPS 地址。三音源的小型 JSON 请求在真实原生环境走下述局部原生 HTTP，不把 WebView 的 CORS 当作这条路径的连接前提；部署后仍需真机验证。

没有填写后端地址时，日志和 `BUILD-INFO.json` 会明确记录“无后端界面体验包”，并注明本地音频导入尚未移植、未内置可试听歌曲；在线搜索、登录、歌词代理或 AI 功能并不因此自动获得后端。

## 安装后配置手机音乐服务

1. 打开 **设置 → 连接与集成 → 音乐服务连接**，分别填写网易云、QQ、酷狗的兼容 API 地址。音乐官网（如 `music.163.com`、`y.qq.com`）不是 API；不需要的平台可留空。
2. 地址必须是完整 HTTPS，可包含自己的部署路径，但不要含账号、密码、查询参数或片段。若填写 `/qq` 这类相对路径，先填写下方的 **Folia 服务域名**；此域名只填纯 HTTPS 站点源地址，它不会自动配置三个音源。
3. 点击各平台的 **检测连接**。检测只读接口响应，不保存草稿、不登录账户。**格式检查通过 ≠ 接口连接成功 ≠ 账号登录成功 ≠ 歌曲播放成功**。
4. 点击 **保存并应用** 并确认，再点 **刷新应用**。发生地址变化的平台会清除旧会话，旧账户快照也不会按新服务登录态恢复，防止把旧登录态发送到其它服务；随后需要重新登录。未变化的平台不因此退出。
5. **清除手机配置** 会恢复安装包默认地址；默认未配置的平台仍保持未配置，不会自动获得公共服务。配置保存在当前手机，不写回 GitHub。

使用仓库的 Docker Compose 一站式部署时，三平台地址分别是 `https://你的域名/netease`、`https://你的域名/qq`、`https://你的域名/kugou`；Folia 服务域名填写 `https://你的域名`。Docker 路由不是 serverless 的 `/api/qq`，应以实际部署为准。部署步骤见 `deploy/docker/README.md`；QQ 后端需 3.3.0 才具备本项目使用的推荐和歌单写入接口。QQ 的微信/QQ 扫码通道也取决于部署平台，详见 `docs/qq-music-deployment.md`。

`nativeMusicFetch` 只对三音乐服务及连接检测的小型 JSON 请求使用 `CapacitorHttp.request`：仅原生环境启用，HTTPS、禁止跨站点重定向、八秒超时；网页/Electron 保持原有 fetch。不启用全局 fetch/XMLHttpRequest 替换，也不让音频、图片或文件通过 JSON 桥。取消或超时只结束 JavaScript 等待，已启动的原生请求可能仍在进行，因此账户写入不应自动重试。实际音乐音频流仍走媒体/网页路径，需独立验证证书、编码、Range、跨域、缓存和真机播放。

官方依据：[Capacitor HTTP：局部请求、超时与大文件桥接限制](https://capacitorjs.com/docs/apis/http)。本轮真实在线账号与播放尚未验收，功能边界见 `docs/IOS-FUNCTION-CHECK.md`。

## 在 GitHub 上构建并保存到仓库发布页

1. 将本分支提交到自己的 GitHub 仓库。
2. 当前不接后端时，所有接口地址保持为空；以后可在仓库 **设置 → 密钥和变量 → 操作 → 变量** 设置上述公开地址、运行工作流时填写构建输入，或安装后在手机设置中填写。
3. 打开 **操作 → 苹果未签名安装包 → 运行工作流**，选择本分支；流程文件是 `.github/workflows/ios-unsigned-ipa.yml`。
4. 选中 `publish_release` 后，流程会创建 `ios-build-<运行编号>` 预发布并上传 IPA、校验值和构建记录；未选中时仍会保存 30 天的流程产物。
5. 下载成功流程的产物或发布页附件；不要从失败日志推断已有可用 IPA。

推送 `ios-*` 标签也会触发构建并附加到同名发布页，此时服务地址来自仓库变量。

## 本地构建（macOS）

要求 Node.js 24+、Xcode 26+ 和 Xcode 命令行工具。iOS 依赖精确固定为 Capacitor `8.5.3`；使用官方支持的 Swift 软件包管理器（SPM），不要求 CocoaPods。

在仓库根目录运行：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix packaging/ios ci --no-audit --no-fund
npm --prefix packaging/ios test

# 当前先构建无后端界面体验包，所有在线服务地址均留空。
export VITE_FOLIA_API_BASE=''
export VITE_NETEASE_API_BASE=''
export VITE_KUGOU_API_BASE=''
export VITE_QQ_API_BASE=''

npm --prefix packaging/ios run build:web
npm --prefix packaging/ios run prepare:ios
npm --prefix packaging/ios run build:unsigned
```

产物路径为 `packaging/ios/output/Folia-iPhone17PM-<版本>-unsigned.ipa`。下载后可运行 `shasum -a 256 -c <IPA文件>.sha256`，并用 `unzip -t <IPA文件>` 检查归档。

`prepare:ios` 和 `build:unsigned` 会在非 macOS 环境以 `IOS_REQUIRES_MACOS` 和非零退出码终止。跨平台单测只验证构建配置和校验逻辑，不调用 Xcode。

## 原生行为与后续验收

本次打包保留上游网页行为；桌面专属 Electron 模组、目录扫描、桌面壁纸、系统托盘等不随 iOS 容器移植。iOS 本地音频导入与后台或锁屏持续播放需额外的原生能力和真机回归；仅启用后台音频模式仍不足以完成完整的音频实现。

- **内置歌词预览**：可在设置中的歌词动画编辑器预览内置示例文本、封面与模拟频谱；该预览没有配套可试听歌曲。
- **本地音乐**：上游曲库依赖浏览器目录选择接口；当前容器未接入 iOS 音频文件选择。已有的文件输入用于歌词、图片、字体、配置或匹配现有曲库的歌单，不是音频导入入口。
- **Navidrome**：可在设置中填写自己的 HTTPS 服务地址及账号；它独立于 Folia 在线音乐后端，但仍需要真实可用的服务及真机连接验证。

当前建议真机依次检查：首启、中文界面、竖屏及左右横屏安全区、搜索键盘、设置长内容滚动、44 点点击目标、歌词动画预览和系统增大字体。以后配置音乐服务后，再检查前台歌曲切换、进度拖动、Navidrome 或在线 API 登录、锁屏与回到前台。模拟 WebKit 的布局测试不等同于这张真机验收单。

## 回退

回退本分支时撤销新增的 `packaging/ios/`、`.github/workflows/ios-unsigned-ipa.yml`、手机服务配置与局部 HTTP 模块、相关文档及根依赖变动，以及同次提交中的客户端 iPhone 适配；保留上游原来的网页或 Electron 流程。若已有本地生成工程，先保留自行添加的原生代码，再清理生成目录。

## 核对依据

- [Capacitor 环境要求：macOS、Xcode 26+](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor iOS / WKWebView](https://capacitorjs.com/docs/ios)
- [SPM 原生工程生成方式](https://capacitorjs.com/docs/ios/spm)
- [Capacitor 8.5.3 发布记录](https://github.com/ionic-team/capacitor/releases/tag/8.5.3)
- [GitHub macOS 执行环境的 Apple 签名材料管理](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)
