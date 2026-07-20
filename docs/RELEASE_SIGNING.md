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

### 5. 上传 Play(首次手动)
Play Console → 创建应用 → 内部/封闭测试 → 上传 `.aab` → 填 Data safety / 内容分级 / 隐私政策 URL → 发布。
> 首次建议走 **Play App Signing**(Google 托管发布签名,你的 `upload-keystore` 只作上传密钥)。
> **首次必须手动传一次**:Play API 不允许为全新包名做首次上传。之后即可用下面的自动发布。

### 未配置 Secret 时
`Android Release AAB` 仍会跑,但产出**未签名** AAB(不可上架),并在日志里 `::warning::` 提示。本地/CI 冒烟不受影响。

---

## Android — 自动发布到 Google Play（closed 测试轨道）

配好后:**打一个 `vX.Y.Z` tag(或手动 Run workflow)→ CI 自动构建签名 AAB 并发布到你的
closed 轨道**(`status=completed`,上传即生效)。GitHub 与 Play 之间没有原生「关联」按钮——
靠一个 **Play 服务账号(JSON 密钥)**打通,由 `android-release.yml` 的发布步骤调用。

### 前置(已满足):应用已在 Play Console 创建且**手动上传过至少一次**、已启用 Play App Signing。

### 1. Google Cloud:启用 API
- 打开 [Google Cloud Console](https://console.cloud.google.com/) → 选一个项目(或新建)。
- **APIs & Services → Enable APIs** → 启用 **Google Play Android Developer API**。
  > 若你从 Play Console → **Setup → API access** 进入,可自动关联/新建 GCP 项目,更省事。

### 2. 建服务账号 + JSON 密钥
- GCP → **IAM & Admin → Service Accounts → Create service account**(名字随意,如 `play-publisher`)。
- 建好后 → 该账号 → **Keys → Add key → Create new key → JSON** → 下载 JSON(**只存 GitHub Secret,勿入库**)。
- 记下服务账号邮箱:形如 `play-publisher@<项目>.iam.gserviceaccount.com`。

### 3. 在 Play Console 授权该服务账号
- Play Console → **Users and permissions → Invite new users** → 填上一步的服务账号邮箱。
- 授予**该应用**权限:至少勾选
  **Release to testing tracks** 与 **Manage testing track releases**(封闭测试轨道所需)。
- 该 **closed 轨道要先在 Play Console 建好**(Testing → Closed testing → 建 alpha/beta 或自定义轨道并加测试人员)。
- 授权可能需几分钟到数十分钟生效。

### 4. 配 GitHub Secret / Variable
仓库 → Settings → Secrets and variables → Actions:
| 类型 | 名称 | 值 |
|---|---|---|
| **Secret** | `PLAY_SERVICE_ACCOUNT_JSON` | 第 2 步下载的 JSON **全文** |
| Variable(可选) | `PLAY_TRACK` | 你的 closed 轨道名(默认 `alpha`) |
| Variable(可选) | `PLAY_VERSION_CODE_OFFSET` | 若历史手动上传用过更高 versionCode,设一个正整数把地板抬到其上(默认 `0`) |

> 4 个 `ANDROID_KEYSTORE_*` 签名 Secret 必须仍是**与首次手动上传同一把 upload key**,否则 Play 拒收。

### 5. 触发发布
- 打 tag:`git tag v4.5.0 && git push <remote> v4.5.0`;或
- Actions → **Android Release AAB** → Run workflow。
- 看 CI:构建签名 AAB → **Publish to Google Play (closed testing)** 绿 → Play Console 对应
  closed 轨道出现该 versionCode 的 release。

### 未配置 `PLAY_SERVICE_ACCOUNT_JSON` 时
发布步骤自动 **skip**(日志有 `::notice::`),workflow 照常构建 + 出 AAB artifact,零影响。

### 常见报错
- `The caller does not have permission` → 服务账号在 Play Console 的授权未生效/权限不足(回第 3 步)。
- `Version code N has already been used` / 必须更高 → 设 `PLAY_VERSION_CODE_OFFSET` 抬高地板。
- `Track ... could not be found` → `PLAY_TRACK` 名与 Play Console 里的轨道名不一致。
- `APK/AAB ... not allowed`(全新包)→ 该包名还没手动传过首个包(回第 5 节「首次手动」)。

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
