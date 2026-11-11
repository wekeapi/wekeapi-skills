---
name: wekeapi-login
description: wekeapi-cli login 模块：多账号登录（同一台机器登录多个微信账号、共用同一个数据同步服务）、登录概念背景知识（设备类型/验证方式/代理方式/数据库/端口），默认零配置扫码登录（Mac+自动验证+本地代理，SQLite+4000 端口占用在4000-5000内自动递增，除凭证、代理ID、扫码与手机确认外全程无需用户干预），个性化登录（用户明确项按用户选择、未提出项走默认），免扫码快捷登录（调用后必须提示用户在手机上点确认登录）、在线状态检查与掉线重连、退出登录，登录问题解答与失败处理（自动验证未通过、换设备、账号限额 -20 等），以及需要接收消息时的公网回调配置引导。当用户要求登录微信、登录另一个账号、获取登录二维码、检查微信在线状态、掉线重连、免扫码快捷登录、退出微信登录、同步微信数据，或询问登录方式与登录问题时使用。
---

# login 登录

## 前置

- 二进制复用 wekeapi-core skill 的 `assets/bin/`（相对该 skill 目录解析，不要写死 skills 根目录），按 OS/架构选择（Windows x64: `wekeapi-windows-amd64.exe` / Windows ARM64: `wekeapi-windows-arm64.exe` / Linux x64: `wekeapi-linux-amd64` / Linux ARM64: `wekeapi-linux-arm64` / macOS Intel: `wekeapi-darwin-amd64` / macOS ARM: `wekeapi-darwin-arm64`），下文以 `$WEKEAPI` 代指；`PATH` 中已有 `wekeapi` 时优先用 `wekeapi`，定位与兜底见 wekeapi-core「二进制」。
- 调用需 `--token`（访问凭证，全部账号共用，可 `init` 保存）；除 `login qr` 外需 `--app-id`，多账号时它同时是**账号选择器**（取值见 `wekeapi account list`）。
- stdout 恒为 JSON；退出码 0 成功 / 1 API 业务错误 / 2 本地错误。
- 其余全局约定（--data 透传、--timeout 等）见 wekeapi-core skill。

## 背景知识（概念解释，不是操作流程；用户询问时从这里取通俗解释）

- **设备类型 `--device-type`**：把这次登录当作哪种设备，`Mac` 或 `iPad`，绑定在 appId 上（appId 首次生成时确定，之后携带同一 appId 再传不改变；更换设备类型必须按全新设备登录 `--new-device`）。Mac 占用 PC 登录名额（登录期间该账号无法再在电脑上登录），支持自动验证，是默认首选；iPad 只占用 Pad 登录名额、不影响电脑登录，但仅支持手动验证。
- **验证方式 `--verify-type`**：新设备登录时微信要求的身份验证。`auto`＝平台自动完成，用户无需扫验证二维码，成功率高但未达 100%；`manual`＝需账号持有人用专用扫码验证工具扫接口返回的验证二维码（工具联系客服 weke_820528 获取）。iPad 固定 manual。
- **代理方式 `--proxy-type`**：登录设备的网络出口。`local`＝官方本地代理工具（推荐；用户安装运行后取得代理 ID，形如 `pzqn-xxxx-xxxx`，下载地址取 `$WEKEAPI env` 输出的 `proxyDownloads`）；`self`＝用户自有 socks5 代理 Url；`platform`＝平台城市代理（需选择微信常用地、匹配城市代码并检测可用性，见 wekeapi-proxy skill）。
- **数据库**：数据同步服务（wekeapi-msg-sync）的存储。`SQLite`＝零部署、单机够用，默认文件 `wekeapi_msg_sync.db`（服务目录 `~/.wekeapi/msg-sync`）；`MySQL`＝多端共享或已有 MySQL 的场景，库与表由服务自动创建。
- **服务端口**：msg-sync 监听的本机端口，默认 `4000`；接收消息时公网回调地址的端口必须与它一致。端口被占用时在 `4000-5000` 范围内向上逐个递增查找可用端口（见默认流程第 4 步）。

## 登录规范

### 登录前提醒（必须）

发起 `login qr`（含 `--new-device`）或 `login quick` 之前，**必须先提醒用户检查并退出已登录的同类设备**：

- 若本次按 **Mac** 设备登录：提醒用户该微信账号若已登录在其他 Mac（或 PC 微信客户端）上，请先在原设备上退出登录。
- 若本次按 **iPad** 设备登录：同理提醒用户先退出已登录的其他 iPad 设备。
- 用户确认已退出（或确认没有同类设备在线）后再取码/发起快捷登录；不要跳过提醒直接执行。

### 二维码展示

- **展示二维码**：`login qr` 命令返回后，会把二维码保存到当前项目下，然后**直接在 Agent 中展示二维码**（用markdown 语法展示的时候本地路径去掉 file:///），并在二维码下面显示二维码本地链接用来兜底（markdwon形式显示链接），尽可能让用户在聊天中直接看到并扫码；展示二维码之前不要启动轮询。

### 轮询规范

`login check` 需要展示二维码后反复调用直到出结果：

- `0`（未扫码）/ `1`（已扫码）都继续下一轮
- `10`（本次登录需验证）登录时选手动验证：提醒用户使用专用扫码验证工具；登录时选自动验证：提醒用户等待验证完成；然后继续下一轮
- `11`（待手机确认）提醒用户在手机微信上确认，然后继续下一轮
- `2`（已登录）/ `3`（失败，包括二维码超时）登录终止，可结束轮询。

Agent 不便多次调用工具时，可用一条 shell 循环命令跑完整轮询（每 5 秒一轮，出终态即 break）：

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
- 按状态变化（已扫码 / 需验证 / 待确认）或终态向用户汇报，不必每轮都回。

### 使用中遇到账号限额不足

登录或重连类调用（`login qr` / `login quick` / `login status`）返回 `code=-20`（message 含「账号限额已用完」）时：

- **立即停止登录编排**：不要重试、不要重取二维码、不要换设备类型/验证方式/代理方式或 `--new-device` 再试，也不要当成网络或风控问题继续排查。
- **必须向用户明确说明**：当前访问凭证所属账号的额度已用完；请打开官网（`$WEKEAPI env` 输出的 `siteURL`）登录后台，**获取服务套餐**，额度恢复后重新执行登录即可（凭证已保存在 `~/.wekeapi/config.json`，无需重新 `init`）。
- 不要建议用户借用他人 token 规避限额，也不要继续轮询等待；报告后可询问用户是否已处理完毕再重试登录。


## 登录入口：读取配置与在线状态检查（每次触发微信操作先走这步）

1. 读取 `~/.wekeapi/config.json`（默认 `token` + `accounts[]`；旧版单账号配置会自动迁移），或直接运行 `$WEKEAPI account list`：
   - 无 token → 进入「默认登录流程」第 1 步收集凭证，拿到之前不得执行任何后续步骤（不得取二维码、不得探测在线状态等）。
   - 用户点名了某个微信号/昵称 → 先在 `account list` 里匹配到对应 `appId`，本次所有命令都带 `--app-id <appId>`；匹配不到则视为要登录新账号。
   - 用户没点名账号 → 使用 `activeAppId`（仅一个账号时自动使用）。
   - 本地有多个账号且没有 `activeAppId` → 用 `AskUserQuestion` 弹框让用户从 `appId` 列表中选择，**不要自行猜测账号**。
   - 选中账号已有 appId → 按第 2 项检查在线状态，**不要直接扫码**；没有账号或用户明确要登录新账号 → 走「多账号登录」或「默认登录流程」。
2. `$WEKEAPI login status --app-id A`（token 默认取配置；显式 `--token` 优先）：
   - 返回 1（在线）：CLI 已自动把 wxid 写入该账号并设为默认，同时把**全部账号**写入 `wekeapi-msg-sync.json`，确保数据同步服务按最新账号列表运行（账号列表未变化且服务已在运行时不会重启）；直接执行用户操作，登录编排结束。
   - 返回 -1（离线）：**先尝试重连，不要直接跳到登录**：`$WEKEAPI login status --app-id A --auto-connect`（平台会尝试重连并返回重连后的状态，可能耗时数十秒，先告知用户正在重连）。重连后为 1 → 按上一行的在线流程处理，登录编排结束；仍为 -1 → 进入第 3 项免扫码快捷登录。
   - 返回 0（未登录，如主动退出）：重连无意义，直接进入第 3 项免扫码快捷登录。
   - 重连时返回 `-20`（账号限额已用完）：按「使用中遇到账号限额不足」处理。
3. 免扫码快捷登录（离线重连失败或未登录时）：
   1. `$WEKEAPI login quick --app-id A`：成功返回新的 `qrCodeUUID`。
      - **必须立即提示用户到手机确认（高优先级）**：`login quick` 成功返回后，**在下一次回复的第一句用醒目文字提示用户**「已向你的微信推送登录确认，请现在打开手机微信，在弹出页点击「确认登录」，否则确认超时会失败」；不得静默直接轮询让用户不知道要做什么。
      - 提示同时告知：确认有效期有限，超时未点确认则本次快捷登录失败（会转扫码登录）；手机没有收到弹窗时可改用扫码登录。
      - 提示发出后再开始轮询；轮询超过约 30 秒仍未见用户确认（status 仍为 0/1）时，再提醒一次用户点手机上的确认，不要每 5 秒刷屏。
   2. 用返回的 `qrCodeUUID` 轮询 `$WEKEAPI login check --app-id A --qr-code-uuid U`（见「轮询规范」）：
      - status=0/1（未点确定）：**提示用户在手机上点击「确认登录」**，继续轮询。
      - status=2 → 登录成功：CLI 自动把 appId/wxid 写入该账号、设为默认，并把全部账号同步到数据同步服务 → 按「默认登录流程」第 4 步确认服务就绪后执行用户操作。
      - status=3：报错终止，用户取消登录或登录超时。
      - `login quick` 返回 -24（新设备登录后掉线、风控下线等被动退出不支持 quick）→ 转「默认登录流程」第 3 步扫码登录（参数走默认，本地代理 ID 缺失时才补收集）。
      - 返回 `-20`（账号限额已用完）：**不要转扫码登录**，按「使用中遇到账号限额不足」处理。

## 多账号登录（登录另一个账号）

触发：用户说「再登录一个账号」「再加一个微信」等，或 `account list` 里没有用户要操作的账号。

1. 凭证：沿用配置里的 `token`（一个凭证套餐可含多个账号额度，全部账号共用）；更换访问凭证时运行 `wekeapi init --token <新TOKEN>` 更新（影响所有账号）。不要要求用户为每个账号重复执行 `init`。
2. **每个微信账号必须使用独立的新 appId**：用 `$WEKEAPI login qr --device-type Mac --verify-type auto --proxy-type local --proxy-info <代理ID> --new-device --out qr.jpg`（代理 ID 复用本会话已提供的值，缺失时才向用户收集）。
   - `--new-device` 会让本次忽略默认账号的 appId，由平台生成新 appId；**不要复用其他账号的 appId**，否则会顶掉原账号的登录设备。
   - 已有账号重新登录（同一微信）时才使用该账号原 appId（`login qr --app-id <原appId>`），不要用 `--new-device`。
3. 记录返回的 `appId` 与 `qrCodeUUID`，展示二维码后按「轮询规范」用同一 `--app-id` 轮询 `login check`（新账号尚未落盘，轮询时必须显式传该 appId）。
4. status=2 后 CLI 自动完成：把新账号写入 `accounts[]`、记录 wxid/昵称、设为 `activeAppId`；同一 wxid 的旧 appId 记录会被清理。随后把**全部账号**写入 `wekeapi-msg-sync.json`。
5. **数据服务保持同一个**：不要为新账号另建 `--msg-sync-dir`、端口或服务实例；账号列表有变化时 CLI 会重启同一个服务并触发全量同步（多个账号逐个同步）。确认 `$WEKEAPI data status --app-id <新appId>` 可查到该账号状态。
6. 之后所有操作都带 `--app-id <新appId>`（或 `account use --app-id <新appId>` 设为默认后再省略）。

## 默认登录流程（首次登录、无个性化要求）

目标：除用户填写访问凭证、本地代理 ID 和扫码/手机确认外，全程不弹框追问、无需用户干预，直接登录成功。默认值：设备类型 `Mac`、验证方式 `auto`、代理方式 `local`、数据库 `SQLite`、端口 `4000`。用户有明确个性化要求时走「个性化登录」，未提出的项仍走这些默认值。

### 第 1 步：收集访问凭证

- 配置已有 token → 跳过本步。
- 无 token：**必须中断流程，用 `AskUserQuestion` 弹框向用户索要访问凭证**（选项「粘贴访问凭证（选 `Other` 输入）」/「还没有，去官网申请」；选后者时展示 `$WEKEAPI env` 输出的 `siteURL`，申请完成后再次弹框收集）。**禁止在回复里让用户在聊天框打字回复 token。** 拿到后执行 `wekeapi init --token <TOKEN>` 保存（自动化场景带 flag；API 地址编译期内置，无需收集 baseUrl）。

### 第 2 步：安装本地代理工具并收集代理 ID

- 不询问代理方式（固定 local）。运行 `$WEKEAPI env`，从 `proxyDownloads` 取当前环境对应用户操作系统平台的 `url` 展示给用户（Linux 直接展示 `note` 中的安装命令），提示用户下载、安装并运行官方本地代理工具；不要试图替用户安装，留给用户手动安装。
- 待用户运行工具取得本地代理 ID（形如 `pzqn-xxxx-xxxx`，CLI 无命令可查询）后，用 `AskUserQuestion` 弹框向其索要（选 `Other` 粘贴）。本会话已提供过代理 ID → 直接沿用，不再弹框。

### 第 3 步：取码扫码并轮询

1. `$WEKEAPI login qr --device-type Mac --verify-type auto --proxy-type local --proxy-info <代理ID> --new-device --out qr.jpg`
   - 首次登录/登录新账号（本地没有该账号的 appId）按全新设备取码（`--new-device`，或首次不传 `--app-id` 由系统自动生成）；已存在账号重新登录时用该账号原 appId（`login qr --app-id <原appId>`，不要传 `--new-device`）。**必须记录返回 JSON 中的 `appId` 与 `qrCodeUUID`**。
   - **`login qr` 不保存 appId 到配置**：appId 只在登录成功（`login check` 返回 status=2）后才写入该账号（stderr 有提示）。登录成功前的所有调用（`login check` 轮询、二维码超时后重新 `login qr`）必须显式传同一 `--app-id`（首次登录用 qr 返回的 appId），否则会被当作新设备重新生成 appId，容易触发风控。
   - 返回 `code=-20`：**不展示二维码、不轮询**，按「使用中遇到账号限额不足」处理后终止。
   - **展示二维码**（见「二维码展示」），展示之前不要启动轮询。
2. 按「轮询规范」每 5 秒轮询 `$WEKEAPI login check --app-id A --qr-code-uuid U` 直到终态，过程中根据需要提示用户在手机上操作：
   - status 0/1：继续下一轮（已扫码时可汇报一次）。
   - status 10（auto）：提示「平台正在自动完成身份验证，请稍候」，继续轮询。
   - status 11：提示用户到手机微信点「确认登录」，继续轮询。
   - status 2 → 登录成功，进入第 4 步。
   - status 3 → 失败终止；若是自动验证（auto）失败，按「常见问题解答与处理」改用 `--verify-type manual` 重新取码，不再重试 auto。

### 第 4 步：数据服务接管（默认 SQLite/4000，端口占用在 4000-5000 内自动递增）

- status=2 后 CLI 已自动完成，**无需再执行旧的 `sync all`**：
  1. 把该账号写入本地 `accounts[]`（wxid/昵称等），并设为 `activeAppId`；
  2. 把主配置中的访问凭证（token）、**全部账号**（appId/wxid）与 `baseURL` 写入服务目录的 `wekeapi-msg-sync.json`；
  3. 先检测服务是否已在运行：**已运行且账号列表（token/appId/wxid/baseURL）无变化时保持不动，不重复启动/不重启**（避免打断进行中的全量同步）；未运行或账号有增减/变更时才启动/重启（首次启动按默认配置：SQLite `wekeapi_msg_sync.db`、端口 `4000`）；
  4. 服务启动后立即对**每个账号**各执行一次全量同步（标签/好友/群组/公众号/企微好友）；之后的变更依赖消息回调增量更新，服务不再做定时同步。单个账号失败不影响其他账号。
- 服务目录查找顺序：全局参数 `--msg-sync-dir`（所有命令可传）> 环境变量 `WEKEAPI_MSG_SYNC_HOME` > `~/.wekeapi/config.json` 的 `msgSyncDir`（`init --msg-sync-dir` 可设置）> 默认 `~/.wekeapi/msg-sync`；配置 `wekeapi-msg-sync.json`、日志 `wekeapi-msg-sync.log`、PID 与 SQLite 数据库都在该目录。登录命令的 stdout 仍是登录接口 JSON；服务启动进度与结果提示走 stderr（前缀 `[msg-sync]`）。
- 确认就绪：`$WEKEAPI data status --app-id <appId>`（返回该账号的 `data.status` 为 `idle`/`syncing`/`error`，并给出 `contacts_count`/`rooms_count`/`messages_count`）。首次同步完成前可能为 `syncing`；平台还在同步通讯录时（错误码 `-43 通讯录同步进行中`）服务会自动等待重试（30 次 × 15 秒，约 7.5 分钟），通讯录人多时 `syncing` 持续几分钟属正常，不要提前判定失败。多账号时逐个账号为 `syncing`，属正常。
- **端口被占用导致启动失败时向上递增**：读 `~/.wekeapi/msg-sync/wekeapi-msg-sync.log` 确认是端口冲突后，执行 `$WEKEAPI data config --port <当前端口+1>` → `$WEKEAPI data start` → 再查 `data status`，在 `4000-5000` 范围内逐个向上尝试直到服务启动成功（如 4000→4001→…→5000；超出范围仍失败则报错并用 `AskUserQuestion` 弹框询问用户指定端口）。成功后告知用户实际使用的端口。
- 其他启动失败（如找不到服务可执行文件）：登录仍算成功，但需向用户报告警告并检查服务目录。

### 第 5 步：默认收尾

- **不弹数据库/端口框、不弹「是否接收消息」框**；默认按不接收消息处理，仅一句话说明影响（新消息、好友/群变更不会实时入库，之后想接收随时可按「接收消息与公网回调配置」开启），随后直接执行用户原操作。
- 后续查询数据用 `$WEKEAPI data contacts/messages/rooms`（见 wekeapi-core skill），不要再用 sqlite3 查本地数据库；服务未运行时可 `$WEKEAPI data start`，需要重新全量同步时用 `$WEKEAPI data sync`（等价 `data restart`）。

## 个性化登录（用户明确提出选择时）

触发：用户明确提出意向（换 iPad、手动验证、自有/平台代理、MySQL、自定义端口、要接收消息等）。规则：**用户明确的项按用户选择，未提出的项一律走默认**（Mac/auto/local/SQLite/4000），只补问所选项缺失的必要信息，不逐项全量确认；收集一律用 `AskUserQuestion` 弹框（见 wekeapi-core「交互输入规范」），用户消息中已明确的信息直接采用，不重复询问。

- **换 iPad**：`--device-type iPad`，验证方式固定 `manual`（不询问），提醒用户可能需要扫码验证，提前准备专用扫码验证工具（联系客服 weke_820528 获取）。
- **手动验证**：`--verify-type manual`，提醒同上；后续 status=10 时按手动验证提醒（接口返回验证二维码，需账号持有人用专用扫码验证工具扫码完成验证）。
- **自有代理 self**：弹框向用户索要代理 Url（socks5 地址，选 `Other` 粘贴）。
- **平台代理 platform**：按 wekeapi-proxy skill「平台代理选择流程」执行：用户选择微信常用地（通常指长期居住地或手机号归属地，两步选省、市，不可跳过）→ 匹配城市代码 → `proxy check-city` 检测可用性；`data=false` 时提示该城市无可用代理、请切换 local/self，终止 platform 流程；可用时以城市代码作 `--proxy-info`。
- **更换设备类型**：设备类型绑定在 appId 上，携带已有 appId 再取二维码时 `--device-type` 不生效（手机弹窗仍显示首次生成时的设备类型）；必须按全新设备登录 `--new-device`（等价 `--app-id=`），有风控风险，先向用户确认。**不要写 `--app-id ""`**：Windows PowerShell 5.1 会丢弃空字符串参数，导致 `--app-id` 吞掉后一个 flag 并报 `-50 服务异常`。
- **MySQL**：弹框收集连接 URI（自由文本，选项「粘贴连接串（选 `Other`）」），问题描述给示例：`mysql://user:pass@127.0.0.1:3306/dbname?charset=utf8mb4`；也接受 `user:pass@tcp(127.0.0.1:3306)/dbname?charset=utf8mb4`、`jdbc:mysql://...`（服务自动剥离 `jdbc:` 前缀、转换 JDBC 参数）。库不存在时服务启动会**自动创建**（utf8mb4）并自动建表，账号需有 CREATE 权限；无建库权限时再提示用户手工建库。登录成功后执行：

  ```bash
  # 连接串含特殊字符，PowerShell 用单引号包裹；不要写 --db-dsn ""
  $WEKEAPI data config --db mysql --db-dsn '<连接 URI>' --port <端口，未提出则 4000>
  $WEKEAPI data sync
  ```

  切换数据库类型不迁移旧数据，需等重新全量同步完成；旧 SQLite 文件保留在 `~/.wekeapi/msg-sync`，可提示用户自行清理。
- **自定义端口**：`$WEKEAPI data config --port <端口>`（被占用时同默认流程第 4 步向上递增），`data sync` 重启生效；改端口后若已配置接收消息，需重新提醒同步修改回调地址。
- **接收消息**：按「接收消息与公网回调配置」引导。
- **会话记忆**：会话内已确认过的个性化配置（验证方式、代理方式/代理信息、数据库类型/DSN/端口）后续直接沿用，不再弹框、不重复执行 `data config`；已写入的配置（MySQL、非默认端口等）视为已确认；仅当用户主动要求更改时才重新询问。`data config` 只改数据库与端口，保留 token/appId/wxid 等字段；输出 `data.changed` 表示配置是否变化，`data.needRestart=true` 表示运行中的服务仍用旧配置。

## 常见问题解答与处理（用户询问或反馈登录问题时按此应答）

- **能否登录其他设备 / 电脑上还要用微信怎么办？** Mac 登录占用 PC 登录名额（期间电脑无法再登该账号）；改用 iPad 只占 Pad 名额、不影响电脑登录，但 iPad 仅支持手动验证。换设备类型需按全新设备登录（`--new-device`，有风控风险，先向用户确认），见「个性化登录」。
- **自动验证没通过？** 连续 2 次自动验证失败后改用 `--verify-type manual` 重新取码，勿再重试 auto；手动验证需专用扫码验证工具（提醒用户联系客服 weke_820528 准备），由账号持有人扫接口返回的验证二维码。自动验证成功率高但未达 100%，失败属正常风控现象。
- **`-20` 账号限额已用完？** 见「使用中遇到账号限额不足」：到官网获取服务套餐，不重试、不换参数绕行。
- **二维码过期？** 有效期只有 3 分多钟，用同一 `--app-id` 重取（最多重试 2 次）；多次获取二维码或登录失败可能使账号处于高风险，取码前先确认登录参数齐备。
- **新设备初次登录显示成功但随即掉线、账号变为未登录？** 属正常现象：检查是否收到安全提醒（有则按提醒操作），一般再次登录即可成功。
- **提示「当前设备于xx在xxx设备上登录，若不是本人操作…」？** 先检查账号是否已登录在其他同类型设备上，如有先退出再试；没有则可在该设备上继续尝试登录。
- **同一设备连续几次登录不成功？** 继续登录请换新设备（`--new-device`，视为新设备登录有风控风险，先向用户确认）。
- **能不能同时登录多个微信账号？** 可以。每个账号用独立的新 appId 登录（`login qr --new-device`），成功后写入本地 `accounts[]`，全部账号共用同一个 `wekeapi-msg-sync` 服务（同端口、同数据库，数据按 appId 隔离）。操作时用 `--app-id` 选择账号，或先 `account use --app-id` 设为默认。
- **多账号后某个账号限额用完会怎样？** 账号额度按访问凭证套餐计算（全部账号共用同一凭证）；提示用户到官网获取/升级套餐即可，已登录账号与数据同步服务不受影响。按「使用中遇到账号限额不足」处理即可。

## 接收消息与公网回调配置（仅在需要时引导）

默认不弹框询问是否接收消息、不主动提醒回调配置。触发条件：用户提出「接收微信消息 / 自动回复 / 实时监听消息」等需求，或个性化流程中用户明确选择接收消息（不必重启服务）。

数据同步依赖 wekeapi 平台的**消息回调**，而 msg-sync 服务只被动接收回调，**不会自动向平台注册回调地址**。用户需要接收消息时，必须主动提醒完成两步：

1. **把本地 callback 接口映射到公网**：服务只监听本机 `http://127.0.0.1:<端口>/callback`（`POST`，端口即当前服务端口，默认 `4000`，以第 4 步实际启动端口为准）。用公网 IP 端口映射/反向代理、云服务器安全组放行，或 frp/ngrok 等内网穿透，把它暴露为 `http(s)://<公网地址>/callback`。
2. **到 wekeapi 管理后台绑定回调地址**：打开 `$WEKEAPI env` 输出的 `siteURL` 登录后台，找到本机在用访问凭证（`token`，全部账号共用）的回调地址设置，填上面那个公网 `/callback` 地址并保存。多账号共用一个服务时，回调地址相同即可，服务会按回调里的 `appId` 分发到对应账号。要求：以 `http://` 或 `https://` 开头、长度≤ `1024` 字符、路径必须是 `/callback`、端口与当前服务端口一致。

- **必须告知不配置的后果**：回调不通时新消息不会实时入库，新好友/群变更/撤回等事件会滞后，也不会自动补齐（服务只在启动/重启时全量同步一次，可用 `data sync` 重新全量）。
- **可达性自查（告诉用户可自行验证）**：`curl.exe -X POST <公网地址>/callback -d '{}'` 返回 `400`（参数非法）说明公网已通；`curl.exe <公网地址>/healthz` 返回健康信息说明端口映射正常（仅转发了 `/callback` 路径时用前一个）。
- 后台配置只能由用户操作，**不要替用户去改**；用户确认已配置就继续后续操作，未配置也要说明影响后继续（登录与同步不阻塞）。
- 只提醒一次，不要每次 `data status` 重复；但改了服务端口（`data config --port`）或换了访问凭证后，必须重新提醒同步修改回调地址。
- 未开启接收消息的用户，后续改端口/换 token 无需提醒回调配置，除非用户改口要接收消息。

## 命令表

| 命令 | 说明 | 参数 |
|---|---|---|
| `login qr` | 获取登录二维码（默认流程固定 Mac/auto/local，见「默认登录流程」；个性化按用户明确项） | **`--device-type`** Mac/iPad、**`--verify-type`** manual/auto、**`--proxy-type`** local/self/platform、**`--proxy-info`**（local 传代理ID，需用户安装本地代理工具获取 / self 传代理Url / platform 传城市代码，须经用户选择微信常用地与可用性检测，流程见 wekeapi-proxy skill）；`--new-device` 按全新设备取码（忽略配置 appId，等价 `--app-id=`）；`--app-id` 已有账号重新登录时指定原 appId；`--out` 保存二维码图片 |
| `login check` | 轮询检测登录状态 | **`--qr-code-uuid`**、**`--app-id`**（本次登录的 appId，新账号尚未落盘时必须显式传） |
| `login status` | 检查指定账号在线状态（1 在线 / -1 离线 / 0 未登录）；在线时自动把 wxid 写入该账号，并确保数据同步服务按最新账号列表运行 | **`--app-id`**（账号选择器）、`--auto-connect` 掉线时自动重连并返回重连后的状态 |
| `login quick` | 指定账号快捷登录（免扫码，手机点确认）；**调用成功后必须立即提示用户到手机微信点「确认登录」** | **`--app-id`** |
| `login logout` | 退出指定账号登录（不影响其他账号与数据服务） | **`--app-id`** |
| `account list` | 查看本地已登录账号与默认账号 | — |
| `account use` | 设置默认账号 | **`--app-id`** |
| `data status` | 登录后查看指定账号的数据同步状态与数据量（wekeapi-msg-sync） | **`--app-id`**（账号选择器；多账号时必须能确定账号） |
| `data config` | 数据同步服务数据库与端口：默认 SQLite/4000（端口占用时在 4000-5000 内向上递增），默认流程不弹框；仅用户个性化要求时弹框收集 | `--db` sqlite/mysql、`--db-path` SQLite 文件名（默认 `wekeapi_msg_sync.db`，登录流程不传）、`--db-dsn` MySQL 连接串、`--port`（默认 4000）；不带参数只查看当前配置 |
| `data start` | 启动数据同步服务（已运行则保持不动） | — |
| `data sync` | 重启数据同步服务并立即全量同步（等价 `data restart`）；启动后默认不询问是否接收消息，用户需要时按「接收消息与公网回调配置」引导 | — |

## 注意

- appId 仅在登录成功（status=2）后写入对应账号；登录成功前调用 `login check` 或重取二维码必须显式传同一 `--app-id`。
- 账号信息记录：统一以在线状态检测响应为数据源——`login status` 在线时自动记录到该账号；`login check` 登录成功后 CLI 自动补调一次 status 完成同样记录。本地配置只存账号（appId/wxid）与 token，业务数据（联系人/消息/群聊）由 wekeapi-msg-sync 服务按账号存储，用 `data` 命令查询。
- 多账号共用同一个数据同步服务：**不要**为每个账号建独立服务目录、端口或数据库；服务配置里的 `accounts[]` 会自动包含全部账号。
- 显式空值一律用 `--app-id=`（等号空值语法），**不要写 `--app-id ""`**（PowerShell 5.1 会丢弃空字符串参数）；新设备登录优先用 `--new-device`。
- 在与用户交互过程中尽量少用专业术语，多用通俗易懂的语言。