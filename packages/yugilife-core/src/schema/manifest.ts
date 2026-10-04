import { isTemplateVersion } from "../template-version.js"

import {
  assertNoUnknownKeys,
  fail,
  nonEmptyString,
  optionalMember,
  record,
  relativePath,
  stringArray,
} from "./primitives.js"

import type { TemplateManifest } from "../contracts/index.js"

const manifestKeys = [
  "assets",
  "colorPresets",
  "id",
  "kind",
  "name",
  "status",
  "template",
  "templateDependencies",
  "version",
]
const templateKinds = new Set(["card", "box", "playmat-board", "playmat-field"])
const templateStatuses = new Set(["supported", "experimental", "disabled"])
export function validateTemplateManifestShape(input: unknown): TemplateManifest {
  const manifest = record(input, "Malformed template manifest: <root>")
  assertNoUnknownKeys(manifest, manifestKeys, "Template manifest")
  nonEmptyString(manifest["id"], "id")
  const kind = manifest["kind"]
  if (typeof kind !== "string" || !templateKinds.has(kind)) {
    fail(`kind "${String(kind)}" is unsupported.`)
  }
  nonEmptyString(manifest["name"], "name")
  if (!isTemplateVersion(manifest["version"])) fail("version must use YYYY.MM.DD or YYYY.MM.DD.N.")
  optionalMember(
    manifest["status"],
    templateStatuses,
    "status",
    `${JSON.stringify(manifest["status"])} is unsupported.`,
  )
  relativePath(manifest["template"], "Manifest template path")
  const assets = record(manifest["assets"], "Malformed template manifest: assets")
  Object.entries(assets).forEach(([id, assetPath]) => {
    nonEmptyString(id, "Asset ID")
    relativePath(assetPath, `Asset "${id}" path`)
  })
  if (manifest["colorPresets"] !== undefined) {
    relativePath(manifest["colorPresets"], "Manifest color-preset path")
  }
  if (manifest["templateDependencies"] !== undefined) {
    stringArray(manifest["templateDependencies"], "templateDependencies", true)
  }
  return manifest as unknown as TemplateManifest
}
