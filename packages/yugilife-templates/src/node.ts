import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import {
  DEFAULT_TEMPLATE_ID,
  officialTemplateEntries,
  templateIdentity,
} from "./official-entries.js"

import type { OfficialTemplateEntry } from "./official-entries.js"
import type { TemplateId } from "yugilife-core"

export { DEFAULT_TEMPLATE_ID }

export type InstalledTemplateBundle = OfficialTemplateEntry

const mediaTypes: Readonly<Record<string, string>> = {
  otf: "font/otf",
  png: "image/png",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
}

function mediaType(file: URL) {
  const extension = file.pathname.toLowerCase().split(".").at(-1) ?? ""
  return mediaTypes[extension] ?? "application/octet-stream"
}

async function dataUrl(value: string) {
  const url = new URL(value, import.meta.url)
  if (url.protocol !== "file:") {
    throw new Error(`Installed template assets must be local files; received "${url.protocol}".`)
  }
  const contents = await readFile(fileURLToPath(url))
  return `data:${mediaType(url)};base64,${contents.toString("base64")}`
}

export const PACKAGED_TEMPLATES = Object.freeze(
  officialTemplateEntries.map(({ manifest }) => Object.freeze(templateIdentity(manifest))),
)

export async function loadInstalledTemplate(
  id: TemplateId = DEFAULT_TEMPLATE_ID,
): Promise<InstalledTemplateBundle> {
  const entry = officialTemplateEntries.find(({ manifest }) => manifest.id === id)
  if (!entry) throw new Error(`Official template "${id}" is not installed with this package.`)
  const assets = Object.fromEntries(
    await Promise.all(
      Object.entries(entry.assets).map(async ([assetId, source]) => [
        assetId,
        await dataUrl(source),
      ]),
    ),
  ) as Readonly<Record<string, string>>
  return Object.freeze({ ...entry, assets })
}
