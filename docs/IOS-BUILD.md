# iPhone 17 Pro Max：iOS 打包

本分支把 Folia 的 Web 前端资源打包到 Capacitor WKWebView，沿用上游 AGPL-3.0 许可证。iOS 工具链放在 `packaging/ios/`，不改变根 Web / Electron 项目的依赖。生成的 `packaging/ios/native/` 和 `packaging/ios/output/` 不提交到 Git。

## 构建产物的含义

- 目标：真实 iPhone 的 arm64 **未签名 IPA**，不是模拟器应用，也不是把 ZIP 文件改后缀。
- 包内包含本地编译的 `dist`；没有使用 `server.url` 替换成远程网页。
- 安装前需要使用自己的 Apple 签名方式重新签名。证书、描述文件和账号密钥不放进源码、IPA 或 Release。
- `BUILD-INFO.json` 记录源码 commit、是否配置后端、产物 SHA-256；旁边的 `.sha256` 用于下载后核验。
- GitHub Actions 变绿表示设备端归档、IPA ZIP、plist、arm64 架构及未签名状态检查成功；不等于真机音频、锁屏播放或全部在线账号流程已验证。

## 在线服务地址

iOS 不包含 Electron 桌面版内置的 Node.js 音乐后端。请先按上游 Web 部署说明配置自己的 HTTPS 后端，再提供以下**公开服务地址**；服务端密钥留在服务端。

| 变量 | 格式 / 用途 |
| --- | --- |
| `VITE_FOLIA_API_BASE` | **纯 HTTPS origin**，例如 `https://music.example.org`；不带 `/api`、子路径、query、账号或密码。相对 `/api/...` 请求由客户端解析到此 origin，保留请求路径及 query。 |
| `VITE_NETEASE_API_BASE` | 自己的网易云 API HTTPS 根地址；同站点代理也可填写 `/api/netease`。 |
| `VITE_KUGOU_API_BASE` | 可选的酷狗 API HTTPS 根地址，或此 origin 下的相对路径。 |
| `VITE_QQ_API_BASE` | 可选的 QQ API HTTPS 根地址；同站点 Serverless 代理常用 `/api/qq`。 |

相对 provider 地址要求同时填写 `VITE_FOLIA_API_BASE`。脚本会拒绝 HTTP、协议相对 URL 以及在地址中嵌入密码。WKWebView 的请求来源是 `capacitor://localhost`，后端须正确支持该来源的跨域请求、实际使用的 cookie / 登录策略和 HTTPS 音频地址；部署后需真机验证。

没有填写后端地址时，构建仍可生成用于界面检查的包，日志和 `BUILD-INFO.json` 会明确记录“未配置”；在线搜索、登录、歌词代理或 AI 功能并不因此自动获得后端。

## 在 GitHub 上构建并保存到仓库 Release

1. 将本分支提交到自己的 GitHub 仓库。
2. 在仓库 **Settings → Secrets and variables → Actions → Variables** 设置上述公开地址；也可运行时在输入框填写。
3. 打开 **Actions → iOS Unsigned IPA → Run workflow**，选择本分支。
4. 选中 `publish_release` 后，流程会创建 `ios-build-<运行编号>` 预发布并上传 IPA、校验值和构建记录；未选中时仍会保存 30 天的 Actions artifact。
5. 下载成功流程的 artifact 或 Release 附件；不要从失败日志推断已有可用 IPA。

推送 `ios-*` 标签也会触发构建并附加到同名 Release，此时服务地址来自仓库 Variables。

## 本地构建（macOS）

要求 Node.js 24+、Xcode 26+ 和 Xcode Command Line Tools。iOS 依赖精确固定为 Capacitor `8.5.3`；使用官方支持的 Swift Package Manager，不要求 CocoaPods。

在仓库根目录运行：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm --prefix packaging/ios ci --no-audit --no-fund
npm --prefix packaging/ios test

export VITE_FOLIA_API_BASE='https://music.example.org'
export VITE_NETEASE_API_BASE='/api/netease'
export VITE_QQ_API_BASE='/api/qq'

npm --prefix packaging/ios run build:web
npm --prefix packaging/ios run prepare:ios
npm --prefix packaging/ios run build:unsigned
```

产物路径为 `packaging/ios/output/Folia-iPhone17PM-<版本>-unsigned.ipa`。下载后可运行 `shasum -a 256 -c <IPA文件>.sha256`，并用 `unzip -t <IPA文件>` 检查归档。

`prepare:ios` 和 `build:unsigned` 会在非 macOS 环境以 `IOS_REQUIRES_MACOS` 和非零退出码终止。跨平台单测只验证构建配置和校验逻辑，不调用 Xcode。

## 原生行为与后续验收

本次打包保留上游 Web 行为；桌面专属 Electron 模组、目录扫描、桌面壁纸、系统托盘等不随 iOS 容器移植。iOS 文件导入与后台 / 锁屏持续播放需额外的原生能力和真机回归；仅启用音频 background mode 并不能代替完整音频实现。

建议真机依次检查：首启、竖屏 / 左右横屏安全区、搜索键盘、设置长内容滚动、44 点点击目标、前台歌曲切换与 seek、Navidrome / 配置后的在线 API 登录、锁屏与回到前台、系统增大字体。模拟 WebKit 的布局测试不等同于这张真机验收单。

## 回退

这套工具不修改原始仓库或根依赖。回退本分支时撤销新增的 `packaging/ios/`、`.github/workflows/ios-unsigned-ipa.yml` 和本文档，以及同次提交中的客户端 iPhone 适配；保留上游原来的 Web / Electron 流程。若已有本地生成工程，先保留自行添加的原生代码，再清理生成目录。

## 核对依据

- [Capacitor 环境要求：macOS、Xcode 26+](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor iOS / WKWebView](https://capacitorjs.com/docs/ios)
- [SPM 原生工程生成方式](https://capacitorjs.com/docs/ios/spm)
- [Capacitor 8.5.3 发布记录](https://github.com/ionic-team/capacitor/releases/tag/8.5.3)
- [GitHub macOS runner 的 Apple 签名材料管理](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)
