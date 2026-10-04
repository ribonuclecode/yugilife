import { compareTemplateVersions, isTemplateVersion } from "yugilife-core"

import type { EditorDocumentState } from "../editor/model/editor-document"

type PersistedEditorDocument = Omit<Partial<EditorDocumentState>, "templateVersion"> & {
  templateVersion?: unknown
}

interface TemplateMigrationCheckpoint {
  readonly templateId: string
  readonly releasedIn: string
  readonly migrate: (saved: PersistedEditorDocument) => PersistedEditorDocument
}

function withoutLayerMasks(
  overrides: NonNullable<PersistedEditorDocument["presentationOverrides"]>,
): NonNullable<PersistedEditorDocument["presentationOverrides"]> {
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "layerMasks"))
}

function migrateSeries10CurrentRelease(saved: PersistedEditorDocument): PersistedEditorDocument {
  const layers = saved.layers
  const presentationOverrides = saved.presentationOverrides
  const layerMasks = saved.presentationOverrides?.layerMasks
  const hasRetiredLayer = layers ? Object.hasOwn(layers, "pendulumBorder") : false
  const hasRetiredLinkMask = layerMasks
    ? Object.values(layerMasks).some((maskId) => maskId === "link-arrows")
    : false
  const hasRetiredPendulumMask = layerMasks ? Object.hasOwn(layerMasks, "pendulumBorder") : false
  if (!hasRetiredLayer && !hasRetiredLinkMask && !hasRetiredPendulumMask) return saved

  const retainedLayerMasks = layerMasks
    ? Object.fromEntries(
        Object.entries(layerMasks).filter(
          ([layerId, maskId]) => layerId !== "pendulumBorder" && maskId !== "link-arrows",
        ),
      )
    : undefined

  return {
    ...saved,
    ...(layers
      ? {
          layers: Object.fromEntries(
            Object.entries(layers).filter(([layerId]) => layerId !== "pendulumBorder"),
          ),
        }
      : {}),
    ...(presentationOverrides
      ? {
          presentationOverrides: {
            ...withoutLayerMasks(presentationOverrides),
            ...(retainedLayerMasks && Object.keys(retainedLayerMasks).length > 0
              ? { layerMasks: retainedLayerMasks }
              : {}),
          },
        }
      : {}),
  }
}

const templateMigrationCheckpoints: readonly TemplateMigrationCheckpoint[] = [
  {
    templateId: "card/series-10",
    releasedIn: "2026.09.23",
    migrate: migrateSeries10CurrentRelease,
  },
]

function applyTemplateVersionMigrations(
  saved: PersistedEditorDocument,
  sourceVersion: string,
  currentVersion: string,
) {
  return templateMigrationCheckpoints.reduce(
    (document, checkpoint) =>
      checkpoint.templateId === saved.templateId &&
      compareTemplateVersions(sourceVersion, checkpoint.releasedIn) < 0 &&
      compareTemplateVersions(checkpoint.releasedIn, currentVersion) <= 0
        ? checkpoint.migrate(document)
        : document,
    saved,
  )
}

export function migrateEditorTemplateVersion(
  saved: PersistedEditorDocument,
  current: EditorDocumentState,
): Partial<EditorDocumentState> | undefined {
  const templateVersion = saved.templateVersion
  if (!isTemplateVersion(templateVersion)) return undefined
  if (saved.templateId !== current.templateId) return undefined
  if (compareTemplateVersions(templateVersion, current.templateVersion) > 0) return undefined
  const migrated = applyTemplateVersionMigrations(saved, templateVersion, current.templateVersion)
  return { ...migrated, templateVersion: current.templateVersion }
}
