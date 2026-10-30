---
name: wekeapi-label
description: wekeapi CLI label 模块：微信标签管理（获取标签列表、添加标签、删除标签、修改好友标签）。当用户要求管理微信标签或给好友打标签时使用。
---

# label 标签

## 前置

- 二进制复用 wekeapi-core skill 的 `assets/bin/`（相对该 skill 目录解析，不要写死 skills 根目录），按 OS/架构选择（Windows x64: `wekeapi-windows-amd64.exe` / Windows ARM64: `wekeapi-windows-arm64.exe` / Linux x64: `wekeapi-linux-amd64` / Linux ARM64: `wekeapi-linux-arm64` / macOS Intel: `wekeapi-darwin-amd64` / macOS ARM: `wekeapi-darwin-arm64`），下文以 `$WEKEAPI` 代指；`PATH` 中已有 `wekeapi` 时优先用 `wekeapi`，定位与兜底见 wekeapi-core「二进制」。
- 调用需 `--token` 与 `--app-id`（运行 `wekeapi init` 保存配置后可免传，显式 flag 优先）；stdout 恒为 JSON；退出码 0 成功 / 1 API 业务错误 / 2 本地错误。
- 其余全局约定见 wekeapi-core skill。

## 命令表

| 命令 | 说明 | 参数 |
|---|---|---|
| `label list` | 获取标签列表 | — |
| `label add` | 添加标签 | **`--labels`** 名称列表（逗号分隔） |
| `label delete` | 删除标签 | **`--label-id`** |
| `label set-friend` | 修改好友标签 | **`--wxid`**、**`--label-ids`** 该好友的全部标签（逗号分隔） |

## 注意

- 手机端增删标签不会自动同步到平台；手机上加了新标签后，先调 `label list` 同步再操作。
- 标签数据由 wekeapi-msg-sync 随联系人一起同步；用 `$WEKEAPI data contacts --keyword <关键词>` 查询时，返回的 `label_ids`/`labels` 已把标签 ID 翻译成名称，可直接用于确认好友现有标签。
- 查某个标签下的联系人：`$WEKEAPI data contacts --label <标签名或标签ID> --limit 100`（本地数据，多个标签逗号分隔表示同时具备）；本地标签还没同步到时先 `$WEKEAPI data sync` 再查。
- `set-friend` 需提交该好友的**全部**标签（全量覆盖，不是增量）。
- 标签 Id 也用于朋友圈可见范围：wekeapi-sns 的 `sns send-*` / `set-visibility` 中 `--allow-tag-ids`（部分可见）与 `--disallow-tag-ids`（不给谁看）传的就是这里的标签 Id。

## 示例

```bash
# 新增标签并给好友打上
$WEKEAPI label add --token T --app-id A --labels 客户,同事
$WEKEAPI label set-friend --token T --app-id A --wxid wxid_xxx --label-ids 101,102
```
