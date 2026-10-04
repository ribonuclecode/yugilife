interface ScratchCanvasKey {
  readonly width: number
  readonly height: number
  readonly willReadFrequently: boolean
}

export interface ScratchCanvas {
  readonly canvas: HTMLCanvasElement
  readonly context: CanvasRenderingContext2D
  readonly key: string
}

const MAX_POOLED_PER_KEY = 2

const pools = new Map<string, ScratchCanvas[]>()

function poolKey({ width, height, willReadFrequently }: ScratchCanvasKey) {
  return `${width}x${height}${willReadFrequently ? ":readback" : ""}`
}

export function acquireScratchCanvas(
  width: number,
  height: number,
  willReadFrequently = false,
): ScratchCanvas {
  const key = poolKey({ height, width, willReadFrequently })
  const pooled = pools.get(key)?.pop()
  if (pooled) {
    pooled.context.setTransform(1, 0, 0, 1, 0, 0)
    pooled.context.globalCompositeOperation = "source-over"
    pooled.context.globalAlpha = 1
    pooled.context.clearRect(0, 0, width, height)
    return pooled
  }

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently })
  if (!context) throw new Error("A 2D canvas context is required to compose a card layer.")
  return { canvas, context, key }
}

export function releaseScratchCanvas(scratch: ScratchCanvas) {
  const pooled = pools.get(scratch.key)
  if (!pooled) {
    pools.set(scratch.key, [scratch])
    return
  }
  if (pooled.length >= MAX_POOLED_PER_KEY) return
  pooled.push(scratch)
}

export function clearScratchCanvasPool() {
  pools.clear()
}
