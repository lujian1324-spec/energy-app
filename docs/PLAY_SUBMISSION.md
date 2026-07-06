# Google Play 提交清单（照抄即可）

App:**Sierro Energy** · 包名:**com.sierro.energyapp** · 首个上传轨道建议:**内部测试**

> 所有 Data safety / 权限答案都基于本仓库真实代码(隐私审计得出),可直接采用。
> 需你决定/替换的地方标了 ⚠️。

---

## 0. 前置
1. 已填 4 个 GitHub Secret(见 RELEASE_SIGNING.md),跑 **Android Release AAB** 得到签名 `.aab`。
2. 用 Google Play 开发者账号(一次性 $25)创建应用。

## 1. 创建应用
- App name:`Sierro Energy`
- Default language:`English (United States)` ⚠️(按目标市场,可改)
- App or game:**App**
- Free or paid:**Free**
- 勾选各项声明(政策、出口法)。

## 2. 商店素材(已生成,见发给你的文件)
| 项 | 文件 / 值 |
|---|---|
| App icon (512×512) | `play-assets/play-store-icon-512.png` |
| Feature graphic (1024×500) | `play-assets/feature-graphic-1024x500.png` |
| Phone screenshots (≥2) | `play-assets/screenshots-play/*.png` — 5 张精修图(1450×2900,精确 2:1,符合 Play);顺序 1-backup-hero → 2-all-in-one → 3-monitor-power → 4-add-devices → 5-energy-impact。App Store 原比例版(1360×2900)在 `screenshots-appstore/` |
| Short description (≤80 字符) | `Monitor and control your Sierro home battery — live power, schedules, alerts.` |
| Full description | 见下方附录 A |

## 3. 应用内容（App content,左侧菜单逐项填）

### Privacy policy
- URL:`https://lujian1324-spec.github.io/energy-app/#/privacy` ⚠️(确认 Pages 已部署可访问)

### App access（重要——App 有登录墙）
- 选 **All or some functionality is restricted**
- 提供审核用说明 + 测试账号:
  - Instructions:`Tap "Continue as Guest" on the login screen to browse demo devices without an account. For full features, log in with the test account below.`
  - ⚠️ 测试账号:填一个真实可登录账号(如 `jason1324` / 对应密码)。**不要**用你的主账号;建议单开一个测试账号。

### Ads
- **No, my app does not contain ads**

### Content rating（问卷,如实答）
- Category:**Utility / Productivity / Tools**
- 全部"暴力/性/毒品/赌博"等:**No**
- 结果通常为 **Everyone / PEGI 3**

### Target audience
- 目标年龄:**18+**(或 13+),**不**面向儿童 → Designed for Families:**No**

### Data safety（按本 App 实际,如实填）
**Does your app collect or share user data?** → **Yes**

采集的数据类型:
| 数据 | 采集? | 分享给第三方? | 用途 | 说明 |
|---|---|---|---|---|
| **Email address** | 是 | 是* | 账号管理、客服 | 登录/注册用;*反馈表单经 EmailJS(第三方邮件服务)发送你的邮箱与留言 |
| **Device/other IDs**（设备序列号等能源数据） | 是 | 否 | App 功能 | 电量/功率/温度等,存本地 + Solar of Things 平台 |
| **App activity / Analytics** | **否** | 否 | — | App 不含任何第三方分析/广告 SDK(已核实) |
| **Location** | 否 | 否 | — | 蓝牙扫描在 Android 11 及以下需定位权限,但**不采集、不存储、不上传** |

其他:
- 数据传输**加密**(HTTPS):**Yes**
- 用户可**请求删除数据**:**Yes** → 删除方式:App 内 **Settings → 账号 → Delete Account**(已实现,真正调用注销接口)。⚠️ Play 还会要一个"数据删除请求 URL 或邮箱";可填客服邮箱或一个说明页 URL。

### Government apps / Financial / Health
- 均 **No**

### Permissions 声明
- 本 App 未使用敏感权限(无 `MANAGE_EXTERNAL_STORAGE`、无 SMS/通话记录),**无需**权限声明表单。
- 蓝牙(BLUETOOTH_SCAN/CONNECT,neverForLocation)、相机(扫码)、通知均为常规运行时权限,在应用内按需申请。

## 4. 发布版本（Internal testing）
- 测试 → **Internal testing** → Create new release
- 首次会提示启用 **Play App Signing** → **接受**(Google 托管发布密钥,你上传的 keystore 作上传密钥,更安全)
- 上传 `sierro-energy-v<版本>.aab`(Android Release AAB 的 `-signed` 产物)
- Release name 自动取 versionName;填 Release notes(如 `First internal test build.`)
- 添加测试人员邮箱(Testers 列表)→ **Save → Review → Start rollout to Internal testing**
- 生成的测试链接发给测试人员即可安装。

## 5. 上生产前还需
- 完成上面所有 App content 表单(Play 会亮红点提示未完成项)
- 生产轨道需更完整的商店素材与本地化;内部测试可先跳过精修。

---

## 附录 A — Full description（可直接粘贴，按需润色）

```
Sierro Energy is the companion app for your Sierro home battery / portable
power station. Set up a device over Bluetooth, then monitor and control it
from anywhere.

• Live status — battery level, AC / solar input, output power, and
  temperature, refreshed in real time.
• Control — turn output on/off, set AC charging power, and choose Backup or
  Savings battery priority.
• Insights — daily and long-term energy in/out and CO₂ savings.
• Smart Schedule — peak / off-peak charge and discharge windows.
• Alerts — low-battery and device status notifications.
• Wi-Fi setup — pair a new device over Bluetooth and send it your Wi-Fi
  credentials, no cables needed.

Works with Sierro 1000 and Sierro 2000 energy storage systems.
```

## 附录 B — 需你提供/决定的清单
- [ ] Google Play 开发者账号（$25 一次性）
- [ ] 独立的审核测试账号（用户名/密码）—— 勿用主账号
- [ ] 客服邮箱（Data safety 数据删除入口 + 开发者联系方式）
- [ ] 确认默认语言 / 目标市场
- [ ]（生产上架时）更精美的截图与本地化文案
