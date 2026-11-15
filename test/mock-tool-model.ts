/** Deterministic local chat endpoint for exercising Core's real tool pipeline. */
import { createServer } from "node:http"
import { once } from "node:events"

export async function startToolModel(calls: { name: string; arguments: Record<string, unknown> }[]) {
  const results: unknown[] = []
  const server = createServer(async (request, response) => {
    try {
      let body = ""
      for await (const chunk of request) body += chunk
      const input = JSON.parse(body)
      const tools = input.messages.filter(message => message.role === "tool")
      const active = input.tools?.length > 0
      if (active) results.splice(0, results.length, ...tools)
      const available = calls.filter(call => input.tools?.some(tool => tool.function?.name === call.name))
      const call = active ? available[tools.length] : undefined
      const toolCalls = call ? [{ index: 0, id: `call_pipeline_${tools.length}`, type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] : undefined
      const delta = toolCalls ? { role: "assistant", tool_calls: toolCalls } : { role: "assistant", content: "Done." }
      const finish = call ? "tool_calls" : "stop"
      if (input.stream) {
        response.writeHead(200, { "Content-Type": "text/event-stream" })
        for (const choice of [{ index: 0, delta, finish_reason: null }, { index: 0, delta: {}, finish_reason: finish }]) {
          response.write(`data: ${JSON.stringify({ id: "chatcmpl-test", object: "chat.completion.chunk", created: 1,
            model: "test", choices: [choice] })}\n\n`)
        }
        response.end("data: [DONE]\n\n")
      } else {
        response.writeHead(200, { "Content-Type": "application/json" })
        response.end(JSON.stringify({ id: "chatcmpl-test", object: "chat.completion", created: 1, model: "test",
          choices: [{ index: 0, message: delta, finish_reason: finish }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
      }
    } catch (error) {
      response.writeHead(500)
      response.end(String(error))
    }
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing mock model address")
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`, results,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
      server.closeAllConnections()
    }),
  }
}
