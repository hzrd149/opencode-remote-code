import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { once } from "node:events"
import { parseArguments, runCLI, sessionDirectory } from "../dist/cli.js"

const root = fileURLToPath(new URL("../", import.meta.url))
const directory = path.join(root, "tmp_test_artifacts", "dev")
const args = process.argv.slice(2)

try {
  // Validate before starting a server; use the production CLI's help and parser.
  if (args.length && !parseArguments(args)) {
    process.exitCode = await runCLI(args)
  } else {
    await launch()
  }
} catch (error) {
  console.error(`Development launch failed: ${error.message}`)
  process.exitCode = 1
}

async function launch() {
  // A stable, ignored location keeps development sessions separate from source work.
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, "opencode.json"), JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    plugins: [{ package: root, options: { runtime: true } }],
  }, null, 2) + "\n")
  if (args.length) await launchRemote()
  else launchInteractive()
}

async function launchRemote() {
  let server
  const interrupt = () => server?.kill("SIGTERM")
  process.on("SIGINT", interrupt)
  process.on("SIGTERM", interrupt)
  try {
    process.exitCode = await runCLI(args, {
      directory: options => sessionDirectory(options, directory),
      ensure: async () => {
        server = spawn("opencode", ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
          cwd: directory, env: process.env, stdio: ["ignore", "pipe", "pipe"], shell: false,
        })
        return await new Promise((resolve, reject) => {
          let output = ""
          const timer = setTimeout(() => reject(new Error("Private OpenCode server did not start within 30 seconds")), 30000)
          const collect = data => {
            output = (output + data).slice(-65536)
            const url = output.match(/server listening on (http:\/\/[^\s]+)/)?.[1]
            const password = output.match(/server password ([^\s]+)/)?.[1]
            if (url && password) {
              clearTimeout(timer)
              resolve({ url, auth: { type: "basic", username: "opencode", password } })
            }
          }
          server.stdout.on("data", collect)
          server.stderr.on("data", collect)
          server.once("error", error => { clearTimeout(timer); reject(error) })
          server.once("exit", code => { clearTimeout(timer); reject(new Error(`Private OpenCode server exited (${code})`)) })
        })
      },
    })
  } finally {
    process.removeListener("SIGINT", interrupt)
    process.removeListener("SIGTERM", interrupt)
    if (server?.pid && server.exitCode === null && server.signalCode === null) {
      const exit = once(server, "exit")
      server.kill("SIGTERM")
      const timer = setTimeout(() => server.kill("SIGKILL"), 5000)
      try { await exit } finally { clearTimeout(timer) }
    }
  }
}

function launchInteractive() {
  console.error("Starting OpenCode with the local build. Connect using /remote connect {\"ssh\":\"user@host\",\"workdir\":\"/remote/path\"}")
  const child = spawn("opencode", [directory, "--standalone"], {
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
}
