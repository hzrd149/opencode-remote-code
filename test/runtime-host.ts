/** Opt-in real V2 host + real SSH/SFTP test; only a local fake model, no user config edits. */
import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import { startMockServer } from "./mock-ssh-server.ts"
import { startToolModel } from "./mock-tool-model.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
await fs.mkdir(path.join(root, "tmp_test_artifacts"), { recursive: true })
const tmp = await fs.mkdtemp(path.join(root, "tmp_test_artifacts/runtime-"))
const report = path.join(tmp, "report.json")
const remote = await startMockServer({ rootDir: path.join(tmp, "remote"), bashPath: "/bin/bash" })
await fs.writeFile(path.join(tmp, "remote", "sentinel"), "REMOTE ONLY")
await fs.writeFile(path.join(tmp, "sentinel"), "LOCAL ONLY")
const model = await startToolModel([
  { name: "read", arguments: { path: "sentinel" } },
  { name: "glob", arguments: { pattern: "sentinel" } },
  { name: "grep", arguments: { pattern: "REMOTE ONLY" } },
  { name: "shell", arguments: { command: "printf PIPELINE_SHELL" } },
  { name: "write", arguments: { path: "pipeline-file", content: "before" } },
  { name: "edit", arguments: { path: "pipeline-file", oldString: "before", newString: "after" } },
  { name: "patch", arguments: { patchText: "*** Begin Patch\n*** Add File: pipeline-patch\n+patched\n*** End Patch" } },
])
const child = spawn(process.env.OPENCODE_BIN ?? "opencode", ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
  cwd: tmp,
  env: { ...process.env, OPENCODE_DB: ":memory:", XDG_CONFIG_HOME: path.join(tmp, "config"),
    XDG_DATA_HOME: path.join(tmp, "data"), XDG_STATE_HOME: path.join(tmp, "state"),
    RUNTIME_TEST_REPORT: report,
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      model: "runtime-test/test",
      providers: { "runtime-test": { package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: model.baseURL, apiKey: "test" },
        models: {
          test: { capabilities: { tools: true }, limit: { context: 128000, output: 4096 } },
          "gpt-5": { capabilities: { tools: true }, limit: { context: 128000, output: 4096 } },
        } } },
      permissions: [{ action: "*", resource: "*", effect: "allow" }],
      plugins: [
      { package: root, options: { runtime: true, password: remote.password, mirror: path.join(tmp, "mirror"), pool: { command: 1, file: 1 } } },
      path.join(root, "test/fixtures/runtime-probe"),
    ] }),
  }, stdio: ["ignore", "pipe", "pipe"],
})
let logs = ""
try {
  const { url, password } = await new Promise<{ url: string; password: string }>((resolve, reject) => {
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
  const schemas = await command(a, { action: "schemas" })
  assert.deepEqual(schemas.map(t => t.name).sort(), ["edit", "glob", "grep", "patch", "read", "shell", "write"])
  assert(schemas.every(t => t.name === "shell" || !t.declaresOutput), "content-only remote executors must not inherit native output codecs")
  assert.equal(await command(a, { action: "capture" }), "captured")
  const connected = await command(a, { action: "connect", target })
  assert.equal(connected.phase, "connected", JSON.stringify(connected))
  await request(`/api/session/${a}/prompt`, { text: "Exercise remote tools." })
  await request(`/api/experimental/session/${a}/wait`, {})
  assert.equal(model.results.length, 6, JSON.stringify(model.results))
  const pipelineOutput = JSON.stringify(model.results)
  assert.doesNotMatch(pipelineOutput, /Tool result missing|Tool did not return|tool\.execution|declared output/)
  assert.match(pipelineOutput, /REMOTE ONLY/)
  assert.match(pipelineOutput, /PIPELINE_SHELL/)
  assert.equal(await fs.readFile(path.join(tmp, "remote/pipeline-file"), "utf8"), "after")
  // Exercise native delegation through the same validation path, not just execute().
  await request(`/api/session/${b}/prompt`, { text: "Exercise local tools." })
  await request(`/api/experimental/session/${b}/wait`, {})
  assert.equal(model.results.length, 6, JSON.stringify(model.results))
  assert.doesNotMatch(JSON.stringify(model.results), /Tool result missing|tool\.execution|declared output/)
  assert.match(JSON.stringify(model.results), /LOCAL ONLY/)
  assert.equal(await fs.readFile(path.join(tmp, "pipeline-file"), "utf8"), "after")
  assert.match((await command(a, { action: "stale", args: { path: "sentinel" } })).error, /Target changed/)
  const remoteRead = await command(a, { action: "tool", args: { path: "sentinel" } })
  assert.match(remoteRead.content, /REMOTE ONLY/, JSON.stringify(remoteRead))
  assert.match((await command(b, { action: "tool", args: { path: "sentinel" } })).content, /LOCAL ONLY/)
  const c = await create()
  assert.equal((await command(c, { action: "connect", target })).phase, "connected")
  // Core offers patch rather than write/edit for GPT models.
  await request(`/api/session/${c}/model`, { model: { providerID: "runtime-test", id: "gpt-5" } })
  await request(`/api/session/${c}/prompt`, { text: "Exercise remote patch tools." })
  await request(`/api/experimental/session/${c}/wait`, {})
  assert.equal(model.results.length, 5, JSON.stringify(model.results))
  assert.doesNotMatch(JSON.stringify(model.results), /Tool result missing|tool\.execution|declared output/)
  assert.equal(await fs.readFile(path.join(tmp, "remote/pipeline-patch"), "utf8"), "patched")
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
  console.log("PASS runtime real host: validated model/tool pipeline (all seven remote tools and local delegation), RPC, session isolation, stale calls, failure isolation, disconnect")
} finally {
  const exit = child.exitCode === null ? once(child, "exit") : Promise.resolve()
  child.kill("SIGTERM")
  await exit
  await remote.close()
  await model.close()
  await fs.rm(tmp, { recursive: true, force: true })
}
