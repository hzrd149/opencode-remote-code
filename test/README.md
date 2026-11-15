# Test harness

The harness starts a local `ssh2.Server` with password authentication and real
SFTP operations. No external SSH target is needed. Build first: suites import
the compiled plugin from `dist/`.

```sh
npm run build
MOCK_SSH_BASH=/bin/bash npm test -- --dialect=posix  # Linux/macOS
npm test                     # both dialects; requires Windows + PowerShell
```

## Runner options

| Option | Effect |
| --- | --- |
| `--dialect=posix\|windows\|both` | Remote dialect matrix; default `both` |
| `--skip-slow` | Skip SSH pool lifecycle checks (~25 seconds) |
| `--skip-plugin` | Run unit and mock-server checks without plugin smoke tests |
| `--verbose` | Print SSH/SFTP requests and full child-suite output |

Unit suites run once; each requested dialect gets a fresh mock server and test
directory, server conformance checks, and its plugin smoke suite. The runner
prints PASS/FAIL/SKIP totals and exits nonzero on failure. Three POSIX-specific
server checks are skipped for Windows (stderr redirection, exit syntax and root
path semantics).

The mock defaults to Git for Windows Bash; set `MOCK_SSH_BASH` on other hosts.
Some unit assertions also assume Windows host paths and currently fail on Linux
(activation backslashes and simulated Windows long mirror paths).

Suites can also run individually, for example `node test/dialect.mjs`.

## Coverage

| Suites | Coverage |
| --- | --- |
| `remote-path`, `path-mapper` | POSIX/Windows paths, containment, mirror namespaces |
| `dialect` | Command encoding, staging, cleanup, output decoding |
| `glob-matcher`, `remote-walk` | Patterns, traversal/search budgets, SFTP errors |
| `config-activate`, `plugin-entry` | Activation scope, defaults, entry resolution |
| `ssh-pool-lifecycle` | Failed connections, queued waiters, cleanup and timers |
| `verify-mock-server` | Authentication, exec, SFTP round trips, path containment |
| `plugin-smoke`, `plugin-smoke-windows` | Plugin registration and remote tools |
| `spike-windows` | Standalone Windows transport checks; outside the runner |

## Mock filesystem and limitations

- `test/tmp/remote/` is the remote project; `local/` and `mirror/` hold client data.
  The runner deletes and recreates these fixtures. `test/.hostkey` caches the mock
  host key. Both locations are gitignored.
- Windows SFTP maps `/C:/Users/test/proj` into `test/tmp/remote/`; other drive
  paths go into `test/tmp/drive/`. Exec staging uses `test/tmp/exec-stage/`.
- Windows exec runs real PowerShell. `virtualExecPaths: true` rewrites virtual
  project paths in the mock's execution copy to local fixture paths.
- Exec is not sandboxed: absolute shell paths access the host filesystem.
  SFTP paths, in contrast, are mapped into the fixtures.
- Authentication is password-only (`testuser` / `testpass` by default).
- Permissions and ownership are simulated; filesystem case sensitivity depends
  on the host. SFTP implements a subset, without symlink creation or file locking.
- POSIX plugin smoke tests can report SKIP if the plugin cannot be imported;
  inspect skip reasons. Windows plugin smoke tests fail on missing builds.

Keep the native-exit-code regression assertion: channel event handlers must not
accidentally attach to `stream.stderr`, which loses the command's exit status.
