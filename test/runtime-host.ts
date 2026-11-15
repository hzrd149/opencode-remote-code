/** Opt-in real V2 host + real SSH/SFTP test; no model calls or user config edits. */
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import { startMockServer } from "./mock-ssh-server.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
await fs.mkdir(path.join(root, "tmp_test_artifacts"), { recursive: true })
const tmp = await fs.mkdtemp(path.join(root, "tmp_test_artifacts/runtime-"))
const report = path.join(tmp, "report.json")
const remote = await startMockServer({ rootDir: path.join(tmp, "remote"), bashPath: "/bin/bash" })
await fs.writeFile(path.join(tmp, "remote", "sentinel"), "REMOTE ONLY")
await fs.writeFile(path.join(tmp, "sentinel"), "LOCAL ONLY")
const child = spawn(process.env.OPENCODE_BIN ?? "opencode", ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
  cwd: tmp,
  env: { ...process.env, OPENCODE_DB: ":memory:", XDG_CONFIG_HOME: path.join(tmp, "config"),
    XDG_DATA_HOME: path.join(tmp, "data"), XDG_STATE_HOME: path.join(tmp, "state"),
    RUNTIME_TEST_REPORT: report,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugins: [
      { package: root, options: { runtime: true, password: remote.password, mirror: path.join(tmp, "mirror"), pool: { command: 1, file: 1 } } },
      path.join(root, "test/fixtures/runtime-probe"),
    ] }),
  }, stdio: ["ignore", "pipe", "pipe"],
})
let logs = ""
try {
  const { url, password } = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Private host did not start")), 30000)
    const collect = data => {
      logs += data
      const url = logs.match(/server listening on (http:\/\/[^\s]+)/)?.[1]
      const password = logs.match(/server password ([^\s]+)/)?.[1]
      if (url && password) { clearTimeout(timer); resolve({ url, password }) }
    }
    child.stdout.on("data", collect)
    child.stderr.on("data", collect)
    child.once("error", error => { clearTimeout(timer); reject(error) })
    child.once("exit", code => { clearTimeout(timer); reject(Error(`Private host exited ${code}`)) })
  })
  const request = async (endpoint, body) => {
    const response = await fetch(url + endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from("opencode:" + password).toString("base64") },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    })
    const text = await response.text()
    assert(response.ok, `${response.status}: ${text}`)
    return text ? JSON.parse(text) : undefined
  }
  const create = async () => (await request("/api/session", { location: { directory: tmp }, title: "Runtime integration" })).data.id
  const a = await create(), b = await create()
  const command = async (id, input) => {
    await request(`/api/session/${id}/command`, { name: "runtime-probe", text: JSON.stringify(input) })
    return JSON.parse(await fs.readFile(report, "utf8"))
  }
  const target = { host: remote.host, port: remote.port, user: remote.user, password: remote.password, workdir: "/" }
  assert.equal(await command(a, { action: "capture" }), "captured")
  const connected = await command(a, { action: "connect", target })
  assert.equal(connected.phase, "connected", JSON.stringify(connected))
  assert.match((await command(a, { action: "stale", args: { path: "sentinel" } })).error, /Target changed/)
  assert.match((await command(a, { action: "tool", args: { path: "sentinel" } })).content, /REMOTE ONLY/)
  assert.match((await command(b, { action: "tool", args: { path: "sentinel" } })).content, /LOCAL ONLY/)
  const c = await create()
  assert.equal((await command(c, { action: "connect", target })).phase, "connected")
  assert.match((await command(c, { action: "tool", args: { path: "sentinel" } })).content, /REMOTE ONLY/)
  assert.equal((await fs.readdir(path.join(tmp, "mirror/runtime"))).length, 2)
  const written = await command(a, { action: "tool", tool: "write", args: { path: "created", content: "one" } })
  assert(!written.error, JSON.stringify(written))
  assert.equal(await fs.readFile(path.join(tmp, "remote/created"), "utf8"), "one")
  assert.match((await command(c, { action: "tool", args: { path: "created" } })).content, /one/)
  const edited = await command(a, { action: "tool", tool: "edit", args: { path: "created", oldString: "one", newString: "two" } })
  assert(!edited.error, JSON.stringify(edited))
  assert.equal(await fs.readFile(path.join(tmp, "remote/created"), "utf8"), "two")
  const patched = await command(a, { action: "tool", tool: "patch", args: { patchText: "*** Begin Patch\n*** Add File: patched\n+new\n*** End Patch" } })
  assert(!patched.error, JSON.stringify(patched))
  assert.equal(await fs.readFile(path.join(tmp, "remote/patched"), "utf8"), "new")
  assert.match((await command(a, { action: "tool", tool: "glob", args: { pattern: "created" } })).content, /created/)
  assert.match((await command(a, { action: "tool", tool: "grep", args: { pattern: "two" } })).content, /two/)
  assert.equal((await command(c, { action: "disconnect" })).phase, "local")
  const shell = await command(a, { action: "tool", tool: "shell", args: { command: "printf REMOTE_SHELL" } })
  assert.match(shell.content, /REMOTE_SHELL/)
  assert.equal(await command(a, { action: "capture" }), "captured")
  assert.equal((await command(a, { action: "disconnect" })).phase, "local")
  assert.match((await command(a, { action: "stale", args: { path: "sentinel" } })).error, /Target changed/)
  assert.match((await command(a, { action: "tool", args: { path: "sentinel" } })).content, /LOCAL ONLY/)
  assert((await command(a, { action: "connect", target: { ...target, password: "incorrect" } })).error)
  assert.equal((await command(a, { action: "status" })).phase, "failed")
  assert.match((await command(a, { action: "tool", args: { path: "sentinel" } })).error, /blocked/)
  assert.match((await command(b, { action: "tool", args: { path: "sentinel" } })).content, /LOCAL ONLY/)
  assert.equal((await command(a, { action: "disconnect" })).phase, "local")
  const { password: _password, ...slashTarget } = target
  await request(`/api/session/${a}/command`, { name: "remote", text: `connect ${JSON.stringify(slashTarget)}` })
  assert.equal((await command(a, { action: "status" })).phase, "connected")
  await request(`/api/session/${a}/command`, { name: "remote", text: "status" })
  await request(`/api/session/${a}/command`, { name: "remote", text: "disconnect" })
  assert.equal((await command(a, { action: "status" })).phase, "local")
  console.log("PASS runtime real host: RPC, two sessions at one location, native delegation, remote SFTP/shell, stale calls, failure isolation, disconnect")
} finally {
  const exit = child.exitCode === null ? once(child, "exit") : Promise.resolve()
  child.kill("SIGTERM")
  await exit
  await remote.close()
  await fs.rm(tmp, { recursive: true, force: true })
}
