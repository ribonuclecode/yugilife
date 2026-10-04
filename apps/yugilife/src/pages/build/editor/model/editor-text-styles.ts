import type { ResolvedTextPresentation } from "yugilife-core"

export interface EditorTextStyleGroup {
  key: string
  compression: boolean
  fit: boolean
  layerId: string
  paint: boolean
  style: ResolvedTextPresentation
  styleId: string
  styleLabel: string
}

function styleKey({ layerId, styleId }: ResolvedTextPresentation) {
  return `${layerId}:${styleId}`
}

export function groupEditorTextStyles(
  fitted: readonly ResolvedTextPresentation[],
  compressible: readonly ResolvedTextPresentation[],
  paintable: readonly ResolvedTextPresentation[],
): EditorTextStyleGroup[] {
  const groups = new Map<string, EditorTextStyleGroup>()
  const capabilities = [
    { entries: paintable, name: "paint" },
    { entries: fitted, name: "fit" },
    { entries: compressible, name: "compression" },
  ] as const

  for (const { entries, name } of capabilities) {
    for (const style of entries) {
      const key = styleKey(style)
      const group = groups.get(key) ?? {
        key,
        compression: false,
        fit: false,
        layerId: style.layerId,
        paint: false,
        // The lists resolve from the same presentation, so any of them carries the same typography.
        style,
        styleId: style.styleId,
        styleLabel: style.styleLabel,
      }
      groups.set(key, {
        ...group,
        compression: group.compression || name === "compression",
        fit: group.fit || name === "fit",
        paint: group.paint || name === "paint",
      })
    }
  }

  return [...groups.values()]
}
