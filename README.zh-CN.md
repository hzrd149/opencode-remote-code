# Remote Code

[English](README.md)

通过 SSH 使用 OpenCode 操作远程机器。插件将 `shell`、`glob`、`grep`、
`read`、`write`、`edit` 和 `patch` 指向远端：命令通过 SSH 执行，文件工具
通过 SFTP 操作。远端无需安装 Agent。

## 环境要求

- OpenCode V2，兼容 [package.json](package.json) 中的 `@opencode/plugin` 版本。
- 插件的 Node 运行环境及测试需要 Node.js 20+。
- 远端提供 SSH、SFTP 和 POSIX shell；Windows 远端需 OpenSSH for Windows
  和 PowerShell 5.1/7。远端无需 Node.js、Python、Git 或 ripgrep。

## 快速开始

使用 `package.json` 固定的 pnpm 版本构建本地源码：

```sh
git clone https://github.com/hzrd149/opencode-remote-code.git
cd opencode-remote-code
pnpm install --frozen-lockfile
pnpm run build
```

在 `opencode.jsonc` 中添加以下配置，替换路径及连接信息：

```jsonc
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-remote-code",
      "options": {
        "ssh": "ssh user@192.0.2.10",
        "key": "~/.ssh/id_ed25519",
        "workdir": "/home/user/project",
        "activateIn": "~/.opencode/remote-sessions"
      }
    }
  ]
}
```

在激活范围内创建本地会话目录，并从该目录启动 OpenCode：

```sh
mkdir -p ~/.opencode/remote-sessions/project
cd ~/.opencode/remote-sessions/project
opencode
```

修改配置后，请重启已运行的 OpenCode 服务。本分支发布后，可将本地源码路径
替换为包名 `@hzrd149/opencode-remote-code`。

## 重要行为

- **激活后，远程工具替代本地工具。** `activateIn` 匹配本地会话目录；
  范围外仍使用本地工具。省略此项时，配置的远程目标在所有目录中生效。
- `workdir` 是**远程**路径，默认是 SSH 用户的主目录；相对路径和 `~` 均
  相对于该目录解析。Windows 绝对路径必须带盘符，例如 `C:/Users/me/project`。
- 使用 `key` 或 `password` 认证。`ssh` 字符串仅被解析，不会直接执行，
  也不支持完整的 OpenSSH 命令行行为。
- 文件按需镜像到本地。不支持远程 LSP；SFTP 搜索可能比服务器上的 ripgrep 慢。
- 建议每个目标只使用一个会话，避免共享镜像冲突。目前 `patch` 的删除块会
  清空文件而非删除文件；需要删除时使用 `shell`。

## 文档

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
