import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const directory = path.join(root, "tmp_test_artifacts", "dev")

// A stable, ignored location keeps development sessions separate from source work.
await mkdir(directory, { recursive: true })
await writeFile(path.join(directory, "opencode.json"), JSON.stringify({
  $schema: "https://opencode.ai/config.json",
  plugins: [{ package: root, options: { runtime: true } }],
}, null, 2) + "\n")

console.error("Starting OpenCode with the local build. Connect using /remote connect {\"ssh\":\"user@host\",\"workdir\":\"/remote/path\"}")

const child = spawn("opencode", [directory, "--standalone", ...process.argv.slice(2)], {
  cwd: directory,
  env: process.env,
  stdio: "inherit",
  shell: false,
})
child.once("error", error => {
  console.error(`Could not launch OpenCode: ${error.message}`)
  process.exitCode = 1
})
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1)
})
