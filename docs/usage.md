# Usage and troubleshooting

[README](../README.md) · [Configuration](configuration.md)

## Per-session connections

Enable `"options": { "runtime": true }` in the global plugin entry as shown in
the [README](../README.md). In any session:

```text
/remote connect server.example
/remote status
/remote disconnect
/remote connect alice@server.example --port 2222 --workdir '/srv/my project'
```

Only the current session switches to remote tools. Disconnect before changing
targets. Failed or restored remote sessions block file/shell tools until you
reconnect or explicitly disconnect. Remote subagent delegation is disabled.

### Connection arguments

`/remote connect [user@]host [options]` and `remote-opencode [user@]host [options]`
accept these flags, each followed by a separate value:

| Flag | Default / behavior |
| --- | --- |
| `--user USER` | Local OS username; may instead be included in `user@host` |
| `--workdir PATH` | Remote login home, resolved through SFTP; relative paths resolve there |
| `--port PORT` | `22`; integer from 1 to 65535 |
| `--key PATH` | Local private key; `~` expands locally |
| `--agent-socket PATH` | Explicit local SSH-agent socket; cannot be combined with `--key` |
| `--help`, `-h` | Show usage, without connecting |
| `--session ID` | CLI only: reconnect an existing session belonging to the same target directory |

Without an explicit authentication flag, the slash command uses configured service
authentication (key, password, then agent). The CLI uses the calling terminal's
`SSH_AUTH_SOCK`; `--agent-socket` overrides it. If neither an agent nor a key is
available, the CLI fails before opening the UI. Passwords are accepted through
runtime RPC, not slash-command text or CLI flags.

Use a hostname, IPv4, or IPv6 address (`::1` or `alice@[::1]`). Specify ports with
`--port`, never `host:port`. SSH config aliases, URLs and full `ssh` commands are
not accepted here. Repeated flags and conflicting usernames are rejected.
The slash command supports single/double quotes and backslash escapes, without
shell evaluation or variable expansion. Prefer forward slashes for Windows paths,
for example `--workdir 'C:/My Project'`. In terminal commands, your shell processes
quoting before the CLI receives arguments. Legacy JSON slash-command targets
remain supported.

## Stable sessions and launchers

OpenCode associates sessions with the local working directory. Reuse the same
local directory to return to a remote project's sessions.

The runtime CLI connects before opening the UI:

```sh
node /absolute/path/to/opencode-remote-code/dist/cli-main.js server.example
# Installed executable:
remote-opencode alice@server.example --workdir /srv/project
```

It creates a stable directory under `~/.opencode/remote-sessions/` from the host,
port, user and workdir, then creates a session and connects through typed RPC.
Use `--session ID` to reconnect a disconnected session in that directory. Closing
the UI does not disconnect; `/remote disconnect` explicitly returns to local tools.

The older optional scripts in `launchers/` choose a stable directory under
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
3. In runtime mode, ensure `runtime: true` is set and run `/remote connect host`.
   For fixed targets, check `activateIn` against the **local** session directory,
   and ensure `ssh` or `host` is configured.
4. Use `/reload` if needed and open a real session. A config
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
- **Concurrent sessions:** runtime sessions have isolated mirrors. Fixed-target
  sessions for the same SSH identity/host/port share a mirror namespace, cleared
  at startup. Locks are per-session; concurrent edits to the same remote file
  can still overwrite each other.
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
