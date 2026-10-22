import { isTemplateVersion } from "yugilife-core"

import { isRecord } from "@/lib/utils"

import {
  currentEditorDocumentVersion,
  migrateEditorDocumentSchema,
} from "../../migrations/document"
import { migrateEditorTemplateVersion } from "../../migrations/template"
import { requireCompletedArtworkMask } from "../model/artwork-mask-state"
import {
  artworkEditorConfig,
  editorDefaultLayerVisibility,
  editorPresetTargets,
  officialTemplateBundle,
} from "../model/editor-config"
import { validateEditorDocumentState } from "../model/editor-document-validation"
import { createInitialEditorDocument } from "../model/editor-store"

import type { EditorDocumentState } from "../model/editor-document"
import type { CardData, CardFieldValue, CardTemplateBundle } from "yugilife-core"

const editorDocumentFormat = "yugilife/editor-document"
export const maximumEditorDocumentBytes = 64 * 1024 * 1024

interface EditorDocumentFile {
  document: unknown
  format: typeof editorDocumentFormat
  schemaVersion: number
}

const editorDocumentKeys = new Set([
  "artworkMask",
  "artworkMaskEffects",
  "card",
  "layers",
  "mode",
  "presetOverrides",
  "presentationOverrides",
  "templateId",
  "templateVersion",
])

const editorDocumentEnvelopeKeys = new Set(["document", "format", "schemaVersion"])

function assertKnownDocumentKeys(value: unknown) {
  if (!isRecord(value)) throw new Error("Editor document must be an object.")
  const unknown = Object.keys(value).find((key) => !editorDocumentKeys.has(key))
  if (unknown) throw new Error(`Editor document contains unsupported property "${unknown}".`)
}

function assertKnownEnvelopeKeys(value: unknown) {
  if (!isRecord(value)) throw new Error("Editor document envelope must be an object.")
  const unknown = Object.keys(value).find((key) => !editorDocumentEnvelopeKeys.has(key))
  if (unknown)
    throw new Error(`Editor document envelope contains unsupported property "${unknown}".`)
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener(
      "load",
      () => {
        if (typeof reader.result === "string") resolve(reader.result)
        else reject(new Error("Image encoding did not produce a data URL."))
      },
      { once: true },
    )
    reader.addEventListener(
      "error",
      () => reject(reader.error ?? new Error("Could not encode an image in the editor document.")),
      { once: true },
    )
    reader.readAsDataURL(blob)
  })
}

async function jsonCardValue(field: string, value: CardFieldValue): Promise<unknown> {
  if (value instanceof Blob) return await blobDataUrl(value)
  if (value instanceof URL) return value.href
  if (
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    return value
  }
  throw new Error(`Card field "${field}" contains an image source that JSON cannot represent.`)
}

async function jsonCard(card: CardData): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.entries(card).map(async ([field, value]): Promise<readonly [string, unknown]> => [
      field,
      await jsonCardValue(field, value),
    ]),
  )
  return Object.fromEntries(entries)
}

export async function serializeEditorDocument(document: EditorDocumentState) {
  requireCompletedArtworkMask(
    document,
    artworkEditorConfig(officialTemplateBundle(document.templateId).template).field,
  )
  const artworkMask = {
    ...document.artworkMask,
    ...(document.artworkMask.automaticMask
      ? { automaticMask: await blobDataUrl(document.artworkMask.automaticMask) }
      : {}),
    ...(document.artworkMask.manualMask
      ? { manualMask: await blobDataUrl(document.artworkMask.manualMask) }
      : {}),
  }
  const file: EditorDocumentFile = {
    document: { ...document, artworkMask, card: await jsonCard(document.card) },
    format: editorDocumentFormat,
    schemaVersion: currentEditorDocumentVersion,
  }
  const source = `${JSON.stringify(file, null, 2)}\n`
  if (source.length > maximumEditorDocumentBytes) {
    throw new Error(
      `Editor documents must be smaller than ${maximumEditorDocumentBytes / 1024 / 1024} MiB.`,
    )
  }
  return source
}

// Schema migrations only run on files older than the current schema, all of which predate any
// template other than the default, so their defaults deliberately stay the default template's.
const migrationContext = {
  defaultLayerVisibility: editorDefaultLayerVisibility,
  defaultPresets: Object.fromEntries(
    editorPresetTargets.map(({ defaultPreset, target }) => [target, defaultPreset]),
  ),
}

/** Resolves a stored user template synchronously; `undefined` means it is not available here. */
export type UserTemplateResolver = (templateId: string) => CardTemplateBundle | undefined

export function parseEditorDocument(
  source: string,
  resolveUserTemplate: UserTemplateResolver = () => undefined,
): EditorDocumentState {
  if (source.length > maximumEditorDocumentBytes) {
    throw new Error(
      `Editor documents must be smaller than ${maximumEditorDocumentBytes / 1024 / 1024} MiB.`,
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new Error("The selected file is not valid JSON.", { cause: error })
  }
  if (!isRecord(parsed)) throw new Error("Editor document envelope must be an object.")
  assertKnownEnvelopeKeys(parsed)
  if (parsed.format !== editorDocumentFormat) {
    throw new Error(`Expected a ${editorDocumentFormat} document.`)
  }
  const schemaVersion = parsed.schemaVersion
  if (!Number.isInteger(schemaVersion)) {
    throw new Error("Editor document schemaVersion must be an integer.")
  }

  const documentShape = migrateEditorDocumentSchema(
    parsed.document,
    Number(schemaVersion),
    migrationContext,
  )
  // The document is parsed against its own template: an official one by ID, or a stored user
  // template. A user template that is not stored here keeps its identity so the caller can ask for
  // it to be imported first, and is otherwise read with the default template's contract.
  const documentTemplateId =
    typeof documentShape.templateId === "string" ? documentShape.templateId : ""
  const userBundle = documentTemplateId.startsWith("user/")
    ? resolveUserTemplate(documentTemplateId)
    : undefined
  const bundle = userBundle ?? officialTemplateBundle(documentTemplateId)
  const initial = createInitialEditorDocument(bundle)
  const migrationTarget =
    !userBundle &&
    documentTemplateId.startsWith("user/") &&
    isTemplateVersion(documentShape.templateVersion)
      ? {
          ...initial,
          templateId: documentTemplateId,
          templateVersion: documentShape.templateVersion,
        }
      : initial
  const migrated = migrateEditorTemplateVersion(documentShape, migrationTarget)
  if (!migrated) {
    throw new Error("The editor document uses an unsupported template or template version.")
  }
  assertKnownDocumentKeys(migrated)
  if (!isRecord(migrated.card)) throw new Error("Editor document card must be an object.")
  if (typeof migrated.templateId !== "string" || migrated.templateId.length === 0) {
    throw new Error("Editor document templateId must be a non-empty string.")
  }
  const templateVersion = migrated.templateVersion
  if (!isTemplateVersion(templateVersion)) {
    throw new Error("Editor document templateVersion must use YYYY.MM.DD or YYYY.MM.DD.N.")
  }

  const document: EditorDocumentState = {
    artworkMask: parseArtworkMask(migrated.artworkMask),
    // Never defaulted here: legacy migrations own defaults and the validator rejects bad values.
    artworkMaskEffects: migrated.artworkMaskEffects as EditorDocumentState["artworkMaskEffects"],
    card: Object.fromEntries(
      Object.entries({ ...initial.card, ...migrated.card }).map(([field, value]) => [
        field,
        bundle.template.cardFields.some(
          (definition) => definition.name === field && definition.kind === "image",
        ) &&
        typeof value === "string" &&
        value.startsWith("data:")
          ? dataUrlBlob(value)
          : value,
      ]),
    ) as CardData,
    layers: migrated.layers ?? {},
    mode: migrated.mode ?? "automatic",
    presetOverrides: migrated.presetOverrides ?? {},
    presentationOverrides: migrated.presentationOverrides ?? {},
    templateId: migrated.templateId,
    templateVersion,
  }
  if (
    Number(schemaVersion) < 21 &&
    !document.artworkMask.automaticMask &&
    !document.artworkMask.manualMask &&
    document.card.artworkOverlay instanceof Blob
  ) {
    document.artworkMask = { ...document.artworkMask, automaticMask: document.card.artworkOverlay }
    document.card = { ...document.card, artworkOverlay: "" }
  }
  try {
    return validateEditorDocumentState(document, bundle.template, bundle.colorPresets)
  } catch (error) {
    throw new Error("Editor document contains invalid editor state.", { cause: error })
  }
}

function dataUrlBlob(value: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value)
  if (!match) throw new Error("Artwork mask must be an embedded data URL.")
  const source = decodeURIComponent(match[3] ?? "")
  const bytes = match[2]
    ? Uint8Array.from(atob(source), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(source)
  return new Blob([bytes], { type: match[1] ?? "application/octet-stream" })
}

function parseArtworkMask(value: unknown): EditorDocumentState["artworkMask"] {
  if (!isRecord(value)) throw new Error("Editor artworkMask must be an object.")
  const decoded = { ...value }
  for (const key of ["automaticMask", "manualMask"] as const) {
    if (value[key] === undefined) continue
    if (typeof value[key] !== "string") throw new Error("Artwork masks must be embedded data URLs.")
    decoded[key] = dataUrlBlob(value[key])
  }
  // Preserve all keys and values for the strict document validator.
  return decoded as unknown as EditorDocumentState["artworkMask"]
}
