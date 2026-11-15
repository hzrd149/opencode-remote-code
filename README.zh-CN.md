# Remote Code

[English](README.md)

通过 SSH 使用 OpenCode 操作远程机器。插件将 `shell`、`glob`、`grep`、
`read`、`write`、`edit` 和 `patch` 指向远端：命令通过 SSH 执行，文件工具
通过 SFTP 操作。远端无需安装 Agent。

**在 OpenCode 全局配置中安装一次，即可用 `/remote connect` 将当前会话切换到 SSH。**
其他会话仍使用本地工具；用 `/remote disconnect` 切回本地。

## 环境要求

- OpenCode 2.2.7+（需要 V2 指令来源元数据），兼容 [package.json](package.json) 中的 `@opencode/plugin` 版本。
- 插件的 Node 运行环境及测试需要 Node.js 20+。
- 远端提供 SSH、SFTP 和 POSIX shell；Windows 远端需 OpenSSH for Windows
  和 PowerShell 5.1/7。远端无需 Node.js、Python、Git 或 ripgrep。

## 快速开始：全局安装，按会话连接

### 1. 构建插件

该 scoped npm 包尚未发布。使用 `package.json` 固定的 pnpm 版本构建本地源码：

```sh
git clone https://github.com/hzrd149/opencode-remote-code.git
cd opencode-remote-code
pnpm install --frozen-lockfile
pnpm run build
```

### 2. 全局启用

在 **`~/.config/opencode/opencode.jsonc`** 中的 `plugins` 添加以下条目
（设置了 `XDG_CONFIG_HOME` 时使用 `$XDG_CONFIG_HOME/opencode/opencode.jsonc`）。
将路径替换为已构建源码的绝对路径，并保留其他配置：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-remote-code",
      "options": { "runtime": true }
    }
  ]
}
```

这样即可在各个项目中使用 `/remote`。会话初始使用本地工具，连接前不会建立 SSH。
此全局运行时配置不要设置 `ssh`、`host` 或 `activateIn`。
OpenCode 会自动重新加载配置，必要时使用 `/reload`。

### 3. 将当前会话切换到 SSH

在通常的项目目录打开 OpenCode，或使用已有会话，输入：

```text
/remote connect server.example
/remote status
```

连接后，**当前会话**的文件和 shell 工具在远端执行。用户名默认为运行 OpenCode
服务的本地操作系统用户，工作目录默认为通过 SFTP 获取的远端登录主目录。
其他会话不受影响。若需指定用户、项目和私钥，先断开再连接：

```text
/remote disconnect
/remote connect alice@server.example --workdir /srv/project --key ~/.ssh/id_ed25519
```

在同一会话继续聊天即可操作远端。切回本地：

```text
/remote disconnect
```

更换目标时先断开，再执行新的 `/remote connect`。Windows 工作目录可以使用
`C:/Users/alice/project`。省略 `--key` 时使用 OpenCode 服务可访问的 SSH agent，
也可通过 `--agent-socket /path/to/agent` 显式指定。两者不能同时使用。
`--user alice` 可指定用户名，`--port 2222` 可指定端口（默认 22）。
含空格的路径需加引号，例如 `--workdir 'C:/My Project'`。
IPv6 可使用 `alice@[::1]`；端口必须单独用 `--port`，不支持 `host:port`。
参数支持引号和反斜杠转义，不执行 shell 或变量展开；Windows 路径建议使用正斜杠。
`/remote connect --help` 显示帮助。密码只能通过运行时 RPC 传递，不能放入命令文本。
发布后可将 `package` 路径替换为 `@hzrd149/opencode-remote-code`，保留
`"options": { "runtime": true }`。

## 重要行为

- 终端也可运行 `node /absolute/path/to/opencode-remote-code/dist/cli-main.js server.example`。
  安装后的命令名为 `remote-opencode`，使用相同的连接参数，并支持 `--session ID`。
  CLI 捕获调用终端的 `SSH_AUTH_SOCK`（可用 `--agent-socket` 覆盖），创建稳定的本地
  会话目录，通过 RPC 连接后打开界面；无需模型调用。详细参数见[使用指南](docs/usage.md#connection-arguments)。
- 连接中断、失败或服务重启后，远程会话的文件与 shell 工具会阻止执行，直到重新连接
  或显式断开；不会静默切回本地。远程会话禁用子 agent 委派。
- **运行时模式按会话切换。** 若需固定目标，可省略 `runtime` 并在插件选项中配置
  `ssh`/`host`。该模式的 `activateIn` 匹配本地会话目录；省略时固定目标在所有目录生效。
- `workdir` 是**远程**路径，默认是 SSH 用户的主目录；相对路径和 `~` 均
  相对于该目录解析。Windows 绝对路径必须带盘符，例如 `C:/Users/me/project`。
- 认证优先级为 `key`、`password`、本地 SSH agent（`agentSocket` 或服务的
  `SSH_AUTH_SOCK`），不启用 agent 转发。`ssh` 字符串仅被解析，不会直接执行，
  也不支持完整的 OpenSSH 命令行行为。
- 文件按需镜像到本地。不支持远程 LSP；SFTP 搜索可能比服务器上的 ripgrep 慢。
- 运行时会话的镜像相互隔离，固定目标会话共享镜像；避免同时编辑同一远端文件。
  目前 `patch` 的删除块会
  清空文件而非删除文件；需要删除时使用 `shell`。

## 文档

### 远程指令

保留 OpenCode 模型提示词、自定义 agent、skills、Code Mode、MCP 和会话指令。
仅替换 `core/environment` 和 `core/instructions`：后者整体替换为启动时读取的
远程根目录 `AGENTS.md`，包括替换本地全局及配置的指令文件。通用规则可放入自定义
agent 指令。不会自动发现远程子目录指令。generate/compaction 请求含有这些来源时
也会更新，title 请求不受影响。历史记录不变，可能仍包含旧的本地指令更新；远程
上下文会明确区分。不再内置模型提示词模板。

以下参考文档使用英文维护：

- [配置参考](docs/configuration.md)：选项、SSH 语法、路径和搜索限制。
- [使用与故障排查](docs/usage.md)：启动器、安装、工具行为及限制。
- [测试指南](test/README.md)：测试命令、覆盖范围和平台要求。

## 开发

通过 `nvm use` 选择默认开发 Node 版本，使用 `package.json` 固定的 pnpm 版本。
在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run lint
MOCK_SSH_BASH=/bin/bash pnpm test --dialect=posix
```

测试通过 Node + `tsx` 运行；Windows 集成测试需要 Windows 和 PowerShell。
平台要求与运行选项见[测试指南](test/README.md)。

## 来源与许可

Fork 自 [vibed-this/opencode-remote-code](https://github.com/vibed-this/opencode-remote-code)，
后者 Fork 自 [zz6zz666 的原始 OpenCode V1 插件](https://github.com/zz6zz666/opencode-remote-code)。
发布包名：`@hzrd149/opencode-remote-code`。许可：MIT。
