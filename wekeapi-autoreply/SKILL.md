---
name: wekeapi-autoreply
description: wekeapi 微信消息实时监听与回复触发：用内置 Node 脚本轮询 wekeapi-msg-sync 的新消息并呈现给会话，提供串行发送触发；回复内容与风格由用户自行设计，skill 只负责监听/呈现/发送机制。当用户要求监听微信消息、实时接收新消息、挂机监听并触发回复时使用。支持多账号、私聊+群里被@、防多账号互回死循环、发送间隔3秒、同步延迟去重。
---

# wekeapi 实时监听与回复触发

## Overview

在会话内持续监听已登录微信账号的**收到消息**，把新消息呈现给会话，并提供发送回复的触发能力。**本 skill 只负责机制（监听 / 呈现 / 发送触发），不规定回复的内容、口吻或策略——那些完全由用户设计。** 监听/发送逻辑已封装为 `scripts/` 下的 Node 脚本，直接调用即可，**不要每次重写**。CLI 定位、账号发现、全局参数、退出码等共享约定见 wekeapi-core；发送接口细节见 wekeapi-message。

## 前置条件

1. 账号已登录（`account list` 可见，`login status` 在线）。多账号共用一个 msg-sync 服务。
2. `wekeapi-msg-sync` 服务运行中（`data status` 查；未运行先 `data start`）。
3. **已配置公网回调**，新消息才会实时入库。未配置时引导用户按 wekeapi-login「接收消息与公网回调配置」完成两步（端口映射 + 后台设回调地址 `/callback`），否则只能听到启动时全量同步的旧消息。

## 脚本（scripts/）

脚本自动定位 CLI（PATH 优先，否则向上找 `wekeapi-core/assets/bin/` 对应平台二进制），并通过 `account list` 自动发现全部已登录账号，无需硬编码 appId/wxid。状态文件默认存于 `~/.wekeapi/autoreply/`，可用 `--state-dir <dir>` 覆盖。

### listen.mjs — 阻塞等待新消息

```bash
node scripts/listen.mjs [--state-dir <dir>] [--timeout <ms>] [--interval <ms>] [--limit <n>] [--accounts <appId,appId>] [--group-mode none|at|all]
```

- 阻塞直到出现新的待回复消息或超时（默认 55s）。stdout 恒为 JSON：`{"timedOut":bool,"messages":[...]}`，每条含 `account{appId,wxid,nickname}`、`isGroup`、`from`、`to`、`room_id`、`conversation_id`、`content`、`create_time`、`new_msg_id`。
- 首次运行把当前历史消息全部标记为已看（seed），**只对之后新到的消息反应**；服务不可达时不写空 seed、下次自动重试。
- 过滤规则：仅文本（`msg_type=1`）；排除系统号（weixin 等）与公众号（`gh_*`）；**排除所有已登录账号自身**（防多账号互回死循环）；群消息按 `--group-mode`：`none` 只听私聊、`at` 私聊+群里被@（默认，按 content 含 `@昵称`/`@别名` 判断）、`all` 私聊+全部群文本。
- `--accounts` 可只监听部分账号（逗号分隔 appId）；默认全部。
- 调用时 Bash timeout 设为比 `--timeout` 略大（如 70s 对 55s）。

### reply.mjs — 发送指定内容并记账

```bash
node scripts/reply.mjs [--state-dir <dir>] <appId> <toWxid> <conversationId> <content>
```

- 纯发送触发：`content` 发什么由调用方（用户/会话）决定，脚本不改写。`appId` 用收到消息那条里的 `account.appId`（**哪个账号收到就用哪个回**）；`toWxid` 私聊填对方 `from`、群填 `room_id`；`conversationId` 填该消息的 `conversation_id`。
- 自动保证**任意两次发送间隔 ≥3 秒**（读 `lastsend.json`），无需手动 sleep；成功后把回复时间写入 `replied.json`，供 listen 去重。
- stdout 为发送接口原始 JSON；退出码 0 成功 / 1 业务错误 / 2 本地错误。遇 `-12 调用超限` 停止发送、等更久再重试。

## 工作流（会话内循环）

1. 确认前置条件；用 AskUserQuestion 弹框确认**监听范围**（仅私聊 / 私聊+群里被@ / 全部群消息）与**监听账号**（默认全部）——这是机制配置；有默认值且用户未提个性化可不问。
2. 跑 `node scripts/listen.mjs` 阻塞等待。
3. `timedOut=true` 且无消息 → 直接再跑步骤 2 继续等（少刷屏）。
4. 拿到 `messages` → 把消息（账号、来源、内容、会话）呈现给会话。**回复内容由用户设计的方式决定**：遵循用户事先指定的回复规则/风格；用户未指定时询问用户如何回复，不自行编造人设或策略。
5. 对要回的消息，用 `node scripts/reply.mjs ...` 发送决定好的内容（脚本自动控间隔，串行逐条）。
6. 回到步骤 2 继续监听，直到用户要求停止。

## 机制注意

- **同步延迟去重**：消息 `create_time` 可能早于入库时间。listen 会跳过 `create_time` 早于该会话上次回复时间的消息（`replied.json`），避免对已回复过的旧消息重复触发。
- **防死循环**：两个已登录账号互相发消息不会触发（listen 已排除自身 wxid）。
- 默认仅文本消息触发；图片/语音/链接等媒体不触发，需要时另行扩展。
- 停止监听：结束循环即可；脚本非常驻进程，每次调用独立。清空 `~/.wekeapi/autoreply/state.json` 可重新 seed。