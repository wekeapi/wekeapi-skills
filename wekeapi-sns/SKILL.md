---
name: wekeapi-sns
description: wekeapi CLI sns（朋友圈）模块：朋友圈时间线与好友朋友圈列表、朋友圈详情、发布文本/图文/视频/链接朋友圈、转发链接或视频号内容到朋友圈、修改可见范围与私密、删除、点赞/取消点赞、发布与删除评论、下载朋友圈图片/评论图片/视频。当用户要求发朋友圈、查看某人朋友圈、给朋友圈点赞评论、删除朋友圈、设置朋友圈可见范围，或下载朋友圈里的图片视频时使用。
---

# sns 朋友圈

## 前置

- 二进制复用 wekeapi-core skill 的 `assets/bin/`（相对该 skill 目录解析，不要写死 skills 根目录），按 OS/架构选择（Windows x64: `wekeapi-windows-amd64.exe` / Windows ARM64: `wekeapi-windows-arm64.exe` / Linux x64: `wekeapi-linux-amd64` / Linux ARM64: `wekeapi-linux-arm64` / macOS Intel: `wekeapi-darwin-amd64` / macOS ARM: `wekeapi-darwin-arm64`），下文以 `$WEKEAPI` 代指；`PATH` 中已有 `wekeapi` 时优先用 `wekeapi`，定位与兜底见 wekeapi-core「二进制」。
- 调用需 `--token` 与 `--app-id`（运行 `wekeapi init` 保存配置后可免传，显式 flag 优先）；stdout 恒为 JSON；退出码 0 成功 / 1 API 业务错误 / 2 本地错误。
- 命令组名 `sns`（对应接口前缀 `/v1/sns/`）。其余全局约定见 wekeapi-core skill。

## 核心概念

- **朋友圈 Id（snsId）**：发布接口响应 `data.snsId`；查看类接口返回 `data.snsItemList[].id`。后续点赞、评论、删除、改可见范围、下载都要用它。
- **发布人 wxid（snsWxid）**：点赞与评论必填，直接取列表项的 `wxid` 字段，不要手猜。
- **xmlMsg**：每条朋友圈的内容原文，位于列表项 `xmlMsg`；转发/下载朋友圈、转发视频号都要求它的 base64（CLI 用 `--xml`/`--xml-file` 自动编码）。
- **可见范围 visibility**：`1`-公开 `2`-私密 `3`-部分可见 `4`-不给谁看。`3` 必须同时给 `--allow-tag-ids` 或 `--allow-wxids`；`4` 必须给 `--disallow-tag-ids` 或 `--disallow-wxids`（标签 Id 用 `label list` 取，参见 wekeapi-label）。
- **分页**：首次调用不传分页参数；第 2 页起把上次响应 `data` 中的 `firstPageMd5` 与 `fromId` 分别传给 `--first-page-md5`、`--from-id`。没有更多数据时响应不再返回新的 `fromId`。

## 命令表

### 查看

| 命令 | 说明 | 参数 |
|---|---|---|
| `sns list` | 自己朋友圈时间线 | `--first-page-md5`、`--from-id`（翻页用） |
| `sns friend-list` | 某个好友的朋友圈列表 | **`--wxid`** 发布人；`--first-page-md5`、`--from-id` |
| `sns detail` | 某条朋友圈详情（含完整点赞/评论） | **`--sns-id`** |

### 发布（都会返回 `data.snsId` 与 `data.createTime`）

| 命令 | 说明 | 参数 |
|---|---|---|
| `sns send-text` | 纯文本朋友圈 | **`--content`**、**`--visibility`** |
| `sns send-image` | 图文朋友圈（≤9 张，单张 ≤5MB） | **`--images`**（本地路径，逗号分隔，自动 base64）/ **`--image-urls`**（URL 列表）二选一、**`--visibility`**；`--content` |
| `sns send-video` | 视频朋友圈（≤200MB；Mac 版 ≤30 秒） | **`--file`/`--url`**、**`--visibility`**；`--content` |
| `sns send-link` | 链接朋友圈（缩略图 ≤5MB） | **`--title`**、**`--link-url`**、**`--file`/`--url`** 缩略图、**`--visibility`**；`--content` |

发布类都支持可见范围细节：`--allow-tag-ids`、`--allow-wxids`、`--disallow-tag-ids`、`--disallow-wxids`、`--with-wxids`（提醒谁看）、`--location`（位置 JSON，见下）。

### 转发到朋友圈（都必填 `--visibility`，可选 `--content` 与可见范围细节）

| 命令 | 数据来源 | 参数 |
|---|---|---|
| `sns forward-link` | 收到的**链接朋友圈**的 xmlMsg | **`--xml`/`--xml-file`** |
| `sns forward-link-msg` | 收到的**链接聊天消息**的 xmlMsg | **`--xml`/`--xml-file`** |
| `sns forward-finder` | **视频号聊天消息或视频号朋友圈**的 xmlMsg | **`--xml`/`--xml-file`** |

### 管理与互动

| 命令 | 说明 | 参数 |
|---|---|---|
| `sns set-visibility` | 修改已发布朋友圈的可见范围 | **`--sns-id`**、**`--visibility`** + 可见范围细节 |
| `sns set-private` | 设为/取消私密 | **`--sns-id`**、**`--is-private=true/false`**（必须显式给值） |
| `sns delete` | 删除自己发布的朋友圈 | **`--sns-id`** |
| `sns like` | 点赞 | **`--sns-id`**、**`--sns-wxid`** |
| `sns unlike` | 取消点赞 | **`--sns-id`** |
| `sns comment` | 发布评论（可带图、可回复他人） | **`--sns-id`**、**`--sns-wxid`**；`--content` 与 `--file`/`--url` 至少一个 |
| `sns delete-comment` | 删除评论 | **`--sns-id`**、**`--comment-id`** |

回复他人评论时，`--reply-comment-id` 与 `--reply-wxid`、`--reply-nickname`、`--reply-create-time` 四项必须一起给（值取自 `commentList` 对应项）。评论响应 `data.commentId` 即评论 Id。

### 下载

| 命令 | 说明 | 参数 |
|---|---|---|
| `sns download-image` | 图文朋友圈的图片地址列表（7 天有效） | **`--xml`/`--xml-file`**；`--out-dir <目录>` 批量保存为 `1.jpg`、`2.png`… |
| `sns download-comment-image` | 评论中的图片 | **`--url`**（评论图片的 `imageUrl`）；`--cdn-token`/`--key`/`--enc-idx` 有则必传；`--out` 保存 |
| `sns download-video` | 视频朋友圈的视频 + 封面图地址 | **`--xml`/`--xml-file`**；`--out` 存视频，封面见响应 `thumbUrl` |

## 位置参数 --location

`--location` 是 JSON 对象（`locationInfo`），必含 `poiName`、`city`、`latitude`、`longitude`、`poiClassifyId`、`poiClassifyType`，可选 `poiAddress`、`poiScale` 等：

```bash
$WEKEAPI sns send-text --token T --app-id A --content '打卡' --visibility 1 \
  --location '{"poiName":"西湖","city":"杭州","latitude":30.25,"longitude":120.15,"poiClassifyId":"xxx","poiClassifyType":1}'
```

Windows PowerShell 会剥离参数中的双引号，导致 JSON 解析失败（报「不是合法 JSON」）：改用文件传入 `--location '@loc.json'`（`@` 前加引号避免 PowerShell 把 `@` 当展开运算符）。

## 示例

```bash
# 1) 发一条公开图文朋友圈，3 张本地图片
$WEKEAPI sns send-image --token T --app-id A --visibility 1 \
  --content '今日团建' --images ./a.jpg,./b.jpg,./c.jpg

# 2) 部分可见：只给标签 101 和好友 wxid_x 看，并提醒 wxid_y
$WEKEAPI sns send-text --token T --app-id A --visibility 3 \
  --content '内部通知' --allow-tag-ids 101 --allow-wxids wxid_x --with-wxids wxid_y

# 3) 看自己的朋友圈第一页，取 snsId 后点赞
$WEKEAPI sns list --token T --app-id A
$WEKEAPI sns like --token T --app-id A --sns-id 1234567890123 --sns-wxid wxid_me

# 4) 看好友朋友圈并翻页
$WEKEAPI sns friend-list --token T --app-id A --wxid wxid_friend
$WEKEAPI sns friend-list --token T --app-id A --wxid wxid_friend \
  --first-page-md5 <上次的 firstPageMd5> --from-id <上次的 fromId>

# 5) 下载某条图文朋友圈的全部图片到本地目录
$WEKEAPI sns download-image --token T --app-id A --xml-file ./sns.xml --out-dir ./sns_imgs

# 6) 把链接聊天消息转发到朋友圈
$WEKEAPI sns forward-link-msg --token T --app-id A --visibility 1 \
  --content '好文分享' --xml-file ./link_msg.xml
```

## 注意

- **Mac 设备限制**：`set-private`、`set-visibility` 在设备类型为 Mac 时不支持，需在手机端操作。
- **可见范围校验**：`visibility=3/4` 缺少对应标签或联系人会被服务端拒绝；标签 Id 先用 `label list` 确认（手机上新加的标签需先 `label list` 同步）。
- **好友朋友圈可能不完整**：响应 `data.snsTips` 形如「朋友仅展示最近一个月的朋友圈」，这属于对方隐私设置，不是接口异常。
- **下载地址 7 天有效**：`imageUrl`/`videoUrl`/`thumbUrl` 均为临时地址，拿到后尽快用 `--out`/`--out-dir` 落盘。
- **发布是高风险操作**：朋友圈内容对外可见且不可编辑（只能删），发布前必须把内容、可见范围与用户确认；短时间大量发布/点赞/评论易触发风控，操作之间留出间隔，遇限流按返回的 `code`/`message` 决策是否停止。
- **只想调整可见范围时不要重发**：已发布内容用 `set-visibility`/`set-private` 修改，删除用 `delete`（删除不可恢复，执行前确认 `snsId` 正确）。
- 朋友圈数据不在 `data` 本地库中，`data contacts/messages` 只能用于解析 wxid 与聊天记录，朋友圈须走本模块接口实时查询。
