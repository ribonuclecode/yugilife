export const DASHED_BORDER_STROKE_WIDTH = 1
export const ARTWORK_ATTACHMENT_OVERLAP_PX = 8

export function getShapeContainerRadius(container: string) {
  return container === "rounded-3xl" ? 24 : 12
}

export function buildConcaveAttachmentPath({
  height,
  overlap,
  radius,
  strokeWidth = DASHED_BORDER_STROKE_WIDTH,
  width,
}: {
  height: number
  overlap: number
  radius: number
  strokeWidth?: number
  width: number
}) {
  const edgeRadius = Math.min(radius + strokeWidth / 2, width / 2)
  const cornerY = overlap - edgeRadius

  return [
    `M 0 ${cornerY}`,
    `A ${edgeRadius} ${edgeRadius} 0 0 0 ${edgeRadius} ${overlap}`,
    `H ${width - edgeRadius}`,
    `A ${edgeRadius} ${edgeRadius} 0 0 0 ${width} ${cornerY}`,
    `V ${height}`,
    "H 0",
    "Z",
  ].join(" ")
}
