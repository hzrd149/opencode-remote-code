# Remote Code

[中文](README.zh-CN.md)

Use OpenCode to work on a remote machine over SSH. The plugin redirects `shell`,
`glob`, `grep`, `read`, `write`, `edit`, and `patch` to the remote target. Commands
run over SSH; file tools use SFTP. No remote agent installation is required.

## Requirements

- OpenCode 2.2.7+ (V2 instruction-source metadata is required), compatible with the `@opencode/plugin` version in [package.json](package.json).
- Node.js 20+ for the plugin's Node runtime and tests.
- A remote SSH server with SFTP and a POSIX shell, or OpenSSH for Windows with
  PowerShell 5.1/7. No remote Node.js, Python, Git, or ripgrep is needed.

## Quick start

Build a local checkout using the pnpm version pinned in `package.json`:

```sh
git clone https://github.com/hzrd149/opencode-remote-code.git
cd opencode-remote-code
pnpm install --frozen-lockfile
pnpm run build
```

Add an entry to `opencode.jsonc`, replacing the paths and connection details:

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

Create a local session directory inside that scope and start OpenCode there:

```sh
mkdir -p ~/.opencode/remote-sessions/project
cd ~/.opencode/remote-sessions/project
opencode
```

Restart an existing OpenCode service after changing its configuration. Once this
fork is published, the package name will be `@hzrd149/opencode-remote-code`;
use that in place of the local checkout path.

## Important behavior

- **Active sessions use remote tools instead of local tools.** `activateIn`
  matches local session directories; outside that scope, local tools remain
  available. Omit it to activate the configured target everywhere.
- `workdir` is a **remote** path. It defaults to the SSH user's home; relative
  paths and `~` resolve there. Windows absolute paths need a drive letter, such
  as `C:/Users/me/project`.
- Authentication uses `key` or `password`. The `ssh` string is parsed, not
  executed, and does not provide full OpenSSH command-line behavior.
- Remote files are mirrored locally as needed. There is no remote LSP, and
  SFTP searches can be slower than running ripgrep on the server.
- Use one session per target to avoid shared-mirror conflicts. Currently,
  `patch` delete hunks empty files rather than remove them; use `shell` to delete.

## Documentation

### Remote instructions

OpenCode's model prompts, custom agents, skills, Code Mode, MCP guidance and session
instruction entries are preserved. The plugin replaces `core/environment` with remote
OS/shell/workspace details and `core/instructions` with the remote root `AGENTS.md`,
read once at setup. This replaces the entire discovered-file source, including local
global/configured instruction files; use custom agent instructions for shared policies.
Nested remote instruction discovery is not automatic. Generate/compaction requests
receive the same edits when they contain these sources; title prompts are untouched.
Stored history is unchanged, so old local instruction updates can remain in the transcript;
the remote context explicitly distinguishes them. No model prompt templates are bundled.

- [Configuration](docs/configuration.md): options, SSH syntax, paths, search limits.
- [Usage and troubleshooting](docs/usage.md): launchers, installation, tool behavior,
  and limitations.
- [Test harness](test/README.md): test commands, coverage, and platform requirements.

## Development

Use `nvm use` for the default development Node version and the pnpm version in
`package.json`. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run lint
MOCK_SSH_BASH=/bin/bash pnpm test --dialect=posix
```

Tests use Node + `tsx`; Windows integration tests need Windows and PowerShell.
See the [test guide](test/README.md) for platform requirements and runner options.

## Attribution and license

Forked from [vibed-this/opencode-remote-code](https://github.com/vibed-this/opencode-remote-code),
which forked [zz6zz666's original OpenCode V1 plugin](https://github.com/zz6zz666/opencode-remote-code).
Published package name: `@hzrd149/opencode-remote-code`. License: MIT.
