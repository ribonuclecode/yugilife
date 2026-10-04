import { ArtworkMaskWorkerClient } from "./artwork-mask-worker-client"

import type { ArtworkMaskFrame } from "./artwork-mask-worker-protocol"
import type { ArtworkMaskEffects } from "./quick-selection-types"

export type ArtworkMaskChannel = "alpha" | "luminance"
export type ProcessedArtworkMaskPixels = ArtworkMaskFrame

let worker: ArtworkMaskWorkerClient | undefined
let operationQueue: Promise<void> = Promise.resolve()

export function hasArtworkMaskEffects(effects: ArtworkMaskEffects | undefined) {
  return effects?.antiAlias === true || (effects?.glow ?? 0) > 0
}

export function disposeArtworkMaskWorker() {
  worker?.dispose()
  worker = undefined
}

export async function processArtworkMaskSource(
  source: Blob,
  effects: ArtworkMaskEffects,
  channel: ArtworkMaskChannel = "luminance",
  signal?: AbortSignal,
): Promise<ArtworkMaskFrame> {
  if (worker?.failed) worker = undefined
  worker ??= new ArtworkMaskWorkerClient()
  return worker.process(source, channel, effects, signal)
}

export async function processArtworkMaskBlob(
  source: Blob,
  effects: ArtworkMaskEffects | undefined,
  channel: ArtworkMaskChannel = "luminance",
  signal?: AbortSignal,
) {
  if (!hasArtworkMaskEffects(effects)) return source
  const result = operationQueue.then(async () => {
    const operation = new ArtworkMaskWorkerClient()
    try {
      return (await operation.process(source, channel, effects!, signal)).blob
    } finally {
      operation.dispose()
    }
  })
  operationQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
