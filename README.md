# wekeapi-skills

wekeapi 的 **Agent 技能包仓库**：面向支持 Agent Skill 的 Agent 工具（Trae、Claude Code、DeepSeek Harness、OpenCode、Qoder 等），在 Agent 工具上安装 Skill，即可通过 AI 使用个微的交互能力；仓库已内置 Skills 需用到的多平台预编译二进制文件，**无需源码、无需构建、无需安装环境**。

## 安装方式

### 方式一：Agent 快速安装（推荐）

一句话版：（把这句话发给支持 Agent Skill 的 Agent，它会自己装好）
```
请从 github 仓库 https://github.com/wekeapi/wekeapi-skills.git 安装 wekeapi skills。
```
手把手指导版：
```
安装 wekeapi skills：

从 https://github.com/wekeapi/wekeapi-skills.git 克隆项目，并把克隆下来的 skills 安装到当前项目。

安装时 `wekeapi-core/assets/bin/` 只保留当前平台可用的两个二进制（`wekeapi-<os>-<arch>[.exe]` 与 `wekeapi-msg-sync-<os>-<arch>[.exe]`），其余的删掉；Linux/macOS 还要 `chmod +x` 这两个文件。
```

### 方式二：自行安装

把 wekeapi-skills 目录下的所有 Skill 复制到 Agent 对应的 skills 目录，例如 claude-code 的 `~/.claude/commands/`、opencode 的 `~/.config/opencode/skills`，即完成安装。注意 wekeapi-core/assets/bin 下面可执行文件也要一起安装，并确定有可执行权限。可以只保留你的电脑对应的 wekeapi 和 wekeapi-msg-sync 版本，其他的删掉。

## 开始使用

在 Agent 工具打开对话，告诉 AI “我要登录微信账号”，就可以开始和 AI 一起探索 wekeapi-skills 的功能
- wekeapi-skills 基于 wekeapi 提供的微信连接能力
- 支持**多账号登录**：每台机器可以登录多个微信账号，账号以 appId 区分；所有账号共用同一个 `wekeapi-msg-sync` 数据同步服务（同端口、同数据库，数据按账号隔离），用 `wekeapi account list` 查看、`--app-id` 选择账号；最后一次登录的账号为默认账号，可用 `wekeapi account use` 切换
- 使用过程中 AI 会提示你到 [wekeapi官网](https://www.wekeapi.com/) 申请访问凭证；你也可以自行到 [wekeapi官网](https://www.wekeapi.com/) 注册并提前准备好，它们是登录账号的前提
- 提前阅读 [wekeapi使用文档](https://doc.wekeapi.com/) 有助于你更好地理解 wekeapi 以便用好 wekeapi-skills


## 技能一览

| 技能 | 能力 |
| --- | --- |
| `wekeapi-login` | 多账号登录（登录另一个账号）、扫码登录、登录状态轮询、在线状态检查、免扫码快捷登录、退出登录，以及登录后的数据服务接管 |
| `wekeapi-contact` | 通讯录：好友列表/详情、同步、搜索、添加/同意/删除好友、备注、仅聊天、企微好友、手机通讯录 |
| `wekeapi-chatroom` | 群管理：建群、邀请/添加成员、踢人、转让群主、管理员、群公告、群名/备注/昵称、群二维码、解散/退出 |
| `wekeapi-label` | 标签：获取列表、添加、删除、修改好友标签 |
| `wekeapi-message` | 消息：发送文本/图片/视频/文件/语音/链接/小程序/Emoji/名片/AppMsg、转发、撤回、下载媒体、查询记录 |
| `wekeapi-sns` | 朋友圈：时间线与好友朋友圈、详情、发布（文本/图文/视频/链接）、转发、可见范围、删除、点赞评论、下载 |
| `wekeapi-proxy` | 设备代理：获取/设置代理、检查城市代理可用性、省市与城市代码查询 |
| `wekeapi-core` | 基础模块：CLI二进制所在目录、全局参数约定、多账号管理（查看账号/切换默认账号）、数据存储方式约定、各个模块Skill路由 |

## 与 wekeapi-cli 仓库的关系

本仓库**只有文档和二进制，没有源码**。`wekeapi-core/assets/bin/` 下的所有可执行文件都是源码仓库 [wekeapi-cli](https://github.com/wekeapi/wekeapi-cli.git) 编译出来的：

| 仓库 | 内容 | 面向 |
| --- | --- | --- |
| wekeapi-skills（本仓库） | `SKILL.md` 技能定义 + 编译好的二进制 | 只想让 Agent 直接干活的用户 |
| [wekeapi-cli](https://github.com/wekeapi/wekeapi-cli.git) | 主 CLI 与数据同步服务的 Go 源码、构建脚本、命令文档 | 想改代码、自建环境或自行编译的开发者 |

对 [wekeapi-cli](https://github.com/wekeapi/wekeapi-cli.git) 源码感兴趣的开发者，可以克隆 wekeapi-cli 仓库自行编译二进制文件；也欢迎参与 wekeapi-cli 项目，贡献自己的代码。


## 使用示例

以下案例都是直接在 Agent 对话框里发给 AI 的话，AI 会自动调用对应技能完成。

### 案例 1：登录微信

> 登录微信

AI 会引导你准备访问凭证、安装官方本地代理工具，然后展示登录二维码，扫码并在手机上确认即完成登录（默认 Mac 设备 + 自动验证 + 本地代理，除凭证、代理 ID、扫码与手机确认外全程无需用户干预）。

### 案例 2：发消息

> 给“文件传输助手”发消息：你好


### 案例 3：再登录一个账号

默认登录流程：

> 再登录一个账号

自定义登录流程：

> 再登录一个账号ipad登录，本地代理：pzqn-8277-2324

每个微信账号使用独立的 appId 登录，全部账号共用同一个 `wekeapi-msg-sync` 数据同步服务（同端口、同数据库，数据按账号隔离）；新登录的账号自动成为默认账号，之前登录的账号不受影响。

不指定账号时，使用**默认账号**发送；**最后一次登录的账号即为默认账号**。

查看当前登录的所有账号：

> 查看当前登录的所有账号


切换默认账号（xxxx 为要切换的账号，微信名、微信号均可）：

> 切换默认账号为xxxx


指定某个微信账号给联系人发消息：

> 用"微信一号"给“文件助手”发消息：今晚老地方见面细聊



### 案例 4：监听微信消息并回复

> 需要你在会话内实时监听所有已登陆账号收到的消息，收到消息以聊天的口吻，进行回复。


接收消息依赖 wekeapi 平台的消息回调：AI 会先引导你把本机回调接口映射到公网，并到 wekeapi 管理后台绑定回调地址（多账号共用同一个回调地址，服务按回调里的 appId 分发到对应账号）。配置完成后新消息实时入库，AI 在当前会话内持续读取新消息并逐条回复。
## 常见问题

- **Agent 说找不到 `wekeapi`**：确认 `wekeapi-core/assets/bin/` 里存在当前平台的 `wekeapi-<os>-<arch>[.exe]`，且 Linux/macOS 已 `chmod +x`。
- **访问凭证在哪申请**：在 [wekeapi官网](https://www.wekeapi.com/) 注册并申请访问凭证。
- **登录时账号限额已用完**：账号额度按访问凭证套餐计算，全部登录账号共用同一凭证与额度；请到 [wekeapi官网](https://www.wekeapi.com/) 购买服务套餐、扩充账号额度。

## 支持

请直接提 issue 或联系 `+v weke_820528`