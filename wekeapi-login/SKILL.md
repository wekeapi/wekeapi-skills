---
name: wekeapi-login
description: wekeapi CLI login 模块：微信扫码登录、登录状态轮询、在线状态检查、免扫码快捷登录（调用后必须提示用户在手机上点确认登录）、退出登录，以及登录成功后的数据服务接管（自动写 wekeapi-msg-sync.json 并确保 wekeapi-msg-sync 运行：已运行且凭证无变化时不重复启动，配置数据库与端口，并按用户选择是否接收消息决定是否提醒把 callback 映射到公网、在 wekeapi 管理后台绑定回调地址）。当用户要求登录微信、获取登录二维码、检查微信在线状态、掉线重连、免扫码快捷登录、退出微信登录或同步微信数据时使用。
---

# login 登录

## 前置

- 二进制复用 wekeapi-core skill 的 `assets/bin/`（相对该 skill 目录解析，不要写死 skills 根目录），按 OS/架构选择（Windows x64: `wekeapi-windows-amd64.exe` / Windows ARM64: `wekeapi-windows-arm64.exe` / Linux x64: `wekeapi-linux-amd64` / Linux ARM64: `wekeapi-linux-arm64` / macOS Intel: `wekeapi-darwin-amd64` / macOS ARM: `wekeapi-darwin-arm64`），下文以 `$WEKEAPI` 代指；`PATH` 中已有 `wekeapi` 时优先用 `wekeapi`，定位与兜底见 wekeapi-core「二进制」。
- 调用需 `--token`；除 `login qr` 外需 `--app-id`（运行 `wekeapi init` 保存到 `~/.wekeapi/config.json` 后可免传，显式 flag 优先）。
- stdout 恒为 JSON；退出码 0 成功 / 1 API 业务错误 / 2 本地错误。
- 其余全局约定（--data 透传、--timeout 等）见 wekeapi-core skill。

## 登录前置条件

### 首次登录 

用户必须已经持有 AccessToken 和 账号额度，缺少任一项，提醒用户到 wekeapi官网 https://www.wekeapi.com 获取。在官网注册登录后，可创建 AccessToken；账号额度通过获取服务套餐得到，新用户可以领取 15 天免费体验包，含1个账号额度。

## 使用中遇到账号限额不足

登录类调用（`login qr` / `login quick` / `login status`）返回 `code=-20`（message 含「账号限额已用完」）时：

- **立即停止登录编排**：不要重试、不要重取二维码、不要换设备类型/验证方式/代理方式或 `--new-device` 再试，也不要当成网络或风控问题继续排查。
- **必须向用户明确说明**：当前 AccessToken 所属账号的额度已用完；请打开官网（`$WEKEAPI env` 输出的 `siteURL`）登录后台，**获取服务套餐（新人可领取 15 天免费体验包）**，额度恢复后重新执行登录即可（凭证已保存在 `~/.wekeapi/config.json`，无需重新 `init`）。
- 不要建议用户借用他人 token 规避限额，也不要继续轮询等待；报告后可询问用户是否已处理完毕再重试登录。

## 轮询规范

`login check` 需要反复调用直到出结果：

- `0`（未扫码）/ `1`（已扫码）都继续下一轮
- `10`（本次登录需验证）登录时选手动验证：提醒用户使用专用扫码验证工具；登录时选自动验证：提醒用户等待验证完成；然后继续下一轮
- `11`（待手机确认）提醒用户在手机微信上确认，然后继续下一轮
- `2`（已登录）/ `3`（失败，包括二维码超时（约 3 分半，约 42 轮））登录终止，可结束轮询。

harness 不便多次调用工具时，可用一条 shell 循环命令跑完整轮询（每 5 秒一轮，出终态即 break）：

PowerShell（Windows）：

```powershell
$WEKEAPI='<二进制绝对路径>'; $u='<qrCodeUUID>'; $a='<appId>'; for($i=1;$i -le 42;$i++){ $o = & "$WEKEAPI" login check --token <TOKEN> --app-id $a --qr-code-uuid $u; $o; $j = $o | ConvertFrom-Json; $s = $j.data.status; if($null -eq $s -or $s -eq 2 -or $s -eq 3 -or $s -eq 10){ break }; Start-Sleep -Seconds 5 }
```

bash/zsh：

```bash
WEKEAPI='<二进制绝对路径>'; u='<qrCodeUUID>'; a='<appId>'; for i in $(seq 1 42); do o=$("$WEKEAPI" login check --token <TOKEN> --app-id "$a" --qr-code-uuid "$u"); echo "$o"; s=$(printf '%s' "$o" | grep -o '"status":[-0-9]*' | head -1 | cut -d: -f2); case "$s" in 2|3|10) break;; esac; sleep 5; done
```

- 循环命令较长或引号易被 shell 剥离时，先写入临时脚本（`watch-login.ps1` / `watch-login.sh`）再执行。
- 执行时把工具超时调大（约 5 分钟）；被转后台时直接读终端输出，不必重新取码。
- 超时后仍为 `0`/`1` 视为二维码过期，用同一 `--app-id` 重取（「取码 → 轮询」最多重试 2 次），2.1 已确认的登录参数沿用不重问。
- 按状态变化（已扫码 / 需验证 / 待确认）或终态向用户汇报，不必每轮都回。

## 登录编排（按序执行：状态检查 → 免扫码重登 → 扫码登录 → 数据同步服务接管）

### 第零步：读取配置与在线状态检查（每次触发微信操作先走这步）

1. 读取 `~/.wekeapi/config.json`（`init` 保存的 token/appId；旧版 `~/.wekeapi.json` 会被自动兼容读取）：
   - 有 token：免传凭证，继续下一步。
   - **无 token：必须中断流程，用 `AskUserQuestion` 弹框向用户索要 AccessToken，等用户在弹框里提供后再继续；拿到 token 之前不得执行任何后续步骤（不得取二维码、不得探测在线状态等）。** 弹框选项：「粘贴 AccessToken（选 `Other` 输入）」/「还没有，去官网申请」；用户选后者时展示 `$WEKEAPI env` 输出的 `siteURL`，申请完成后再次弹框收集。**禁止在回复里让用户在聊天框打字回复 token。** 拿到后执行 `wekeapi init --token <TOKEN>` 保存（自动化场景带 flag；API 地址编译期内置，无需收集 baseUrl）。
2. 已有 appId 时先检查在线状态，**不要直接扫码**：`$WEKEAPI login status --token T --app-id A`
   - 返回 1（在线）：CLI 已自动把 wxid/appId 写入配置，并把最新凭证写入 `wekeapi-msg-sync.json`，确保数据同步服务按最新凭证运行（配置未变化且服务已在运行时不会重启）；直接执行用户操作，登录编排结束。
   - 返回 -1（离线）：**先尝试重连，不要直接跳到登录**：`$WEKEAPI login status --token T --app-id A --auto-connect`（平台会尝试重连并返回重连后的状态，可能耗时数十秒，先告知用户正在重连）。重连后为 1 → 按上一行的在线流程处理，登录编排结束；仍为 -1 → 再进入第一步免扫码快捷登录。
   - 返回 0（未登录，如主动退出）：重连无意义，直接进入第一步免扫码快捷登录。
   - 返回 `-20`（账号限额已用完）：按「账号限额（`-20`）处理」提示用户到官网领取 15 天免费体验或购买套餐，终止登录流程，不要重试。
3. 无 appId（首次使用或配置被清空）：**必须中断流程，向用户询问并等待明确答复，二者其一确定后才可进入第二步扫码登录**：
   - 用户提供已有 appId → 用该 appId（可 `wekeapi init --app-id <APPID>` 保存）继续；
   - 用户没有 appId 或选择「使用新设备」→ 视为新设备登录（`login qr` 用 `--new-device`，首次不传 `--app-id` 由系统自动生成），进入第二步扫码登录。

### 第一步：免扫码快速登录（离线重连失败或未登录时）

1. `$WEKEAPI login quick --token T --app-id A`：免扫码快捷登录，成功返回新的 `qrCodeUUID`。
   - **必须立即提示用户到手机确认（高优先级）**：`login quick` 成功返回后，**在下一次回复的第一句用醒目文字提示用户**「已向你的微信推送登录确认，请现在打开手机微信，在弹出页点击「确认登录」，否则确认超时会失败」；不得静默直接轮询让用户不知道要做什么。
   - 提示同时告知：确认有效期有限，超时未点确认则本次快捷登录失败（会转扫码登录）；手机没有收到弹窗时可改用扫码登录（第二步）。
   - 提示发出后再开始轮询；轮询超过约 30 秒仍未见用户确认（status 仍为 0/11）时，再提醒一次用户点手机上的确认，不要每 5 秒刷屏。
2. 用返回的 `qrCodeUUID` 轮询 `$WEKEAPI login check --token T --app-id A --qr-code-uuid U`（见「轮询规范」）：
   - status=0/1（未点确定）：**提示用户在手机上点击「确认登录」**，继续轮询。
   - status=2 → 登录成功：CLI 自动记录 appId/wxid，并把凭证同步到 `wekeapi-msg-sync.json`、确保数据同步服务运行（已运行且凭证无变化时不重启）→ 确认服务就绪后执行用户操作。
   - status 3：报错终止，用户取消登录 或 登录超时。
   - `login quick` 返回 -24（新设备登录后掉线、风控下线等被动退出不支持 quick），当前无法扫码登录 → 转第二步扫码登录。
   - 返回`-20`（账号限额已用完）：**不要转扫码登录**，按「账号限额（`-20`）处理」提示用户到官网获取服务套餐（新人可领取 15 天免费体验包）
3. config 已有 appId 时：离线先按第零步重连，重连无效或状态为未登录（0）再用 quick；仅当 quick 返回 -24 或轮询超时/失败，才转第二步扫码登录。

### 第二步：扫码登录（无 appId 或快速登录失败时）

#### 2.1 收集登录参数（缺一不可，向用户逐项确认后才能进入 2.2）

> 本节所有问题（登录平台、验证方式、代理方式、代理 ID/Url、省市选择）一律用 `AskUserQuestion` 弹框按序收集（见 wekeapi-core「交互输入规范」），不要在聊天框里让用户输入；互不依赖的问题（如登录平台）可放同一弹框，有前后依赖的分开弹。

1. 登录平台 `--device-type`：`Mac` / `iPad`，二选一，必须弹框询问。
2. 自动验证 `--verify-type`（仅平台为 Mac 时询问）：`auto` / `manual`；平台为 iPad 时不询问，固定 `manual`（iPad 不支持自动验证）。用户选`manual`是提醒可能需要扫码验证，请用户提前准备好专用扫码验证工具（联系客服 weke_820528 获取）；选完后记下本次值，后续验证提醒按它区分（见 2.2）。
3. 代理模式 `--proxy-type`：`local`（本地代理）/ `self`（自有代理）/ `platform`（平台代理），三选一，必须弹框询问，**优先推荐 local（本地代理）**——向用户展示选项时把 local 放首位并标注「推荐」，仅当用户明确选择其他方式或 local 不可用（无法安装本地代理工具）时才用 self/platform；并按所选模式收集 `--proxy-info`：
   - local：本地代理 ID（形如 `pzqn-xxxx-xxxx`，CLI 无命令可查询）需用户安装官方本地代理工具并运行后才能拿到。运行 `$WEKEAPI env`，从 `proxyDownloads` 取当前环境对应平台（按用户操作系统匹配）的 `url` 展示给用户（Linux 直接展示 `note` 中的安装命令）；不要试图替用户安装，留给用户手动安装；待用户下载并运行工具取得代理 ID 后再弹框向其索要（选 `Other` 粘贴）。
   - self：弹框向用户索要代理 Url（http(s) 地址，选 `Other` 粘贴）。
   - platform：按「用户选择微信常用地 → 匹配城市代码 → 检测可用性 → 用城市码取二维码」流程执行（详见 wekeapi-proxy skill「平台代理选择流程」）：
     1. 采集省市：**让用户选择**，提醒文案用「选择微信常用地」，并向用户说明微信常用地通常指长期居住地或手机号归属地。两步采集、不可跳过：先 `$WEKEAPI proxy provinces` 取省份列表展示选项（选项展示不完整时提示用户手动输入省名）；**选完省后必须继续选该省对应的市**——`$WEKEAPI proxy cities --province <所选省>` 取该省城市列表展示选项（选项展示不完整时提示用户手动输入市名）。
     2. 匹配城市代码：`$WEKEAPI proxy cities --province <所选省>` 与所选市名（去掉"省/市"后缀）精确匹配取 `data[0].code`；城市不在对照表（如 上海）→ 提示切换代理方式或手选其他城市。
     3. 检测可用性：`$WEKEAPI proxy check-city --token T --app-id A --city-code <code>`（配置无 appId 时改用 `--app-id=` 传空 appId，实测结果一致），按 `data` 分支：
        - `data=true`：该城市有可用代理 → 用该城市代码作为 `--proxy-info` 进入 2.2 获取二维码。
        - `data=false`：**提示用户当前所在城市没有可用代理，请切换其他代理方式（local/self），终止 platform 流程**。
   - 用户消息中已明确的信息直接采用，不重复询问；只补问缺失项。

#### 2.2 获取二维码并轮询（仅当 2.1 三项信息全部齐备）

1. `$WEKEAPI login qr --token T --device-type <Mac|iPad> --verify-type <auto|manual> --proxy-type <local|self|platform> --proxy-info <代理ID|代理Url|城市代码> --out qr.jpg`
   - 无 appId（用户选择「使用新设备」）时按全新设备取码（`--new-device`，或首次不传 `--app-id` 由系统自动生成）；配置中已有 appId 时默认复用它（读配置），确需按全新设备取二维码用 `--new-device`。**必须记录返回 JSON 中的 `appId` 与 `qrCodeUUID`**。
   - **`login qr` 不保存 appId 到配置**：appId 只在登录成功（`login check` 返回 status=2）后才自动保存到 `~/.wekeapi/config.json`（stderr 有提示）。
   - 登录成功前的所有调用（`login check` 轮询、二维码超时后重新 `login qr`）必须显式传同一 `--app-id`（首次登录用 qr 返回的 appId），否则会被当作新设备重新生成 appId，容易触发风控。
   - 设备类型绑定在 appId 上：携带已有 appId 再取二维码时，`--device-type` 不改变设备类型（手机弹窗仍显示 appId 首次生成时的设备类型）。要更换设备类型必须按全新设备登录：配置中已有 appId 时用 **`--new-device`**（等价于显式空值 `--app-id=`），视为新设备登录、有风控风险，先向用户确认。**不要写 `--app-id ""`**：Windows PowerShell 5.1 会丢弃空字符串参数，导致 `--app-id` 吞掉后一个 flag（如 `--out`）并把垃圾值发给服务端报 `-50 服务异常`。
   - `login qr` 返回 `code=-20`（账号限额已用完）：**不展示二维码、不轮询**，按「账号限额（`-20`）处理」提示用户到官网获取服务套餐（新人可领取 15 天免费体验包）后终止。
   - **展示二维码必须最快完成（高优先级）**：`login qr` 命令返回后，必须在**下一次回复中立即**用 markdown 图片语法展示二维码（`![qr](file:///qr.jpg绝对路径)`），让用户在聊天中直接看到并扫码；禁止任何中间步骤——不得加载其他 skill、不得渲染 widget、不得先做任何其他工具调用或解释；展示二维码之前不要启动轮询。
2. 每 5 秒轮询：`$WEKEAPI login check --token T --app-id A --qr-code-uuid U`（见「轮询规范」）
   - `data.status`：0 未扫码 / 1 已扫码 / 2 已登录 / 3 失败 / 10 需验证 / 11 待手机点确认。
   - status 2：停止轮询，appId 已保存到配置，CLI 自动补调一次在线状态检测记录 wxid，并把最新凭证同步到 `wekeapi-msg-sync.json`、确保数据同步服务运行（已运行且凭证无变化时不重启）→ 确认服务就绪后执行用户操作。
   - status 3：报错终止；若本次是自动验证（`auto`）失败，按「注意」改用 `--verify-type manual` 重新取码，不再重试 auto。
   - status 10（触发身份验证）：**按本次登录用的验证方式提醒**，不要一律照搬手动验证的说法：
     - `--verify-type auto`：提示「平台正在自动完成身份验证，请稍候，无需手动扫码」，继续轮询；若最终失败（status 3），再告知改用 `manual` + 专用扫码验证工具重新取码。
     - `--verify-type manual`（含 iPad 固定 manual）：接口返回验证二维码，需账号持有人用专用扫码验证工具（联系客服 weke_820528 准备）扫码完成验证，提示用户。
   - status 11（自动验证已通过）：提示用户到手机微信点「确认登录」，继续轮询。

## 第三节：登录成功后的数据服务接管（固定步骤，任何登录路径成功后必经）

- 触发时机：扫码登录或快捷登录轮询到 status=2 后、执行用户原操作之前，必须先完成数据服务接管，**并走完 3.1-3.5（数据库/端口配置 + 是否接收消息 + 按需公网回调提醒）**；其中 3.1 的数据库/端口弹框**同一会话内只做一次**，之后沿用首次确认的配置。
- CLI 已自动完成，**无需再执行旧的 `sync all`**：
  1. 把主配置中的 `token`/`appId`/`baseURL`/`wxid` 写入服务目录的 `wekeapi-msg-sync.json`；
  2. 先检测服务是否已在运行：**已运行且凭证（token/appId/wxid/baseURL）无变化时保持不动，不重复启动/不重启**（避免打断进行中的全量同步）；未运行或凭证有变化时才启动/重启（首次启动按默认配置：SQLite `wekeapi_msg_sync.db`、端口 `3006`）；需要重新全量同步时显式执行 `$WEKEAPI data sync`；
  3. 服务启动后立即执行一次全量同步（标签/好友/群组/公众号/企微好友）；之后的变更依赖消息回调增量更新（新消息、好友/群变更、撤回等），服务不再做定时同步。
- 服务目录查找顺序：全局参数 `--msg-sync-dir`（所有命令可传）> 环境变量 `WEKEAPI_MSG_SYNC_HOME` > `~/.wekeapi/config.json` 的 `msgSyncDir`（`init --msg-sync-dir` 可设置）> 默认 `~/.wekeapi/msg-sync`；配置 `wekeapi-msg-sync.json`、日志 `wekeapi-msg-sync.log`、PID 与 SQLite 数据库都在该目录。
- 登录命令的 stdout 仍是登录接口 JSON；服务启动进度与结果提示走 stderr（前缀 `[msg-sync]`）。若启动失败（如找不到服务可执行文件），登录仍算成功，但需向用户报告警告并检查服务目录。

### 3.1 数据服务配置（同一会话只询问一次）

会话内**第一次**登录成功时用 `AskUserQuestion` 弹框收集数据库与服务端口，确认后用 `data config` 写入、`data sync` 重启生效。**同一会话内后续再登录、服务重启都直接沿用这次的结果，不再弹框、也不再重复执行 `data config`**；只有用户主动提出改数据库/改端口时才重新询问。

先查看当前配置（不带修改参数时**只读、不写文件**）：

```bash
$WEKEAPI data config
```

- 输出 `data.db`（sqlite/mysql）、`data.db_path`/`data.dsn`（DSN 已脱敏）、`data.port`。
- 已是用户确认过的配置（MySQL、非默认端口等）视为已确认，直接沿用、不再询问。
- 会话内已问过一次（无论选了什么）就记住类型/DSN/端口，后续直接复用；已写入的配置在登录成功自动启动服务时自动生效，无需每条登录路径重做。
- 不要替用户决定数据库类型。

**弹框 1：数据库类型（仅会话内首次询问；二选一，本框只问类型，不附带 URI/端口）**

| 选项 | 选定后的下一步 |
|---|---|
| `SQLite`（推荐，零部署，单机够用） | 直接进入弹框 2 问服务端口；**文件名固定默认 `wekeapi_msg_sync.db`（服务目录 `~/.wekeapi/msg-sync`），不再追问文件名** |
| `MySQL`（多端共享/已有 MySQL） | 弹框 2 先收集 MySQL 连接 URI，拿到后弹框 3 问服务端口 |

**弹框 2（仅会话内首次询问；根据上一框分支，不得合并或跳过）**

- 选 `MySQL`：弹框收集 **MySQL 连接 URI**（自由文本，选项「粘贴连接串（选 `Other`）」），问题描述里给示例：`mysql://user:pass@127.0.0.1:3306/dbname?charset=utf8mb4`；也接受 `user:pass@tcp(127.0.0.1:3306)/dbname?charset=utf8mb4`、`jdbc:mysql://...`（服务自动剥离 `jdbc:` 前缀、转换 JDBC 参数）。库不存在时服务启动会**自动创建**（utf8mb4）并自动建表，账号需有 CREATE 权限；无建库权限时再提示用户手工建库。**拿到 URI 后再弹框 3 问端口。**
- 选 `SQLite`：**直接弹框问服务端口**（不进 URI 环节，也不问文件名）。

**弹框 3：服务端口（仅会话内首次询问）**

- 默认 `3006`（选项给 `3006（默认）`）+ `Other` 自定义 1-65535 端口。端口被占用时服务启动会失败（日志见 `~/.wekeapi/msg-sync/wekeapi-msg-sync.log`），换端口重试即可。

### 3.2 写入配置并重启生效（仅会话内首次确认后执行）

```bash
# SQLite：只传端口，文件名保留默认 wekeapi_msg_sync.db（不必也不传 --db-path）
$WEKEAPI data config --db sqlite --port <端口>
# MySQL：连接串含特殊字符，PowerShell 用单引号包裹
$WEKEAPI data config --db mysql --db-dsn '<连接 URI>' --port <端口>
# 重启服务使配置生效（重启后自动全量同步）
$WEKEAPI data sync
```

- `data config` 只改数据库与端口，保留 token/appId/wxid 等字段；输出 `data.changed` 表示配置是否变化，`data.needRestart=true` 表示运行中的服务仍用旧配置。
- 本步只需在会话内首次确认配置后执行一次；之后登录成功时 CLI 会直接按已写入的配置启动/复用服务，无需重复调用。
- **切换数据库类型不迁移旧数据**：换成 MySQL 后需等重新全量同步完成；旧 SQLite 文件保留在 `~/.wekeapi/msg-sync`，可提示用户自行清理。
- Windows PowerShell 下连接串用单引号（`--db-dsn '...'`），避免 `$`/`@`/`&` 被解释；**不要写 `--db-dsn ""`**。
- 用户拒绝调整（明确表示用默认值）时，也至少确认一次端口，再按默认值跳过写入。

### 3.3 确认就绪

- 确认服务就绪：`$WEKEAPI data status`（返回 `data.status` 为 `idle`/`syncing`/`error`，并给出 `contacts_count`/`rooms_count`/`messages_count`；首次同步完成前可能为 `syncing`）。
- 平台还在同步通讯录时（错误码 `-43 通讯录同步进行中`），服务会自动等待重试（30 次 × 15 秒，约 7.5 分钟），通讯录人多时 `syncing` 持续几分钟属正常，不要提前判定失败。
- 后续查询数据用 `$WEKEAPI data contacts/messages/rooms`（见 wekeapi-core skill），不要再用 sqlite3 查本地数据库；服务未运行时可 `$WEKEAPI data start`，需要重新全量同步时用 `$WEKEAPI data sync`（等价 `data restart`）。
- 同步完成（或失败已报告）后，继续执行 3.4（询问是否接收消息）与 3.5（按需回调提醒），再继续用户原操作。

### 3.4 询问是否接收消息（服务启动/重启后必问，不可跳过）

msg-sync 启动后（登录成功自动启动、`data start`、`data sync` 重启都算）**先用 `AskUserQuestion` 弹一次框**，问用户是否需要接收微信消息：

| 选项 | 后续动作 |
|---|---|
| `接收消息（实时收消息、好友/群变更回调）`（推荐） | 继续执行 3.5：把 callback 映射到公网，并在 wekeapi 管理后台绑定回调地址 |
| `不接收消息（仅同步通讯录等数据）` | **直接启动/保持服务运行，跳过 3.5**：不再要求映射公网、不再提醒后台配置 |

- 弹框答案即用户确认，一次问清；选「不接收消息」后**不要反复提醒回调配置**，也不要去改控制台。
- 选「不接收消息」时说明一句影响即可：新消息、好友/群变更不会实时入库，`data messages` 只有全量同步时点之前的数据和本机 CLI 发送后主动上报的消息；之后想开启随时可按 3.5 补配。
- 用户后续提出「接收微信消息 / 自动回复 / 实时监听消息」等需求时，直接按 3.5 引导配置（不必重启服务）。

### 3.5 公网回调映射与后台绑定（仅当用户选择接收消息时）

用户已确认需要接收消息；数据同步依赖 wekeapi 平台的**消息回调**，而 msg-sync 服务只被动接收回调，**不会自动向平台注册回调地址**。此时必须主动提醒用户完成两步：

1. **把本地 callback 接口映射到公网**：服务只监听本机 `http://127.0.0.1:<端口>/callback`（`POST`，端口即 `data config` 里设置的服务端口，默认 `3006`）。用公网 IP 端口映射/反向代理、云服务器安全组放行，或 frp/ngrok 等内网穿透，把它暴露为 `http(s)://<公网地址>/callback`。
2. **到 wekeapi 管理后台绑定回调地址**：打开 `$WEKEAPI env` 输出的 `siteURL` 登录后台，找到本机 AccessToken（`~/.wekeapi/config.json` 的 `token`）的回调地址设置，填上面那个公网 `/callback` 地址并保存。要求：以 `http://` 或 `https://` 开头、长度≤ `1024` 字符、路径必须是 `/callback`、端口与当前服务端口一致。

- **必须告知不配置的后果**：回调不通时新消息不会实时入库，新好友/群变更/撤回等事件会滞后，也不会自动补齐（服务只在启动/重启时全量同步一次，可用 `data sync` 重新全量）。
- **可达性自查（告诉用户可自行验证）**：`curl.exe -X POST <公网地址>/callback -d '{}'` 返回 `400`（参数非法）说明公网已通；`curl.exe <公网地址>/healthz` 返回健康信息说明端口映射正常（仅转发了 `/callback` 路径时用前一个）。
- 后台配置只能由用户操作，**不要替用户去改**；用户确认已配置就继续后续操作，未配置也要说明影响后继续（登录与同步不阻塞）。
- 只提醒一次，不要每次 `data status` 重复；但改了服务端口（`data config --port`）或换了 AccessToken 后，必须重新提醒同步修改回调地址。
- 3.4 选了「不接收消息」的用户，后续改端口/换 token 也无需提醒回调配置，除非用户改口要接收消息。

## 命令表

| 命令 | 说明 | 参数 |
|---|---|---|
| `login qr` | 获取登录二维码 | **`--device-type`** Mac/iPad、**`--verify-type`** manual/auto、**`--proxy-type`** local/self/platform、**`--proxy-info`**（local 传代理ID，需用户安装本地代理工具获取，下载链接见 2.1 / self 传代理Url / platform 传城市代码，须经用户选择微信常用地与可用性检测，流程见 2.1 与 wekeapi-proxy skill）；`--new-device` 按全新设备取码（忽略配置 appId，等价 `--app-id=`）；`--out` 保存二维码图片 |
| `login check` | 轮询检测登录状态 | **`--qr-code-uuid`** |
| `login status` | 检查在线状态（1 在线 / -1 离线 / 0 未登录）；在线时自动记录 wxid/appId，并确保数据同步服务按最新凭证运行 | `--auto-connect` 掉线时自动重连并返回重连后的状态（**检测到离线（-1）时优先带上重连**） |
| `login quick` | 快捷登录（免扫码，手机点确认）；**调用成功后必须立即提示用户到手机微信点「确认登录」** | — |
| `login logout` | 主动退出登录 | — |
| `data status` | 登录后查看数据同步状态与数据量（wekeapi-msg-sync） | — |
| `data config` | 登录成功后设置数据同步服务的数据库（SQLite/MySQL）与端口（弹框按序收集：类型 → MySQL 连接 URI → 端口） | `--db` sqlite/mysql、`--db-path` SQLite 文件名（默认 `wekeapi_msg_sync.db`，登录流程不传）、`--db-dsn` MySQL 连接串、`--port`（默认 3006）；不带参数只查看当前配置 |
| `data start` | 启动数据同步服务（已运行则保持不动） | — |
| `data sync` | 重启数据同步服务并立即全量同步（等价 `data restart`），启动后按 3.4 询问是否接收消息 | — |

## 注意

- appId 即设备身份：设备类型（Mac/iPad）在 appId 首次生成时绑定，之后传 `--device-type` 不再改变；换设备类型需按新设备登录（`--new-device` 或 `--app-id=`）。
- appId 仅在登录成功（status=2）后落盘 `~/.wekeapi/config.json`；登录成功前调用 `login check` 或重取二维码必须显式传 `--app-id`。
- 账号信息记录：统一以在线状态检测响应为数据源——`login status` 在线时自动记录；`login check` 登录成功后 CLI 自动补调一次 status 完成同样记录（appId 先落盘配置）。配置只存 wxid/appId，业务数据（联系人/消息/群聊）由 wekeapi-msg-sync 服务存储，用 `data` 命令查询。
- deviceType 优先 Mac（支持自动验证，验证成功率高但未达 100%）；连续 2 次自动验证失败后改用 manual，勿再重试 auto；手动验证需专用扫码验证工具（提醒用户联系客服 weke_820528 准备），自动验证无需此提醒。
- Mac 登录更简便但会占用 PC 登录名额（无法在电脑上再登录该账号）；iPad 只占用 Pad 登录名额，不影响电脑登录，不支持自动验证。
- 登录二维码有效期只有 3 分多钟；多次获取二维码或登录失败可能使账号处于高风险，取码前先确认登录参数齐备（2.1 完成后再取码）。
- 新设备初次登录显示登录成功但随即掉线、账号变为未登录状态，属于正常现象：检查是否收到安全提醒（有则按提醒操作），一般再次登录即可成功。
- 登录失败提示“当前设备于xx在xxx设备上登录，若不是本人操作…”：先检查账号是否已登录在其他同类型设备上，如有先退出再试；没有则可在该设备上继续尝试登录。
- 同一设备连续几次登录不成功：继续登录请换新设备（`--new-device`，视为新设备登录有风控风险，先向用户确认）。
- `-20 账号限额已用完`：账号额度耗尽，**不要重试、不要换参数绕行**；提示用户打开官网（`$WEKEAPI env` 的 `siteURL`）登录后台获取服务套餐（新人可领取 15 天免费体验包），额度恢复后重新登录（详见「账号限额（`-20 账号限额已用完`）处理」）。
- 在与用户交互过程中尽量少用专业术语，多用通俗易懂的语言。
