# Usage and troubleshooting

[README](../README.md) · [Configuration](configuration.md)

## Stable sessions and launchers

OpenCode associates sessions with the local working directory. Reuse the same
local directory to return to a remote project's sessions.

The optional scripts in `launchers/` choose a stable directory under
`~/.opencode/remote-sessions/`, derived from the host and remote workdir:

```sh
bash launchers/remote-opencode.sh --ssh "ssh me@192.0.2.10" --workdir /home/me/project
```

On Windows, use the PowerShell launcher (a `.bat` wrapper is also provided):

```powershell
.\launchers\remote-opencode.ps1 --ssh "ssh me@192.0.2.10" --workdir C:/Users/me/project
```

These arguments **only name the local session directory**. Configure the actual
connection in `opencode.jsonc`; keep the launcher values consistent with it.
Pair launchers with `activateIn: "~/.opencode/remote-sessions"` to keep other
local projects using native tools. Other arguments are forwarded to OpenCode;
`--` explicitly separates forwarded arguments. Legacy `REMOTE_SSH` and
`REMOTE_WORKDIR` environment variables also supply directory-naming values.

## Local installation troubleshooting

If the plugin appears inactive:

1. Build the checkout and use its **absolute path** in `plugins[].package`.
   Keep the root `index.js` shim alongside `dist/`; local discovery uses it.
2. Use an object entry with `package` and `options`. Auto-discovery alone does
   not supply connection options, so the plugin remains dormant.
3. Check `activateIn` against the **local** session directory, and ensure `ssh`
   or `host` is configured.
4. Restart OpenCode or its background service and open a real session. A config
   inspection command alone does not establish that the plugin has loaded.
5. Enable `options.debug` and inspect `~/.opencode/remote-code-debug.log`.

For a stable local install, keep a built checkout near your OpenCode configuration
and reference it explicitly. Avoid also placing it in an auto-discovered plugins
directory, which can result in duplicate loading. If a Windows installation on
another drive fails discovery, try a checkout on the same drive as the config;
cross-drive behavior can depend on the OpenCode version.

## Tool behavior

Only `shell` executes remote commands. All other tools use SFTP; reads and edits
mirror individual files locally rather than copying a whole project.

| Tool | Details worth knowing |
| --- | --- |
| `shell` | Uses the remote shell and workspace by default; reports timeouts separately from nonzero exit codes. No interactive PTY. |
| `glob` | Supports `*`, `?`, `**`, braces, and character classes. Patterns without `/` match basenames; results are newest-first. |
| `grep` | Uses JavaScript regular expressions, not ripgrep's regex engine. Leading `(?i)`, `(?m)`, and `(?s)` flags are accepted; `include` is a glob. |
| `read` | Lists directories or reads text; rejects binary files. Default output is bounded to 2,000 lines and 50 KB. |
| `write`, `edit` | Preserve existing line endings and BOMs; edits use per-file locks and permission previews. |
| `patch` | Accepts native patch format and unified diffs. Moves rename remotely; delete hunks currently empty the file. |

Search limits and ignored directories are configurable in the
[configuration reference](configuration.md#search-limits-and-ignores).

## Limitations

- **No remote LSP:** remote file tools do not supply language-server diagnostics.
- **Transfer/search cost:** first access transfers the file over SFTP; searching
  large trees can be slower than native server-side tools. Use narrow paths.
- **Concurrent sessions:** sessions for the same SSH identity/host/port share a
  local mirror namespace, which is cleared at startup. Locks are per-session;
  use one session per target to avoid conflicts and last-write-wins overwrites.
- **Patch deletion:** delete hunks empty files instead of unlinking them. Use
  `shell` for actual deletion.
- **Windows output:** mixed UTF-8 and CP936/GBK in one stream may decode poorly.
  UNC paths are best-effort and have not been verified against a real SMB-backed
  OpenSSH server.
- **Server compatibility:** shell results rely on SSH channel exit codes. Older
  servers need validation; no server-version check enforces an OpenSSH 8 floor.
  The current algorithm list includes `ssh-rsa`, contrary to older documentation.

## Local data and remote permissions

Mirrored files live under `~/.opencode/mirrors` unless configured otherwise.
Treat those copies as local copies of the remote data. Mirror containment checks
prevent mapped paths from escaping their namespace; paths outside the remote
workspace go through OpenCode's permission system.

Commands and file operations use the SSH account's permissions. No remote agent
is installed, but commands can change remote state; oversized PowerShell scripts
are temporarily staged over SFTP and removed afterward. Debug logging omits
passwords and private-key paths. See the [SSH reference](configuration.md#ssh-connection)
for the current host-verification and option-handling limitations.
