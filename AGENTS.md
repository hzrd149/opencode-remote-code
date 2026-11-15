# Remote Code — contributor guide

OpenCode V2 plugin (`@opencode/plugin` ^2.1.2) providing SSH-backed tools for
POSIX and Windows remotes. See `README.md` for configuration and usage and
`test/README.md` for the test harness.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run lint
pnpm test
npm pack --dry-run
```

`pnpm test` builds before testing: suites import `dist/`. `pnpm run build` also copies prompt
fragments via `scripts/postbuild.ts`; running `tsc` alone is insufficient.
Windows integration tests require Windows with PowerShell; `pnpm test` exercises
both dialects there and POSIX on Linux/macOS. Build first when running individual
suites directly. See the test guide for host requirements.

## Architecture and invariants

- `src/index.ts`: plugin setup, tool registration, context hook, cleanup.
- `src/config.ts`: plugin options only. No target means dormant with no side
  effects. Invalid configuration must not crash OpenCode. `activateIn` scopes
  activation to local session directories with boundary-safe matching.
- `src/platform/`: all remote path, shell, decoding and detection knowledge.
  Canonical paths are absolute and slash-separated, with drive letters on Windows.
- `src/remote/`: SFTP filesystem, bounded traversal, glob matching and search.
- `src/mirror/`: per-file local mirror and manifest; never sync whole trees.
- `src/tools/`: seven native-name overrides: `shell`, `glob`, `grep`, `read`,
  `write`, `edit`, `patch`. Only `shell` executes remote commands; file tools use
  SFTP. Keep platform assumptions out of tools and mirror code.
- `src/v2-bridge.ts`: permission requests; edits include diff previews.
- `launchers/`: stable local session directories, not remote configuration.

Keep the remote dependency-free beyond SSH and its shell. Preserve BOMs and line
endings, per-path locking, traversal budgets and explicit truncation notices.
Never log passwords or private-key paths.

## Compatibility details

- Keep the root `index.js` shim: local plugin discovery needs it.
- Tool registration callbacks are synchronous; tool execution may be async.
  Cleanup must dispose registrations and close SSH pools.
- Windows scripts use UTF-16LE base64 `-EncodedCommand`, with oversized scripts
  staged over SFTP and removed in `finally`. Do not indent user script bodies:
  PowerShell here-string terminators must remain at column zero.
- Preserve PowerShell's plain-stderr catch, native exit-code propagation and
  absence of a trailing `exit 0` (which can discard formatted output on PS 5.1).
- SSH channel `close`/`error` handlers belong on the channel, not `stream.stderr`.
- Patch delete hunks currently empty files rather than unlinking them. Treat a
  change to this behaviour as a separate functional change.
- Concurrent sessions share mirror namespaces; session startup clears the mirror.

## Repository hygiene

Keep user-facing documentation in the READMEs and implementation rationale near
the code. Avoid standalone migration diaries and generated planning reports.
Use `tmp_test_artifacts/` for scratch work; `test/tmp/` is disposable harness data.
The npm `files` allowlist controls the release payload; `prepack` rebuilds it.
