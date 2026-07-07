# Sierro Energy — 自测程序 / 测试用例

发布前逐项自测。**P**=优先级(P0 阻断上架 / P1 核心 / P2 次要)。**平台**:W=Web PWA、A=Android、I=iOS。
自动化列:✅=已被 e2e/单测覆盖,手动=需真机手测。

执行方式:每条按"步骤→预期",实测与预期不符即记为 bug(附现象/截图/logcat)。原生项必须在**真机 APK**上测,Web 项在部署站点测。

---

## 0. 测试环境
| 环境 | 地址 / 来源 |
|---|---|
| Web PWA | https://lujian1324-spec.github.io/energy-app/ |
| Android APK | Actions → Build Android APK → 最新 run 的 artifact(当前 v3.34.2) |
| iOS | 需 Mac + TestFlight(尚未就绪) |
| 账号 | 真实测试账号(勿用主账号);游客模式用 "Continue as Guest" |

---

## 1. 认证 Auth

| ID | 用例 | P | 平台 | 步骤 | 预期 | 自动化 |
|---|---|---|---|---|---|---|
| A-01 | 用户名+密码登录 | P0 | W/A | 用户名 tab,输账号密码,Sign In | 进入 /devices;无超时 | ✅(e2e 真账号组) |
| A-02 | **原生登录不超时** | P0 | A | 同上,在 APK 上 | 秒进,不卡 10s(验证 CapacitorHttp/CORS 修复 v3.34.1) | 手动 |
| A-03 | 邮箱+密码登录 | P1 | W/A | Email tab,邮箱+密码 | 登录成功 | 手动 |
| A-04 | 邮箱验证码登录 | P1 | W/A | Email tab,开 verification code,Obtain Code | 收到**登录**验证码邮件(非注册),输入后登录成功(验证 intent 修复 v3.27.4) | 手动 |
| A-05 | 错误密码 | P1 | W/A | 输错密码 | 停在登录页并提示错误,不崩溃 | ✅ |
| A-06 | 注册 | P1 | W/A | Register,填账号/邮箱/验证码/密码,勾协议 | 注册成功→自动登录/onboarding | 手动 |
| A-07 | 忘记密码 | P2 | W/A | Forgot password,邮箱→验证码→改密 | 流程走通 | ✅(页面加载) |
| A-08 | 游客模式 | P1 | W/A | Continue as Guest | 进入,显示 demo 设备 | ✅ |
| A-09 | 登出 | P1 | W/A | Settings→登出 | 回登录页,token 清除 | ✅ |
| A-10 | 会话保持 | P1 | W/A | 登录后杀进程重开 | 免登录直接进(除非 token 过期) | 手动 |
| A-11 | Token 过期刷新 | P2 | W/A | 长时间后操作 | 自动刷新 token 或干净登出(不white屏) | 手动 |

## 2. 设备列表 Devices

| ID | 用例 | P | 平台 | 步骤 | 预期 | 自动化 |
|---|---|---|---|---|---|---|
| D-01 | 列表渲染 | P0 | W/A | 登录后 | 每台设备卡:名称/型号/电量%/在线徽标 | ✅(demo) |
| D-02 | 多设备电量并发 | P1 | W/A | 有≥2台设备 | 每台各自电量正确(非只更新一台) | 手动 |
| D-03 | 60s 刷新 | P2 | W/A | 停留列表 1 分钟 | 电量自动刷新 | 手动 |
| D-04 | 低电量 banner | P2 | W/A | 有设备<阈值 | 顶部 banner 显示名称/阈值/剩余时间 | ✅(demo) |
| D-05 | 电源开关(透传) | P0 | A | 点设备卡开关 | 乐观切换;成功保持,失败回滚并提示(0x0080 01AA/AA01) | 手动(需真机+设备) |
| D-06 | 设备参数弹窗 | P1 | W/A | 点设备参数入口 | Battery/AC/Solar/Output/Temp + 端口状态 | 手动 |
| D-07 | 点设备进监控 | P1 | W/A | 点设备卡 | 进 /device/:id | ✅ |

## 3. 添加设备 / BLE 配网(原生重点)

| ID | 用例 | P | 平台 | 步骤 | 预期 | 自动化 |
|---|---|---|---|---|---|---|
| B-01 | Add Device 弹窗 | P1 | W/A | 点 + | 4 项:Bluetooth Scan / Wi-Fi Setup / Manual / Scan QR | 手动 |
| B-02 | **Wi-Fi Setup 有反应** | P0 | A | 点 Wi-Fi Setup | 进入配网/蓝牙扫描(非无反应,验证 v3.27.5) | 手动 |
| B-03 | **BLE 权限弹窗** | P0 | A | 首次扫描 | 弹"允许访问附近设备";允许后开始扫描 | 手动(真机) |
| B-04 | **权限被拒引导** | P0 | A | 拒绝权限后再扫 | 出现 Permission Required 屏 + Open Settings + Try Again(验证 v3.34.2) | 手动 |
| B-05 | 蓝牙关闭引导 | P1 | A | 关蓝牙后扫描 | 出现 Bluetooth Off 屏 | 手动 |
| B-06 | 扫描列出设备 | P0 | A | 附近有 SSL_ 设备 | 列表实时出现设备(已添加/未添加都列) | 手动 |
| B-07 | 选设备配 WiFi | P0 | A | 选设备→输 SSID/密码 | AES 加密下发,设备联网成功 | 手动(真机+设备) |
| B-08 | 配网 GATT 断连恢复 | P1 | A | 配网中途 | 自动重连重试,不卡死 | 手动 |
| B-09 | 关配网页停扫描 | P2 | A | 扫描中返回 | LE 扫描停止(不后台空转) | 手动/logcat |
| B-10 | QR 扫码 | P1 | A | Scan QR | 相机开,识别后可 Rescan(相机重新拉流,不冻结,验证 v3.28.0) | 手动 |
| B-11 | 手动添加 | P2 | W/A | Manual Entry | 输设备码可添加 | 手动 |
| B-12 | 选型号自动填参 | P1 | W/A | 添加选 Sierro 1000/2000 | 自动生成序列号 + 默认额定参数 | 手动 |

## 4. Overview 概览(实时链路重点)

| ID | 用例 | P | 平台 | 步骤 | 预期 | 自动化 |
|---|---|---|---|---|---|---|
| O-01 | 页面渲染 | P0 | W/A | 进 /device/:id/dashboard | 电池环/输入输出/温度/控制/图表/告警 | 手动 |
| O-02 | 实时刷新 | P0 | A | 停留页面 | 每 5s 更新(速报优先,不支持则透传回退,验证 v3.29.0) | 手动 |
| O-03 | **离线不冻结** | P0 | A | 设备断网 | 显示 Disconnected + "-",不再冻结旧读数显示 Connected(验证 v3.32.0 回归修复) | 手动 |
| O-04 | 速报会话回收 | P1 | A | 进页秒退/切设备 | 不遗留高频上报(验证 v3.32.0) | 手动/后端观察 |
| O-05 | 下拉刷新 | P1 | A | 下拉 | 触觉反馈 + 刷新 AC/Solar/Output/在线态 | 手动 |
| O-06 | 后台不空转 | P2 | A | 切到后台 | 轮询暂停(可见性门控 v3.28.0) | 手动/logcat |
| O-07 | Sleep Mode 控制 | P1 | A | 切 Sleep Mode | 透传 0x0085(1000:150/400W;2000:300/800W) | 手动(真机) |
| O-08 | Backup/Saving 控制 | P1 | A | 切 workMode | 透传 0x0086(Savings=01AA / Backup=AA01) | 手动(真机) |
| O-09 | 端口开关 | P1 | A | AC1/AC2/USB | 状态切换生效 | 手动 |
| O-10 | 实时功率图 | P1 | W/A | 看图表 | 当日历史曲线 + 右上实时徽标;缩放/平移 | 手动 |
| O-11 | 电池时间估算 | P2 | W/A | 看剩余/充满时间 | 用真实容量算,数值合理(非明显错误) | 手动 |

## 5. Device Info / Insights / Smart Schedule / Notifications

| ID | 用例 | P | 平台 | 步骤 | 预期 | 自动化 |
|---|---|---|---|---|---|---|
| DI-01 | Device Info 展示 | P1 | W/A | 进 /device/:id/settings | 型号/序列号/额定容量/功率/电压/循环/温度/固件 | 手动 |
| DI-02 | 手动选型号 | P1 | W/A | 点 Model | 弹型号面板,选后更新参数 | 手动 |
| DI-03 | Sleep 编辑 | P2 | W/A | 编辑 sleepFrom/To | 保存,英文文案(无中文,验证 v3.27.1) | 手动 |
| DI-04 | 删除设备 | P1 | W/A | 删除对话框 | 确认后删除 | 手动 |
| IN-01 | Insights 加载 | P1 | W/A | 进 /insights | 天数/CO₂/输入输出图 | ✅(加载) |
| IN-02 | 真实用户错误态 | P1 | A | 历史 API 失败 | 显示错误/重试,**不静默展示假数据**(⚠ 待修 U-1,见 RELEASE_PLAN) | 手动 |
| IN-03 | 周期切换 | P2 | W/A | Day/Week/Month/Range | 图表切换正确 | 手动 |
| SS-01 | Smart Schedule | P1 | W/A | 进 /smart-schedule | 时钟盘/时段/价格/参数/预估节省 | ✅(加载) |
| SS-02 | 配置落库 | P1 | A | 改参数保存 | 存到后端 peakValley(非仅本地) | 手动 |
| N-01 | 通知中心 | P1 | W/A | 进 /notifications | Active + History,告警文案可读(非原始码) | ✅(加载) |
| N-02 | 忽略告警 | P2 | W/A | dismiss | 标记已处理 | 手动 |

## 6. Settings / 数据 / 账号

| ID | 用例 | P | 平台 | 步骤 | 预期 | 自动化 |
|---|---|---|---|---|---|---|
| S-01 | Settings 加载 | P1 | W/A | 进 /setting | Profile/推送(见 S-02)/反馈/版本 | ✅ |
| S-02 | **推送区隐藏** | P0 | W/A | 看 Settings | 无 Push Notifications 区(PUSH_ENABLED=false,验证 v3.34.0) | 手动 |
| S-03 | 版本号 | P2 | W/A | 底部 | 显示 Sierro App v3.34.2 | 手动 |
| S-04 | 反馈提交 | P2 | W/A | Feedback | EmailJS 发送成功 | 手动 |
| S-05 | **删除账号真删** | P0 | W/A | Profile→Delete Account→确认 | 调 deleteAccount API(loading→成功→登出),非仅登出(验证 v3.31.0) | 手动 |
| S-06 | 数据导出 | P2 | W/A | Data Export→JSON/CSV | 下载文件,版本号正确 | 手动 |
| S-07 | 隐私/条款链接 | P1 | W/A | 点链接 | 打开 Privacy/Terms 页 | ✅ |
| S-08 | 无虚假分析开关 | P1 | W/A | Data Export | 无 "Anonymous Analytics" 空开关(验证 v3.32.0) | 手动 |

## 7. 原生适配(Android 重点,验证 v3.30.0)

| ID | 用例 | P | 平台 | 步骤 | 预期 | 自动化 |
|---|---|---|---|---|---|---|
| NA-01 | 图标/启动图 | P0 | A/I | 装 App 看桌面/启动 | SIERRO 字标图标 + 白底启动图(非 Capacitor 占位) | 手动 |
| NA-02 | 系统返回键 | P0 | A | 内页按返回 | 回上一页;根页返回则最小化 App(不直接退出) | 手动 |
| NA-03 | 状态栏 | P1 | A | 各页面 | 深色栏浅色图标,不被内容顶穿 | 手动 |
| NA-04 | 键盘不遮挡 | P1 | A | 登录/配网输入 | 键盘弹出,输入框可见 | 手动 |
| NA-05 | 触觉反馈 | P2 | A | 开关/下拉刷新 | 轻/中震动 | 手动 |
| NA-06 | 点击无灰闪 | P2 | A | 点各按钮 | 无灰色高亮方块 | 手动 |
| NA-07 | 无启动白屏 | P2 | A | 冷启动 | 白底启动图(品牌),非突兀闪白到深色 | 手动 |
| NA-08 | 大字体 | P2 | A | 系统字体调大 | 卡片文字不溢出/截断异常 | 手动 |

## 8. PWA / 通用

| ID | 用例 | P | 平台 | 步骤 | 预期 | 自动化 |
|---|---|---|---|---|---|---|
| P-01 | 无 404 资源 | P1 | W | 加载 | JS/CSS 无 404 | ✅ |
| P-02 | 非空白渲染 | P0 | W | 加载 | 根节点有内容 | ✅ |
| P-03 | 无致命 JS 错误 | P0 | W | 启动 | 控制台无 fatal | ✅ |
| P-04 | SW 更新 | P2 | W | 发新版后重开 | 自动加载新版本(不卡旧缓存) | 手动 |
| P-05 | 页面切换动画 | P2 | W/A | 各页跳转 | 无闪烁 | 手动 |

## 9. 上架就绪检查(Play/App Store)

| ID | 用例 | P | 步骤 | 预期 |
|---|---|---|---|---|
| R-01 | 调试页隐藏 | P0 | 发布版找 Modbus/Debug/BLE Debug 入口 | 均不可达(DEV_TOOLS_ENABLED=false,验证 v3.31.0) |
| R-02 | 签名 AAB | P0 | 跑 Android Release AAB(填 secret 后) | 产出 signed .aab |
| R-03 | Data safety 一致 | P0 | 对照 docs/PLAY_SUBMISSION.md | 申报与实际数据流一致 |
| R-04 | 隐私政策可达 | P0 | 打开政策 URL | 页面正常 |
| R-05 | 商店素材 | P1 | 图标/特色图/截图 | 齐全(play-assets/) |

---

## 10. 回归清单(每个已修 bug → 一条验证)
逐条确认修复未回退:
- [ ] CRC 校验:损坏透传帧不显示假数据(v3.27.6)→ 单测覆盖
- [ ] 0x0133 状态机枚举解码(v3.27.6)→ 单测覆盖
- [ ] livePt 失效清除 / 离线不冻结(v3.27.6 / v3.32.0)→ O-03
- [ ] 速报会话不遗留(v3.32.0)→ O-04
- [ ] 登录验证码 intent(v3.27.4)→ A-04
- [ ] APK 蓝牙插件注册(v3.27.2)→ B-03
- [ ] Wi-Fi Setup 有反应(v3.27.5)→ B-02
- [ ] BLE 权限引导(v3.34.2)→ B-04
- [ ] 原生登录超时(v3.34.1)→ A-02
- [ ] 删除账号真删(v3.31.0)→ S-05
- [ ] 推送裁剪(v3.34.0)→ S-02
- [ ] 隐私一致 / 无空分析开关(v3.32.0)→ S-08
- [ ] 图标/启动图(v3.33.0)→ NA-01
- [ ] typecheck 42 错清零(v3.28.0)→ CI tsc
- [ ] API 5xx/超时重试 + 401 刷新(v3.28.0)→ 单测/手动
- [ ] QR Rescan 不冻结(v3.28.0)→ B-10

---

## 11. 自动化覆盖现状(全部可在 CLI 运行)
- **单元 + 接口契约**(`src/**/*.test.ts`,Vitest,`npm run test:unit`,**60 项**):
  - 纯逻辑:Modbus CRC/解码/0x0133 枚举、电池时间、isApiSuccess、速报探测。
  - **全接口契约**(`src/api/api-contract.test.ts`,38 项):mock 传输层,逐个断言
    77 个 API 函数的端点/payload/字段约定(deviceId String、密码 md5、captchaId、
    邮箱验证码 `address` 字段、国家码去 `+`、无 userId 规则、透传 hex→base64 等)。
- **e2e**(`tests/e2e.spec.ts`,Playwright,CI 构建后跑):认证/导航/游客/PWA 健康,25 项。
- **真实后端冒烟**(`scripts/api-smoke.mjs`,`E2E_USER=x E2E_PASS=y npm run test:api:live`):
  在**联网机器**上真连后端,走 登录→用户信息→设备列表→设备状态,逐步 PASS/FAIL。
  (沙箱/CI 出网受限时会 403,属正常;在本地/有网环境运行。)
- **未自动化(必须真机手测)**:BLE/配网、透传控制、原生权限/返回键/触觉、真实设备实时数据、推送。

### CLI 命令速查
```
npm run test:unit                                  # 单元 + 接口契约(mock,秒级)
E2E_USER=账号 E2E_PASS=密码 npm run test:api:live   # 真连后端冒烟(需联网)
npm run test:e2e                                   # Playwright e2e(需浏览器)
npm run typecheck                                  # tsc 类型检查
```

> 建议节奏:每次改动 → CI e2e + 单测自动跑(拦回归)→ 发版前按本文档手动过一遍 P0/P1(尤其原生真机项)。
