import {
  collectPresetTargets,
  validateCardTemplate,
  validateColorPresetCollection,
  validateTemplateManifest,
  walkLayers,
} from "yugilife-core"
import { DEFAULT_TEMPLATE, TEMPLATE_CATALOG } from "yugilife-templates"

import type {
  AssetSource,
  CardTemplate,
  CardTemplateBundle,
  ColorPresetCollection,
  TemplateManifest,
} from "yugilife-core"

export const templateBundleFormat = "yugilife/template-bundle" as const
export const templateSourceFormat = "yugilife/template-source" as const
const currentTemplateDocumentSchemaVersion = 1

export const maximumTemplateDocumentBytes = 64 * 1024 * 1024
const maximumTemplateAssetCount = 256
const maximumTemplateAssetBytes = 32 * 1024 * 1024
const maximumSingleTemplateAssetBytes = 16 * 1024 * 1024

const coreLayerKinds = new Set([
  "artwork",
  "canvas",
  "group",
  "image",
  "raster",
  "repeated-image",
  "svg",
  "text",
])
const rasterRenderers = new Set(["color-texture", "color-texture-bevel"])
const canvasRenderers = new Set(["bevel"])
const userTemplateIdPattern = /^user\/[a-zA-Z0-9._-]+$/
/**
 * Every official template is an editor contract a user template may match. The default comes first
 * so an incompatible template is explained against the editor people see by default.
 */
const officialContracts = [
  DEFAULT_TEMPLATE,
  ...TEMPLATE_CATALOG.filter((candidate) => candidate !== DEFAULT_TEMPLATE),
].map(({ colorPresets, template }) => ({
  colorPresets,
  template: validateCardTemplate(template),
}))

export interface TemplateSource {
  colorPresets: ColorPresetCollection
  manifest: TemplateManifest
  template: CardTemplate
}

interface TemplateBundleDocument extends TemplateSource {
  assets: Readonly<Record<string, string>>
  format: typeof templateBundleFormat
  schemaVersion: number
}

interface TemplateSourceDocument extends TemplateSource {
  format: typeof templateSourceFormat
  schemaVersion: number
}

interface JsonRecord {
  [key: string]: unknown
}

function record(value: unknown, subject: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${subject} must be an object.`)
  }
  return value as JsonRecord
}

type TemplateLayer = CardTemplate["layers"][number]

function isTextLayerDefinition(
  layer: TemplateLayer,
): layer is Extract<TemplateLayer, { kind: "text" }> {
  return layer.kind === "text"
}

function layerRenderer(layer: TemplateLayer): string | undefined {
  const renderer = record(layer, "Template layer").renderer
  return typeof renderer === "string" ? renderer : undefined
}

function assertKeys(value: JsonRecord, allowed: readonly string[], subject: string) {
  const allowedKeys = new Set(allowed)
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key))
  if (unknown) throw new Error(`${subject} contains unsupported property "${unknown}".`)
}

function parseJson(source: string) {
  if (source.length > maximumTemplateDocumentBytes) {
    throw new Error(
      `Template files must be smaller than ${maximumTemplateDocumentBytes / 1024 / 1024} MiB.`,
    )
  }
  try {
    return JSON.parse(source) as unknown
  } catch (error) {
    throw new Error("The selected template file is not valid JSON.", { cause: error })
  }
}

function envelope(
  source: string,
  format: typeof templateBundleFormat | typeof templateSourceFormat,
  withAssets: boolean,
) {
  const value = record(parseJson(source), "Template document")
  assertKeys(
    value,
    withAssets
      ? ["assets", "colorPresets", "format", "manifest", "schemaVersion", "template"]
      : ["colorPresets", "format", "manifest", "schemaVersion", "template"],
    "Template document",
  )
  if (value.format !== format) throw new Error(`Expected a ${format} document.`)
  if (value.schemaVersion !== currentTemplateDocumentSchemaVersion) {
    throw new Error(
      `Unsupported template document schemaVersion ${String(value.schemaVersion)}; current version is ${currentTemplateDocumentSchemaVersion}.`,
    )
  }
  return value
}

function validatedDefinition(
  manifestInput: unknown,
  templateInput: unknown,
  colorPresetsInput: unknown,
): TemplateSource {
  const manifest = validateTemplateManifest(manifestInput)
  if (manifest.kind !== "card") {
    throw new Error(
      `Only card templates can be used by the card builder; received "${manifest.kind}".`,
    )
  }
  if (manifest.templateDependencies && manifest.templateDependencies.length > 0) {
    throw new Error("User templates cannot declare unresolved template dependencies.")
  }
  const template = validateCardTemplate(templateInput)
  validateRendererSurface(template)
  const colorPresets = validateColorPresetCollection(colorPresetsInput)
  return { colorPresets, manifest, template }
}

function validateRendererSurface(template: CardTemplate) {
  walkLayers(template.layers, ({ layer }) => {
    if (!coreLayerKinds.has(layer.kind)) {
      throw new Error(
        `Layer "${layer.id}" uses custom kind "${layer.kind}". User templates may only use core renderers.`,
      )
    }
    const renderer = layerRenderer(layer)
    if (layer.kind === "raster" && (renderer === undefined || !rasterRenderers.has(renderer))) {
      throw new Error(
        `Layer "${layer.id}" uses unsupported raster renderer "${renderer ?? "unknown"}".`,
      )
    }
    if (layer.kind === "canvas" && (renderer === undefined || !canvasRenderers.has(renderer))) {
      throw new Error(
        `Layer "${layer.id}" uses unsupported canvas renderer "${renderer ?? "unknown"}".`,
      )
    }
  })
}

function collectTemplateReferences(
  template: CardTemplate,
  directKeys: ReadonlySet<string>,
  mapKey: string,
) {
  const references = new Set<string>()
  const addString = (value: unknown) => {
    if (typeof value === "string") references.add(value)
  }
  const visit = (value: unknown, key?: string) => {
    if (key !== undefined && directKeys.has(key)) {
      addString(value)
      return
    }
    if (key === mapKey && typeof value === "object" && value !== null) {
      Object.values(value).forEach(addString)
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry))
      return
    }
    if (typeof value !== "object" || value === null) return
    Object.entries(value).forEach(([entryKey, entry]) => visit(entry, entryKey))
  }
  visit(template)
  return references
}

function referencedAssetIds(template: CardTemplate) {
  return collectTemplateReferences(template, new Set(["assetId", "fontAssetId"]), "assetSelections")
}

function referencedPresetNames(template: CardTemplate) {
  return collectTemplateReferences(template, new Set(["defaultPreset"]), "presets")
}

function knownAssetExtension(path: string) {
  return /\.(?:gif|jpe?g|otf|png|svg|ttf|webp|woff2?)$/iu.test(path)
}

function validateAssetMime(assetId: string, assetPath: string, blob: Blob) {
  const type = blob.type.toLowerCase()
  if (type === "") {
    if (!knownAssetExtension(assetPath)) {
      throw new Error(`Asset "${assetId}" must declare an image or font MIME type.`)
    }
    return
  }
  const allowed =
    type.startsWith("image/") ||
    type.startsWith("font/") ||
    type === "application/octet-stream" ||
    type.startsWith("application/font-") ||
    type === "application/vnd.ms-opentype" ||
    type === "application/x-font-ttf" ||
    type === "application/x-font-opentype"
  if (!allowed) {
    throw new Error(`Asset "${assetId}" has unsupported MIME type "${blob.type}".`)
  }
}

export function validateTemplateBundle(
  bundle: CardTemplateBundle,
  options: { requireUserId?: boolean } = {},
) {
  const definition = validatedDefinition(bundle.manifest, bundle.template, bundle.colorPresets)
  if (options.requireUserId && !userTemplateIdPattern.test(definition.manifest.id)) {
    throw new Error('User template IDs must use the "user/" namespace.')
  }

  const entries = Object.entries(bundle.assets)
  if (entries.length > maximumTemplateAssetCount) {
    throw new Error(`Templates may contain at most ${maximumTemplateAssetCount} assets.`)
  }
  const declaredIds = new Set(Object.keys(definition.manifest.assets))
  const actualIds = new Set(entries.map(([id]) => id))
  const missing = [...declaredIds].filter((id) => !actualIds.has(id))
  const unexpected = [...actualIds].filter((id) => !declaredIds.has(id))
  if (missing.length > 0) {
    throw new Error(`Template is missing manifest-declared asset "${missing[0]}".`)
  }
  if (unexpected.length > 0) {
    throw new Error(`Template contains undeclared asset "${unexpected[0]}".`)
  }

  const references = referencedAssetIds(definition.template)
  const unresolved = [...references].filter((id) => !actualIds.has(id))
  if (unresolved.length > 0) {
    throw new Error(`Template references unresolved asset "${unresolved[0]}".`)
  }
  const unresolvedPresets = [...referencedPresetNames(definition.template)].filter(
    (name) => !Object.hasOwn(definition.colorPresets, name),
  )
  if (unresolvedPresets.length > 0) {
    throw new Error(`Template references unresolved color preset "${unresolvedPresets[0]}".`)
  }

  let totalBytes = 0
  for (const [assetId, source] of entries) {
    if (typeof Blob === "undefined" || !(source instanceof Blob)) {
      throw new Error(`Asset "${assetId}" is not a portable Blob asset.`)
    }
    if (source.size > maximumSingleTemplateAssetBytes) {
      throw new Error(
        `Asset "${assetId}" is larger than ${maximumSingleTemplateAssetBytes / 1024 / 1024} MiB.`,
      )
    }
    totalBytes += source.size
    validateAssetMime(assetId, definition.manifest.assets[assetId] ?? "", source)
    // TODO(security): add parser-backed validation for raw SVG image assets.
  }
  if (totalBytes > maximumTemplateAssetBytes) {
    throw new Error(
      `Template assets must total less than ${maximumTemplateAssetBytes / 1024 / 1024} MiB.`,
    )
  }
  return {
    assets: bundle.assets,
    ...definition,
  } satisfies CardTemplateBundle
}

function dataUrlBlob(value: string, subject: string) {
  if (!value.startsWith("data:")) throw new Error(`${subject} must be an embedded data URL.`)
  const separator = value.indexOf(",")
  if (separator < 0) throw new Error(`${subject} is not a valid data URL.`)
  const metadata = value.slice(5, separator)
  const body = value.slice(separator + 1)
  const parts = metadata.split(";")
  const type = (parts[0] || "application/octet-stream").toLowerCase()
  try {
    if (parts.some((part) => part.toLowerCase() === "base64")) {
      const binary = atob(body.replaceAll(/\s/gu, ""))
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      return new Blob([bytes], { type })
    }
    return new Blob([new TextEncoder().encode(decodeURIComponent(body))], { type })
  } catch (error) {
    throw new Error(`${subject} contains malformed embedded bytes.`, { cause: error })
  }
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener(
      "load",
      () => {
        if (typeof reader.result === "string") resolve(reader.result)
        else reject(new Error("Asset encoding did not produce a data URL."))
      },
      { once: true },
    )
    reader.addEventListener(
      "error",
      () => reject(reader.error ?? new Error("Could not encode a template asset.")),
      { once: true },
    )
    reader.readAsDataURL(blob)
  })
}

async function assetDataUrl(source: AssetSource, assetId: string) {
  if (typeof Blob !== "undefined" && source instanceof Blob) return await blobDataUrl(source)
  if (typeof source === "string" && source.startsWith("data:")) return source
  if (typeof URL !== "undefined" && source instanceof URL && source.protocol === "data:") {
    return source.href
  }
  throw new Error(`Asset "${assetId}" cannot be exported because it is not embedded.`)
}

export function parseTemplateBundleDocument(source: string) {
  const document = envelope(source, templateBundleFormat, true)
  const definition = validatedDefinition(
    document.manifest,
    document.template,
    document.colorPresets,
  )
  const serializedAssets = record(document.assets, "Template document assets")
  const entries = Object.entries(serializedAssets)
  if (entries.length > maximumTemplateAssetCount) {
    throw new Error(`Templates may contain at most ${maximumTemplateAssetCount} assets.`)
  }
  const assets: Record<string, Blob> = {}
  for (const [assetId, value] of entries) {
    if (typeof value !== "string") {
      throw new Error(`Template asset "${assetId}" must be a data URL string.`)
    }
    assets[assetId] = dataUrlBlob(value, `Template asset "${assetId}"`)
  }
  return validateTemplateBundle({
    assets,
    ...definition,
  })
}

export function parseTemplateSourceDocument(source: string): TemplateSource {
  const document = envelope(source, templateSourceFormat, false)
  return validatedDefinition(document.manifest, document.template, document.colorPresets)
}

export async function serializeTemplateBundleDocument(bundle: CardTemplateBundle) {
  const validated = validateTemplateBundle(bundle)
  const assets: Record<string, string> = {}
  for (const [assetId, source] of Object.entries(validated.assets)) {
    assets[assetId] = await assetDataUrl(source, assetId)
  }
  const document: TemplateBundleDocument = {
    assets,
    colorPresets: validated.colorPresets,
    format: templateBundleFormat,
    manifest: validated.manifest,
    schemaVersion: currentTemplateDocumentSchemaVersion,
    template: validated.template,
  }
  return `${JSON.stringify(document, null, 2)}\n`
}

export function serializeTemplateSourceDocument(bundle: CardTemplateBundle) {
  const definition = validatedDefinition(bundle.manifest, bundle.template, bundle.colorPresets)
  const document: TemplateSourceDocument = {
    colorPresets: definition.colorPresets,
    format: templateSourceFormat,
    manifest: definition.manifest,
    schemaVersion: currentTemplateDocumentSchemaVersion,
    template: definition.template,
  }
  return `${JSON.stringify(document, null, 2)}\n`
}

function userTemplateId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  return `user/${uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
}

export function makeUserTemplateCopy(bundle: CardTemplateBundle) {
  const name = bundle.manifest.name.endsWith(" (copy)")
    ? bundle.manifest.name
    : `${bundle.manifest.name} (copy)`
  return validateTemplateBundle(
    {
      assets: bundle.assets,
      colorPresets: bundle.colorPresets,
      manifest: { ...bundle.manifest, id: userTemplateId(), name, status: "supported" },
      template: bundle.template,
    },
    { requireUserId: true },
  )
}

export function applyTemplateSourceDocument(
  source: TemplateSource,
  assets: Readonly<Record<string, AssetSource>>,
) {
  return validateTemplateBundle(
    {
      assets,
      colorPresets: source.colorPresets,
      manifest: source.manifest,
      template: source.template,
    },
    { requireUserId: true },
  )
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as JsonRecord)[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "undefined"
}

function editorLayerSurface(template: CardTemplate) {
  const surface: unknown[] = []
  walkLayers(template.layers, ({ layer }) => {
    surface.push({
      defaultVisible: layer.defaultVisible,
      editorVisible: layer.editorVisible,
      fallbackField: layer.kind === "text" ? layer.fallbackField : undefined,
      field:
        layer.kind === "artwork" || layer.kind === "repeated-image" || layer.kind === "text"
          ? layer.field
          : undefined,
      format: layer.kind === "text" ? layer.format : undefined,
      group: layer.group,
      id: layer.id,
      kind: layer.kind,
      pairIndex: layer.kind === "text" ? layer.pairIndex : undefined,
      presetTarget: layer.kind === "raster" ? layer.presetTarget : undefined,
      renderer: layer.kind === "raster" || layer.kind === "canvas" ? layer.renderer : undefined,
      semanticPath: layer.kind === "text" ? layer.semanticPath : undefined,
      semanticStyles: isTextLayerDefinition(layer)
        ? layer.semanticStyles?.map((style) => ({
            id: style.id,
            profileIds: style.typography?.fitProfiles?.map((profile) => profile.id),
          }))
        : undefined,
      profileIds: isTextLayerDefinition(layer)
        ? layer.typography.fitProfiles?.map((profile) => profile.id)
        : undefined,
    })
  })
  return surface
}

function editorCardFieldSurface(template: CardTemplate) {
  return template.cardFields.map((field) => {
    const surface = { ...field }
    delete surface.suggestions
    return surface
  })
}

function presetSurface(template: CardTemplate, colorPresets: ColorPresetCollection) {
  return collectPresetTargets(template).map((target) => ({
    names: Object.keys(colorPresets)
      .filter((name) => colorPresets[name]?.metadata?.target === target)
      .sort(),
    target,
  }))
}

interface EditorContract {
  colorPresets: ColorPresetCollection
  template: CardTemplate
}

function compareEditorContract(
  template: CardTemplate,
  colorPresets: ColorPresetCollection,
  contract: EditorContract,
) {
  if (
    stableJson(editorCardFieldSurface(template)) !==
    stableJson(editorCardFieldSurface(contract.template))
  ) {
    return {
      compatible: false as const,
      reason: "its card fields differ from the current editor contract",
    }
  }
  if (
    stableJson(editorLayerSurface(template)) !== stableJson(editorLayerSurface(contract.template))
  ) {
    return {
      compatible: false as const,
      reason: "its layer and text-control contract differs from the current editor",
    }
  }
  if (
    stableJson(template.masks?.map(({ id }) => id) ?? []) !==
    stableJson(contract.template.masks?.map(({ id }) => id) ?? [])
  ) {
    return {
      compatible: false as const,
      reason: "its mask IDs differ from the current editor contract",
    }
  }
  if (
    stableJson(presetSurface(template, colorPresets)) !==
    stableJson(presetSurface(contract.template, contract.colorPresets))
  ) {
    return {
      compatible: false as const,
      reason: "its color-preset controls differ from the current editor contract",
    }
  }
  return { compatible: true as const }
}

/** A template can drive the editor when it matches any official template's editor contract. */
export function templateEditorCompatibility(
  template: CardTemplate,
  colorPresets: ColorPresetCollection,
) {
  const results = officialContracts.map((contract) =>
    compareEditorContract(template, colorPresets, contract),
  )
  return results.find((result) => result.compatible) ?? results[0]!
}

/** Whether two bundles expose the same editor contract, so a card can move between them intact. */
export function templatesShareEditorContract(
  source: Pick<CardTemplateBundle, "colorPresets" | "template">,
  target: Pick<CardTemplateBundle, "colorPresets" | "template">,
) {
  return compareEditorContract(source.template, source.colorPresets, {
    colorPresets: target.colorPresets,
    template: target.template,
  }).compatible
}
