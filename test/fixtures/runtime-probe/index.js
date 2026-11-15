// Loaded only by the runtime/CLI host tests. No model or provider is involved.
import fs from "node:fs/promises"
import { Plugin } from "@opencode/plugin"
import { RemoteRuntime } from "../../../dist/rpc.js"

export default Plugin.define({
  id: "remote-code-runtime-test",
  async setup(ctx) {
    const captured = new Map()
    await ctx.command.transform(editor => editor.add({
      name: "runtime-probe",
      async execute({ sessionID, prompt }) {
        const input = JSON.parse(prompt.text)
        let result
        try {
          const rpc = ctx.rpc(RemoteRuntime)
          if (input.action === "schemas") result = (await ctx.tool.list()).filter(t => ["read", "write", "edit", "patch", "shell", "glob", "grep"].includes(t.id)).map(t => ({ name: t.id, declaresOutput: t.output !== undefined }))
          else if (input.action === "connect") result = await rpc.connect({ sessionID, target: input.target })
          else if (input.action === "status") result = await rpc.status({ sessionID })
          else if (input.action === "disconnect") result = await rpc.disconnect({ sessionID })
          else {
            const tool = input.action === "stale" ? captured.get(sessionID) : (await ctx.tool.list()).find(t => t.id === (input.tool ?? "read"))
            if (input.action === "capture") { captured.set(sessionID, tool); result = "captured" }
            else result = await tool.execute(input.args, {
              sessionID, agent: "build", messageID: "msg_runtime_probe", id: "call_runtime_probe",
              progress: async () => {}, signal: new AbortController().signal,
            })
          }
        } catch (error) { result = { error: error?.message ?? JSON.stringify(error), detail: JSON.stringify(error) } }
        await fs.writeFile(process.env.RUNTIME_TEST_REPORT, JSON.stringify(result))
      },
    }))
  },
})
