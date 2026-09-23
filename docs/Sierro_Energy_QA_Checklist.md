# Sierro Energy QA Checklist (R41 redacted)

> Replaces `docs/Sierro_Energy_QA_Checklist.xlsx` which contained plaintext QA credentials.
> Use externally stored QA accounts. **Do not commit passwords.**

Exposed accounts must be **rotated outside the repo**.

## Header
- 平台：iPhone 16 PWA + Android APK (Capacitor)  ｜  账户：使用外部保管的 QA 账号（勿写入仓库） + Guest  ｜  图例：✅通过  ❌失败  ⬜未测  ⚠️回归

## Login / account steps (readable placeholders)
| ID | Step | Expected |
|---|---|---|
| 【2. 登录 / 注册 / 找回密码】 |  /  |  |
| 2.1.1 | Username 标签登录 / Username 标签 → 输入 externally stored QA account credentials → Sign In | 跳转设备页；Toast/状态无报错 |
| 2.1.2 | Email 标签切换 / 点「Email」标签 | 显示 Email + Password 输入框；Username 输入隐藏 |
| 2.1.3 | 验证码登录切换 / 开 With Verification Code Toggle | 密码框隐藏；显示「Obtain Code」按钮 + 验证码输入 |
| 2.1.4 | 错误密码提示 / 输入错误密码 → Sign In | 停留登录页；显示错误文字提示 |
| 2.1.5 | 空字段禁用 / 清空用户名或密码 | Sign In 按钮禁用（灰色不可点） |
| 2.1.6 | 游客入口 / 点「Continue as Guest」 | 进 Demo 模式设备页；显示示例设备 |
| 2.1.7 | Terms / Privacy 链接 / 点登录页底部 Terms / Privacy | 跳转对应页面内容完整 |
| 2.1.8 | 无硬编码测试账号 / 查看源码/网络请求 | 无 benson/localtest 等占位账号（Apple 合规） |
| 2.2.1 | 注册-表单全量校验 / 逐字段提交注册表单 | Account/Email/验证码/密码/确认/协议 全有效才启用Register |
| 2.2.2 | 注册-获取验证码 / 点「Obtain Verification Code」 | 60s 倒计时；按钮在倒计时内禁用 |
| 2.2.3 | 注册-密码规则 / 输入 <6 或 >32 字符密码 | 提示「6–32 characters」；两次不一致提示 Mismatch |
| 2.2.4 | 注册成功跳转 / 填写全部合法信息 → Register | 自动登录 → 跳 /onboarding |
| 2.3.1 | 找回-布局 / 进 /forgot-password | Email 输入框紧接「Send Verification Code」按钮（无多余字段） |
| 2.3.2 | 找回-按钮禁用态 / 输入非法邮箱 | Send 按钮禁用；合法邮箱后启用 |
| 2.3.3 | 找回-iPhone16 视口 / 393×852 下查看 | 两个按钮均在屏幕内，不超出底部 |
| 2.3.4 | 找回-发送成功 / 合法邮箱 → Send | 进第二步（验证码+新密码输入） |
| 2.3.5 | 找回-重置成功 / 填入验证码+新密码 → Reset | 显示「Password reset!」→ 2s 后跳登录页 |
| 2.3.6 | 找回-无 account error / 完成密码重置流程 | 不报「account error」 |
| 2.3.7 | 找回-重发倒计时 / 第二步点「Resend」 | 60s 倒计时正常；结束后可再发 |
| 【3. 设备列表 DevicePage】 |  /  |  |
| 3.1 | 真实设备加载 / QA account 登录后进 /devices | 显示账户名下设备卡片列表 |

## Note
Full multi-sheet checklist is maintained locally as redacted `Sierro_Energy_QA_Checklist.xlsx` (commit d1f6630 on executor). This Markdown preserves login readability for AC-R41-4. SpreadsheetML export also available on the executor for follow-up binary xlsx restore.
