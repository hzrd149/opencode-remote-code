/** Opt-in: actual V2 HTTP client/RPC + private host + SSH agent + SFTP; no model calls. */
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { spawn, execFileSync } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import ssh2 from "ssh2"
import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { RemoteRuntime } from "../dist/rpc.js"
import { runCLI } from "../dist/cli.js"
import { startMockServer } from "./mock-ssh-server.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
await fs.mkdir(path.join(root, "tmp_test_artifacts"), { recursive: true })
const tmp = await fs.mkdtemp(path.join(root, "tmp_test_artifacts/cli-"))
const socket = path.join(tmp, "agent")
const key = path.join(tmp, "key")
const report = path.join(tmp, "report.json")
let agentPid, remote, child
try {
  execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key])
  const agent = execFileSync("ssh-agent", ["-s", "-a", socket], { encoding: "utf8" })
  agentPid = Number(/SSH_AGENT_PID=(\d+)/.exec(agent)[1])
  execFileSync("ssh-add", [key], { env: { ...process.env, SSH_AUTH_SOCK: socket }, stdio: "pipe" })
  remote = await startMockServer({ rootDir: path.join(tmp, "remote"), bashPath: "/bin/bash",
    authorizedKey: ssh2.utils.parseKey(await fs.readFile(key)) })
  await fs.writeFile(path.join(tmp, "remote/sentinel"), "REMOTE ONLY")
  await fs.mkdir(path.join(tmp, "config/opencode"), { recursive: true })
  await fs.writeFile(path.join(tmp, "config/opencode/opencode.json"), JSON.stringify({ plugins: [
    { package: root, options: { runtime: true, mirror: path.join(tmp, "mirror"), pool: { command: 1, file: 1 } } },
    path.join(root, "test/fixtures/runtime-probe"),
  ] }))
  child = spawn(process.env.OPENCODE_BIN ?? "opencode", ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
    cwd: tmp,
    env: { ...process.env, OPENCODE_DB: ":memory:", SSH_AUTH_SOCK: path.join(tmp, "wrong-service-agent"),
      XDG_CONFIG_HOME: path.join(tmp, "config"), XDG_DATA_HOME: path.join(tmp, "data"), XDG_STATE_HOME: path.join(tmp, "state"),
      RUNTIME_TEST_REPORT: report,
      OPENCODE_CONFIG_CONTENT: "{}",
    }, stdio: ["ignore", "pipe", "pipe"],
  })
  const endpoint = await new Promise((resolve, reject) => {
    let logs = ""
    const timer = setTimeout(() => reject(Error("Private host did not start")), 30000)
    const collect = data => {
      logs += data
      const url = logs.match(/server listening on (http:\/\/[^\s]+)/)?.[1]
      const password = logs.match(/server password ([^\s]+)/)?.[1]
      if (url && password) { clearTimeout(timer); resolve({ url, auth: { type: "basic", username: "opencode", password } }) }
    }
    child.stdout.on("data", collect)
    child.stderr.on("data", collect)
    child.once("error", error => { clearTimeout(timer); reject(error) })
    child.once("exit", code => { clearTimeout(timer); reject(Error(`Private host exited ${code}`)) })
  })
  const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
  const rpc = client.rpc(RemoteRuntime)
  const args = [`${remote.user}@${remote.host}`, "--port", String(remote.port), "--workdir", "/"]
  let attached = 0, sessionID, directory
  const deps = { home: tmp, env: { SSH_AUTH_SOCK: socket }, ensure: async () => endpoint, report() {},
    attach: async (actualEndpoint, dir, id) => {
      assert.deepEqual(actualEndpoint, endpoint)
      attached++; sessionID = id; directory = dir
      assert.equal((await rpc.status({ sessionID: id }, { location: { directory: dir } })).phase, "connected")
      return 7
    } }
  assert.equal(await runCLI(args, deps), 7)
  assert.equal(attached, 1)
  await fs.writeFile(path.join(directory, "sentinel"), "LOCAL ONLY")
  const probe = async () => {
    await client.session.command({ sessionID, name: "runtime-probe", text: JSON.stringify({ action: "tool", args: { path: "sentinel" } }) })
    return JSON.parse(await fs.readFile(report, "utf8"))
  }
  assert.match((await probe()).content, /REMOTE ONLY/)
  const resume = [...args, "--session", sessionID]
  await assert.rejects(runCLI(resume, deps), /already has a remote connection/)
  await rpc.disconnect({ sessionID }, { location: { directory } })
  assert.equal(await runCLI(resume, deps), 7)
  assert.equal(attached, 2)
  // Empty caller agent must fail even though the server is already running.
  await rpc.disconnect({ sessionID }, { location: { directory } })
  execFileSync("ssh-add", ["-D"], { env: { ...process.env, SSH_AUTH_SOCK: socket }, stdio: "pipe" })
  await assert.rejects(runCLI(resume, deps))
  assert.equal(attached, 2, "connect failure must not open the TUI")
  assert.equal((await rpc.status({ sessionID }, { location: { directory } })).phase, "failed")
  assert.match((await probe()).error, /blocked/)
  assert.equal(await runCLI([...resume, "--key", key], { ...deps, env: {} }), 7)
  assert.equal(attached, 3)
  const other = await client.session.create({ location: { directory: tmp } })
  await assert.rejects(runCLI([...args, "--session", other.id], deps), /another local target directory/)
  await rpc.disconnect({ sessionID }, { location: { directory } })
  console.log("PASS CLI real host: HTTP RPC, caller agent overrides stale service agent, SFTP routing, resume, key auth, failed connect blocks local fallback")
} finally {
  if (child && child.exitCode === null) { const exit = once(child, "exit"); child.kill("SIGTERM"); await exit }
  await remote?.close()
  if (agentPid) process.kill(agentPid, "SIGTERM")
  await fs.rm(tmp, { recursive: true, force: true })
}
