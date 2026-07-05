# 发布签名操作手册（Android + iOS）

CI 签名骨架已就位。下面是你需要提供凭据的确切步骤;凭据只放 GitHub Secrets,**绝不入库**。

---

## Android — 签名 AAB（可直接做）

### 1. 生成上传密钥库（一次性,本地跑,妥善保管）
```bash
keytool -genkey -v -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias sierro-upload
```
> 记住你设的 **store 口令**、**key 别名**(`sierro-upload`)、**key 口令**。
> `upload-keystore.jks` 是你上架的唯一签名凭据,丢失将无法更新已发布的 App —— 异地备份。

### 2. 把密钥库转成 base64（用于 Secret）
```bash
base64 -w0 upload-keystore.jks   # Linux
base64 -i upload-keystore.jks    # macOS
```
复制输出。

### 3. 在 GitHub 配置 4 个 Secret
仓库 → Settings → Secrets and variables → Actions → New repository secret:

| Secret 名 | 值 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 上一步的 base64 字符串 |
| `ANDROID_KEYSTORE_PASSWORD` | store 口令 |
| `ANDROID_KEY_ALIAS` | `sierro-upload` |
| `ANDROID_KEY_PASSWORD` | key 口令 |

### 4. 产出签名 AAB
- 手动:Actions → **Android Release AAB** → Run workflow;或
- 打 tag:`git tag v3.34.0 && git push gh v3.34.0`

产物在该 run 的 Artifacts:`sierro-energy-v<版本>.aab`(带 `-signed` 后缀)。
`versionCode` 用 CI run number 自增,保证每次上传 Play 递增。

### 5. 上传 Play
Play Console → 创建应用 → 内部测试(Internal testing)→ 上传 `.aab` → 填 Data safety / 内容分级 / 隐私政策 URL → 发布内测。
> 首次建议走 **Play App Signing**(Google 托管发布签名,你的 `upload-keystore` 只作上传密钥)。

### 未配置 Secret 时
`Android Release AAB` 仍会跑,但产出**未签名** AAB(不可上架),并在日志里 `::warning::` 提示。本地/CI 冒烟不受影响。

---

## iOS — TestFlight（需 Mac + Apple 开发者账号）

iOS 签名无法在本仓库的 Linux CI 完成,需 macOS runner + 你的证书。步骤:

### 1. 前置(Apple Developer Portal)
- App ID:`com.sierro.energyapp`(与 `capacitor.config.ts` 一致)
- 若首发要推送:开启 **Push Notifications** capability + 生成 **APNs Key**(.p8)
- 生成 **Distribution 证书** + **App Store provisioning profile**

### 2. 先在 Xcode 里补两件事(打开 `ios/App/App.xcworkspace`)
- 把已生成的 `ios/App/App/PrivacyInfo.xcprivacy` 拖入 App target 的 **Copy Bundle Resources**(本仓库已建文件,但 pbxproj 未引用)
- 修 `Build iOS App` CI 报的 `@capacitor/status-bar` 编译错误(`CAPBridgeProtocol has no member webView`):在 Mac 上对齐 Capacitor 版本或替换状态栏方案后验证

### 3. 版本
`ios/App/App.xcodeproj` 的 `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` 目前是 1/1.0,发布前对齐到 `package.json` 版本(可用 fastlane `increment_version_number` 自动化)。

### 4. 上 TestFlight(二选一)
- **Xcode**:Product → Archive → Distribute App → App Store Connect(手动,最简单起步)
- **fastlane / Xcode Cloud**:自动化;需把证书(.p12)、profile、APNs Key 存为 CI Secret,在 macOS runner 上 `fastlane pilot upload`

> iOS 这条链路依赖 Mac 与你的开发者账号,代码侧已就绪(工程、权限文案、隐私清单),剩下是证书与 Archive。

---

## 安全提醒
- 所有 `.jks / .p12 / .p8 / .mobileprovision` 已在 `.gitignore`,**不要**提交到仓库。
- 平台 AppSecret 视为已泄露(见 RELEASE_PLAN P0-1),请向 Solar of Things 申请轮换。
