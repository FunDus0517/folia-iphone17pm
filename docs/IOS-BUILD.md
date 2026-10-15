# iPhone 17 Pro Max：iOS 打包

本分支把 Folia 的网页前端资源打包到 Capacitor WKWebView，沿用上游 AGPL-3.0 许可证。iOS 工具链放在 `packaging/ios/`，不改变根网页项目或 Electron 项目的依赖。生成的 `packaging/ios/native/` 和 `packaging/ios/output/` 不提交到 Git。

当前默认构建是**无后端界面体验包**：可以检查中文界面、屏幕比例、按键、安全区和内置歌词动画预览；没有附送在线音乐后端，也没有内置可试听歌曲。本地音频导入尚未移植到 iOS，此包尚未完成离线音乐播放器所需的音频导入与真机播放验收。

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

相对音乐服务地址要求同时填写 `VITE_FOLIA_API_BASE`。脚本会拒绝 HTTP、协议相对地址以及在地址中嵌入密码。WKWebView 的请求来源是 `capacitor://localhost`，后端须正确支持该来源的跨域请求、实际使用的会话与登录策略和 HTTPS 音频地址；部署后需真机验证。

没有填写后端地址时，日志和 `BUILD-INFO.json` 会明确记录“无后端界面体验包”，并注明本地音频导入尚未移植、未内置可试听歌曲；在线搜索、登录、歌词代理或 AI 功能并不因此自动获得后端。

## 在 GitHub 上构建并保存到仓库发布页

1. 将本分支提交到自己的 GitHub 仓库。
2. 当前不接后端时，所有接口地址保持为空；以后可在仓库 **设置 → 密钥和变量 → 操作 → 变量** 设置上述公开地址，也可运行时在输入框填写。
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

这套工具不修改原始仓库或根依赖。回退本分支时撤销新增的 `packaging/ios/`、`.github/workflows/ios-unsigned-ipa.yml` 和本文档，以及同次提交中的客户端 iPhone 适配；保留上游原来的网页或 Electron 流程。若已有本地生成工程，先保留自行添加的原生代码，再清理生成目录。

## 核对依据

- [Capacitor 环境要求：macOS、Xcode 26+](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor iOS / WKWebView](https://capacitorjs.com/docs/ios)
- [SPM 原生工程生成方式](https://capacitorjs.com/docs/ios/spm)
- [Capacitor 8.5.3 发布记录](https://github.com/ionic-team/capacitor/releases/tag/8.5.3)
- [GitHub macOS 执行环境的 Apple 签名材料管理](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)
