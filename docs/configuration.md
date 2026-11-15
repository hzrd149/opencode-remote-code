# Configuration

[README](../README.md) · [Usage and troubleshooting](usage.md)

Configure the remote through `plugins[].options` in `opencode.jsonc`. Without
`ssh` or `host`, the plugin stays dormant. Invalid target configuration is
reported and leaves OpenCode running without the remote tools.

## Options

Use these canonical names. Compatibility aliases are listed in
[`OPTION_KEYS`](../src/config.ts).

| Option | Default | Purpose |
| --- | --- | --- |
| `ssh` | — | Parsed SSH command string; alternative to `host` |
| `host` | — | Remote hostname or IP |
| `port` | `22` | SSH port |
| `user` | Local OS username | Remote username |
| `key` | — | Local private-key file; expands `~` |
| `password` | — | Password authentication; a configured key takes precedence |
| `workdir` | Remote login home | Default remote working directory |
| `platform` | `"auto"` | `"auto"`, `"posix"`, or `"windows"` |
| `shell` | Auto-selected | `bash` on POSIX; `pwsh.exe` if found, otherwise `powershell.exe` on Windows |
| `activateIn` | `[]` (everywhere) | Local directory or array of directories in which to activate |
| `mirror` | `~/.opencode/mirrors` | Local mirror root |
| `debug` | `false` | Append diagnostics to `~/.opencode/remote-code-debug.log` |
| `ignore` | `[]` | Extra directory names to exclude from traversal |
| `limits` | See below | Search, traversal, and shell budgets |
| `timeout` | `120000` ms | Default shell timeout; overrides `limits.shellTimeout` |
| `pool` | `{ "command": 3, "file": 4, "stagger": 0 }` | Command/file connection counts and handshake stagger in milliseconds |

### Activation scope

`activateIn` refers to **local session directories**, not remote paths. It
accepts a string or array, expands `~`, and includes descendants of each directory.
Matching respects directory boundaries and is case-insensitive on Windows hosts.

```jsonc
"activateIn": ["~/.opencode/remote-sessions", "/home/me/remote-work"]
```

Outside the scope, or when the session directory is unavailable, the plugin is
dormant. An absent or empty scope activates it everywhere a target is configured.
Active sessions replace all seven native tools; they do not get a second set of
local file tools.

## SSH connection

Prefer explicit connection and authentication settings:

```jsonc
"options": {
  "host": "192.0.2.10",
  "port": 2222,
  "user": "me",
  "key": "~/.ssh/id_ed25519",
  "workdir": "/home/me/project"
}
```

Alternatively, set `ssh` to `"ssh -p 2222 -i ~/.ssh/id_ed25519 me@192.0.2.10"`.
The string is parsed by the plugin; connections use `ssh2`, not a local `ssh`
process. Conflicting host, port, user, or identity values between the two forms
are rejected.

| Syntax | Meaning |
| --- | --- |
| `user@host`, `host`, `user@[::1]` | Target |
| `-p 2222`, `-p2222`, `--port=2222` | Port |
| `-i <path>`, `--identity <path>` | Identity file |
| `-l user`, `-luser` | Username |
| `ssh://user@host:2222` | URL form; embedded passwords are rejected |
| Single/double quotes | Paths containing spaces; unquoted backslashes remain literal |

An optional `ssh` executable name/path is discarded. `ssh_config` is not read;
`-F` does not load it. Use explicit hosts and credentials rather than relying on
SSH aliases or agent configuration.

The parser accepts `-o` keys `StrictHostKeyChecking`, `UserKnownHostsFile`,
`ConnectTimeout`, `ServerAliveInterval`, `ServerAliveCountMax`, `HostKeyAlgorithms`,
and `IdentitiesOnly`. **Acceptance does not imply OpenSSH-equivalent behavior:**
the current connection pool applies host-key algorithms and the explicit
`StrictHostKeyChecking=no` setting, but does not implement known-hosts verification
or wire the other accepted settings into its connection configuration. Unknown
`-o` keys produce a warning and are ignored.

Jump hosts/proxy commands (`-J`, `ProxyJump`, `ProxyCommand`), forwarding
(`-L`, `-R`, `-D`), and PTY requests (`-t`, `RequestTTY`) are rejected. For a
jump host, establish a tunnel separately and connect the plugin to its local port:

```sh
ssh -N -L 2222:target-host:22 jump-user@jump-host
```

Then use `host: "127.0.0.1"` and `port: 2222`. Operations run with the SSH user's
permissions; the removed `sudoPassword` option does not enable privilege escalation.

## Platforms and paths

The plugin detects the remote platform from SFTP's login-home path. Set
`platform` explicitly if a chroot or unusual SFTP server makes detection ambiguous.

| `workdir` | POSIX | Windows |
| --- | --- | --- |
| Omitted | Login home | Login home |
| `proj`, `src/app`, `~`, `~/proj` | Relative to login home | Relative to login home |
| `/home/me/project` | Absolute path | Rejected: no drive letter |
| `C:/Users/me/project` | Not a POSIX absolute path | Absolute path |
| `C:project` | Not a POSIX absolute path | Rejected: drive-relative path |

Use forward slashes in JSON Windows paths to avoid escaping backslashes.
PowerShell is selected automatically on Windows; POSIX defaults to `bash`.

## Search limits and ignores

Set individual values inside `limits`; unspecified values retain their defaults.
Values must be positive numbers (numeric strings are also accepted).

| Key | Default | Applies to |
| --- | --- | --- |
| `globResults` | `100` | Glob results |
| `searchMatches` | `100` | Grep matches |
| `searchBytes` | `67108864` (64 MiB) | Total bytes searched |
| `searchFileSize` | `2097152` (2 MiB) | Largest file searched |
| `searchMillis` | `45000` | Search/traversal time in milliseconds |
| `walkDepth` | `12` | Traversal depth |
| `walkEntries` | `20000` | Directory entries visited |
| `shellTimeout` | `120000` | Shell timeout in milliseconds |

`ignore` **extends** the built-in directory-name exclusions; it does not replace
them or accept gitignore rules. Names match at any depth, case-insensitively only
on Windows remotes. Defaults:

```text
node_modules .git .hg .svn dist build out target .venv venv vendor
__pycache__ .next .cache .turbo $RECYCLE.BIN System Volume Information
Windows.old .pnpm-store .Trash
```

Results include truncation notices when budgets are reached. Narrow the search
root/pattern before raising limits on large remote trees.
