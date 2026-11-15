# Changelog

Notable changes to `@hzrd149/opencode-remote-code` since the personal fork of
[vibed-this/opencode-remote-code](https://github.com/vibed-this/opencode-remote-code).
The fork starts after upstream commit
[`1c28420`](https://github.com/hzrd149/opencode-remote-code/commit/1c28420)
(version 3.0.1). Earlier features, including the OpenCode V2 port, Windows support,
and `activateIn`, belong to upstream history.

## Unreleased

These entries cover the first scoped npm release, including current working-tree
changes. The inherited `package.json` version is not a published fork release.
When publishing, replace this heading with the release version and date, and
start a new `Unreleased` section for subsequent changes.

### Added

- Optional per-session SSH connections with `runtime: true` and `/remote connect`,
  `/remote status`, and `/remote disconnect`. Install globally while keeping other
  sessions local.
- Typed runtime RPC, exported through the package's `/rpc` entry point, for
  programmatic connection management and credentials outside command text.
- Session-isolated runtime mirrors and routing. Failed or restored remote
  sessions block local tool fallback until reconnect or explicit disconnect;
  stale tool calls are rejected after target changes.
- The `remote-opencode` CLI to create or attach to local OpenCode sessions backed
  by SSH, using stable local session directories and the caller's SSH agent.
- Local SSH-agent authentication through `agentSocket` or `SSH_AUTH_SOCK`, with
  explicit keys and passwords taking precedence. Agent forwarding stays disabled.
- A `pnpm dev` launcher for the local plugin build with a private OpenCode server,
  interactive connection setup, and CLI-compatible target arguments.

### Changed

- Prepare publication as the public scoped package `@hzrd149/opencode-remote-code`,
  with fork-specific repository, issue tracker, and package links.
- Preserve OpenCode's native model prompts, custom agents, skills, Code Mode,
  MCP guidance, and session instructions. Replace only the keyed environment and
  discovered-file instruction sources with remote context and root `AGENTS.md`.
- Require OpenCode 2.2.7+ for instruction-source metadata and align the plugin and
  client dependencies with that API.
- Migrate development and test tooling to pnpm and TypeScript with `tsx`; default
  development to Node.js 26 while retaining Node.js 20+ support.
- Streamline the English and Chinese READMEs, move configuration and usage
  references into `docs/`, and document global setup and per-session connections.
- Limit npm contents to release assets and rebuild before packing. Include this
  changelog in the published package.

### Fixed

- Avoid replacing OpenCode's complete prompt with bundled templates, including
  during generation and compaction; leave title prompts and stored history intact.
- Correct runtime tool-result compatibility with OpenCode: content-only file
  tools no longer inherit native output codecs, and shell results provide the
  structured completion output and metadata expected by the host.
- Make the test harness portable across local hosts, including platform-aware
  paths, shell selection, and Windows integration-test requirements.

### Removed

- Bundled model prompt templates and their build-time copying step.
- Historical migration and design documents superseded by the maintained READMEs
  and implementation comments.

### Tests

- Add coverage for SSH-agent authentication, runtime routing and isolation,
  targeted instruction replacement, and CLI parsing and attachment.
- Add opt-in real OpenCode host tests for runtime and CLI connections, including
  a local fake model exercising remote tools through the host's tool pipeline.

[Fork commit history](https://github.com/hzrd149/opencode-remote-code/compare/1c28420...main)
