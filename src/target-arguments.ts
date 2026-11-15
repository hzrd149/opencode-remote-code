import os from "node:os"
import { isIP } from "node:net"

export interface Arguments {
  host: string
  user: string
  port: number
  workdir: string
  key?: string
  agentSocket?: string
  sessionID?: string
}

/** Tokenize only: no environment expansion, command substitution or shell execution. */
export function splitArguments(text: string): string[] {
  const args: string[] = []
  let word = "", quote = "", started = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === "\0") throw new Error("Arguments cannot contain NUL")
    if (char === "\\" && quote !== "'") {
      const next = text[i + 1]
      if (next === undefined) throw new Error("Trailing escape in arguments")
      // Inside double quotes preserve backslashes except before shell-escaped characters.
      if (!quote || ['"', "\\", "$", "`", "\n"].includes(next)) {
        i++
        if (next !== "\n") word += next
      } else word += char
      started = true
    } else if (quote) {
      if (char === quote) quote = ""
      else word += char
    } else if (char === "'" || char === '"') {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (started) args.push(word)
      word = ""
      started = false
    } else {
      word += char
      started = true
    }
  }
  if (quote) throw new Error("Unterminated quote in arguments")
  if (started) args.push(word)
  return args
}

export function parseArguments(args: string[], allowSession = true): Arguments | undefined {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return
  let host: string | undefined
  const values = new Map<string, string>()
  const flags = ["--workdir", "--user", "--port", "--key", "--agent-socket", ...(allowSession ? ["--session"] : [])]
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith("-")) {
      if (!flags.includes(arg)) throw new Error(`Unknown option: ${arg}`)
      const value = args[++i]
      if (!value || value.startsWith("--") || value.includes("\0")) throw new Error(`Missing or invalid value for ${arg}`)
      if (values.has(arg)) throw new Error(`Repeated option: ${arg}`)
      values.set(arg, value)
    } else {
      if (host) throw new Error("Expected one SSH host")
      host = arg
    }
  }
  if (!host) throw new Error("An SSH host is required; use --help for usage")
  const match = /^(?:([^@\s]+)@)?(\[[^\]]+\]|[a-zA-Z0-9_.:-]+)$/.exec(host)
  if (!match || match[2].startsWith("-")) throw new Error("Use [user@]hostname or an IP address, not an SSH command or URL")
  const hostname = match[2].replace(/^\[|\]$/g, "")
  if ((match[2].startsWith("[") || hostname.includes(":")) && isIP(hostname) !== 6) {
    throw new Error("Invalid IPv6 address; specify ports with --port, not host:port")
  }
  if (match[1] && values.has("--user") && match[1] !== values.get("--user")) throw new Error("Conflicting SSH users")
  const portText = values.get("--port") ?? "22"
  const port = Number(portText)
  if (!/^\d+$/.test(portText) || port < 1 || port > 65535) throw new Error("Port must be an integer from 1 to 65535")
  const user = values.get("--user") ?? match[1] ?? os.userInfo().username
  if (/\s|\0/.test(user)) throw new Error("Invalid SSH user")
  const sessionID = values.get("--session")
  if (sessionID && !/^ses[\w-]+$/.test(sessionID)) throw new Error("Invalid session ID")
  if (values.has("--key") && values.has("--agent-socket")) throw new Error("Use either --key or --agent-socket")
  return { host: hostname, user, port, workdir: values.get("--workdir") ?? "~",
    key: values.get("--key"), agentSocket: values.get("--agent-socket"), sessionID }
}
