// 独立复现 WriteSession + 并行管线写盘行为，定位 0 字节 .part 问题
import { createWriteStream } from "fs"
import { rename, stat } from "fs/promises"

const PART = "/home/z/my-project/data/pdfs/test.part"
const FULL = "/home/z/my-project/data/pdfs/test.pdf"

class WriteSession {
  ws = null
  constructor(id) { this.id = id }
  static async open() {
    const ws = createWriteStream(PART)
    ws.on("error", () => {})
    return new WriteSession("test")
  }
  async write(chunk) {
    if (!this.ws) return
    await new Promise((resolve, reject) => {
      this.ws.write(chunk, (err) => (err ? reject(err) : resolve()))
    })
  }
  async finalize() {
    const ws = this.ws
    this.ws = null
    if (!ws) return
    console.log("finalize: calling end()")
    await new Promise((resolve) => ws.end(() => resolve()))
    console.log("finalize: end() resolved, renaming")
    await rename(PART, FULL)
    console.log("finalize: renamed ok")
  }
  async discard() {
    const ws = this.ws
    this.ws = null
    try { ws?.destroy() } catch {}
    try { await (await import("fs/promises")).unlink(PART) } catch {}
  }
}

// 模拟 pull 管线：10 块 x 1MB，onChunk 写盘
const session = await WriteSession.open()
let emitted = 0
const total = 10
const stream = new ReadableStream({
  async pull(controller) {
    if (emitted >= total) {
      controller.close()
      console.log("pull: closed, calling onDone")
      session.finalize().catch((e) => console.log("finalize error:", e))
      return
    }
    const data = new Uint8Array(1024 * 1024).fill(emitted)
    await session.write(data).catch((e) => console.log("write FAILED:", e.code, e.message))
    controller.enqueue(data)
    emitted++
  },
})

// 模拟消费端（undici 风格：读到 done 为止）
const reader = stream.getReader()
let bytes = 0
for (;;) {
  const { done, value } = await reader.read()
  if (done) break
  bytes += value.byteLength
}
console.log("consumed", bytes, "bytes")
await new Promise((r) => setTimeout(r, 500))
try {
  const st = await stat(FULL)
  console.log("FINAL:", FULL, st.size, "bytes")
} catch (e) {
  console.log("FINAL MISSING:", e.code)
}
process.exit(0)
