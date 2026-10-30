# wekeapi-skills

wekeapi 的 **Agent 技能包仓库**：面向支持 Agent Skill 的 Agent / Harness 工具（Trae、Claude Code、DeepSeek Harness、OpenCode、Qoder 等），在 Harness 工具上安装 Skill，即可通过 AI 使用个微的交互能力；仓库已内置 Skills 需用到的多平台预编译二进制文件，**无需源码、无需构建、无需安装环境**。

## 安装方式

### 方式一：Harness 快速安装（推荐）

把下面这段话发给支持 Agent Skill 的 Harness，它会自己装好：
```
安装 wekeapi skills：

从 https://github.com/wekeapi/wekeapi-skills.git 克隆项目，并把克隆下来的 skills 安装到当前项目。

安装时 `wekeapi-core/assets/bin/` 只保留当前平台可用的两个二进制（`wekeapi-<os>-<arch>[.exe]` 与 `wekeapi-msg-sync-<os>-<arch>[.exe]`），其余的删掉；Linux/macOS 还要 `chmod +x` 这两个文件。
```

### 方式二：自行安装

把 wekeapi-skills 目录下的所有 Skill 复制到 Harness 对应的 skills 目录，例如 claude-code 的 `~/.claude/commands/`、opencode 的 `~/.config/opencode/skills`，即完成安装。注意 wekeapi-core/assets/bin 下面可执行文件也要一起安装，可以只保留你的电脑对应的 wekeapi 和 wekeapi-msg-sync 版本，其他的删掉。

## 开始使用

在 Harness 工具打开对话，告诉 AI “我要登录微信账号”，就可以开始和 AI 一起探索 wekeapi-skills 的功能
- wekeapi-skills 基于 wekeapi 提供的微信连接能力
- 使用过程中 AI 会提示你到 [wekeapi官网](https://www.wekeapi.com/) 申请 AccessToken、获取服务套餐（新人有15天免费体验包）；你也可以自行到 [wekeapi官网](https://www.wekeapi.com/) 注册并提前准备好，它们是登录账号的前提
- 提前阅读 [wekeapi使用文档](https://doc.wekeapi.com/) 有助于你更好地理解 wekeapi 以便用好 wekeapi-skills

## 技能一览

| 技能 | 能力 |
| --- | --- |
| `wekeapi-login` | 扫码登录、登录状态轮询、在线状态检查、免扫码快捷登录、退出登录，以及登录后的数据服务接管 |
| `wekeapi-contact` | 通讯录：好友列表/详情、同步、搜索、添加/同意/删除好友、备注、仅聊天、企微好友、手机通讯录 |
| `wekeapi-chatroom` | 群管理：建群、邀请/添加成员、踢人、转让群主、管理员、群公告、群名/备注/昵称、群二维码、解散/退出 |
| `wekeapi-label` | 标签：获取列表、添加、删除、修改好友标签 |
| `wekeapi-message` | 消息：发送文本/图片/视频/文件/语音/链接/小程序/Emoji/名片/AppMsg、转发、撤回、下载媒体、查询记录 |
| `wekeapi-sns` | 朋友圈：时间线与好友朋友圈、详情、发布（文本/图文/视频/链接）、转发、可见范围、删除、点赞评论、下载 |
| `wekeapi-proxy` | 设备代理：获取/设置代理、检查城市代理可用性、省市与城市代码查询 |
| `wekeapi-core` | 基础模块：CLI二进制所在目录、全局参数约定、数据存储方式约定、各个模块Skill路由 |

## 与 wekeapi-cli 仓库的关系

本仓库**只有文档和二进制，没有源码**。`wekeapi-core/assets/bin/` 下的所有可执行文件都是源码仓库 [wekeapi-cli](https://github.com/wekeapi/wekeapi-cli.git) 编译出来的：

| 仓库 | 内容 | 面向 |
| --- | --- | --- |
| wekeapi-skills（本仓库） | `SKILL.md` 技能定义 + 编译好的二进制 | 只想让 Agent 直接干活的用户 |
| [wekeapi-cli](https://github.com/wekeapi/wekeapi-cli.git) | 主 CLI 与数据同步服务的 Go 源码、构建脚本、命令文档 | 想改代码、自建环境或自行编译的开发者 |

对 [wekeapi-cli](https://github.com/wekeapi/wekeapi-cli.git) 源码感兴趣的开发者，可以克隆 wekeapi-cli 仓库自行编译二进制文件；也欢迎参与 wekeapi-cli 项目，贡献自己的代码。

## 常见问题

- **Agent 说找不到 `wekeapi`**：确认 `wekeapi-core/assets/bin/` 里存在当前平台的 `wekeapi-<os>-<arch>[.exe]`，且 Linux/macOS 已 `chmod +x`。
- **AccessToken 在哪申请**：在 [wekeapi官网](https://www.wekeapi.com/) 注册并申请 AccessToken。
- **登录时账号限额已用完**：请到 [wekeapi官网](https://www.wekeapi.com/) 领取免费体验包或购买服务套餐。
