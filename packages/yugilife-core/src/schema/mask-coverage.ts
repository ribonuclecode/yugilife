import { fail } from "./primitives.js"

export function layerRenderOrder(layerIds: Iterable<string>) {
  return new Map([...layerIds].map((id, index) => [id, index] as const))
}

export function assertCoverageRendersFirst(
  maskId: string,
  layerId: string,
  location: string,
  coverageLayerIds: ReadonlyMap<string, string | undefined>,
  layerOrder: ReadonlyMap<string, number>,
) {
  const coverageLayerId = coverageLayerIds.get(maskId)
  if (coverageLayerId === undefined) return
  const coverageOrder = layerOrder.get(coverageLayerId)
  const targetOrder = layerOrder.get(layerId)
  if (coverageOrder === undefined || targetOrder === undefined) return
  if (coverageOrder >= targetOrder) {
    fail(
      `${location} assigns mask "${maskId}" to layer "${layerId}", but its coverage layer "${coverageLayerId}" does not render before that layer.`,
    )
  }
}
