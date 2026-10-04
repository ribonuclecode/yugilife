import { encodePinMask } from "./pin-mask-codec"
import { QuickSelection } from "./quick-selection-engine"

import type {
  QuickSelectionWorkerRequest,
  QuickSelectionWorkerResponse,
} from "./quick-selection-worker-protocol"

let engine: QuickSelection | undefined

function respond(response: QuickSelectionWorkerResponse, transfer: Transferable[] = []) {
  const workerGlobal = globalThis as unknown as {
    postMessage(message: QuickSelectionWorkerResponse, transfer?: Transferable[]): void
  }
  workerGlobal.postMessage(response, transfer)
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "Pin mask processing failed."
}

async function handle(request: QuickSelectionWorkerRequest) {
  try {
    if (request.type === "prepare" || request.type === "prepare-bitmap") {
      engine = undefined
      if (request.type === "prepare-bitmap") {
        const bitmap = request.bitmap
        try {
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
          const context = canvas.getContext("2d", { willReadFrequently: true })
          if (!context) throw new Error("A 2D canvas is required to prepare dot masking.")
          context.drawImage(bitmap, 0, 0)
          const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height)
          canvas.width = canvas.height = 1
          engine = await QuickSelection.prepare(pixels.data, pixels.width, pixels.height)
        } finally {
          bitmap.close()
        }
      } else {
        engine = await QuickSelection.prepare(
          new Uint8ClampedArray(request.rgba),
          request.width,
          request.height,
        )
      }
      respond({
        height: engine.height,
        id: request.id,
        type: "prepared",
        width: engine.width,
      })
      return
    }

    if (!engine) throw new Error("The pin mask worker has no prepared artwork.")
    const mask = engine.refine(request.points)
    const blob = request.encode ? await encodePinMask(mask, engine.width, engine.height) : undefined
    respond({ id: request.id, mask: mask.buffer, ...(blob ? { blob } : {}), type: "refined" }, [
      mask.buffer,
    ])
  } catch (reason) {
    respond({ id: request.id, message: errorMessage(reason), type: "error" })
  }
}

// Serialized so the single mutable WASM heap sees prepare/refine in order.
let queue = Promise.resolve()
globalThis.addEventListener("message", (event: MessageEvent<QuickSelectionWorkerRequest>) => {
  queue = queue.then(() => handle(event.data)).catch(() => undefined)
})
