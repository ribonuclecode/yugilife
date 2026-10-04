import {
  DEFAULT_TEMPLATE_ID,
  officialTemplateEntries,
  templateIdentity,
} from "./official-entries.js"

import type { OfficialTemplateEntry } from "./official-entries.js"
import type {
  AssetSourceMap,
  CardTemplateBundle,
  TemplateId,
  TemplateIdentity,
} from "yugilife-core"

export { DEFAULT_TEMPLATE_ID }

export interface TemplateLoadProgress {
  readonly loaded: number
  readonly phase: "downloading" | "ready"
  readonly total?: number | undefined
}

export interface TemplateLoadOptions {
  readonly onProgress?: ((progress: TemplateLoadProgress) => void) | undefined
  readonly signal?: AbortSignal | undefined
}

export type LoadedTemplateBundle = CardTemplateBundle

export interface OfficialTemplate extends CardTemplateBundle, TemplateIdentity {
  load(options?: TemplateLoadOptions): Promise<LoadedTemplateBundle>
}

function contentLength(response: Response) {
  const value = Number(response.headers.get("content-length"))
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

async function readResponse(
  response: Response,
  report: (bytes: number) => void,
  signal?: AbortSignal,
) {
  if (!response.body) {
    const blob = await response.blob()
    report(blob.size)
    return blob
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      length += value.byteLength
      report(value.byteLength)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Blob([bytes], {
    type: response.headers.get("content-type") ?? "application/octet-stream",
  })
}

async function loadBrowserEntry(
  entry: OfficialTemplateEntry,
  options: TemplateLoadOptions = {},
): Promise<LoadedTemplateBundle> {
  const responses = await Promise.all(
    Object.entries(entry.assets).map(async ([id, url]) => {
      const response = await fetch(url, options.signal ? { signal: options.signal } : undefined)
      if (!response.ok) {
        throw new Error(
          `Could not download asset "${id}" for template "${entry.manifest.id}": HTTP ${response.status}.`,
        )
      }
      return [id, response] as const
    }),
  )
  const lengths = responses.map(([, response]) => contentLength(response))
  const total = lengths.every((length) => length !== undefined)
    ? lengths.reduce<number>((sum, length) => sum + (length ?? 0), 0)
    : undefined
  let loaded = 0
  const reportProgress = (phase: TemplateLoadProgress["phase"]) =>
    options.onProgress?.({ loaded, phase, ...(total === undefined ? {} : { total }) })
  reportProgress("downloading")
  const assets = Object.fromEntries(
    await Promise.all(
      responses.map(async ([id, response]) => [
        id,
        await readResponse(
          response,
          (bytes) => {
            loaded += bytes
            reportProgress("downloading")
          },
          options.signal,
        ),
      ]),
    ),
  ) as AssetSourceMap
  reportProgress("ready")
  return Object.freeze({ ...entry, assets })
}

function descriptor(entry: OfficialTemplateEntry): OfficialTemplate {
  return Object.freeze({
    ...templateIdentity(entry.manifest),
    ...entry,
    load: (options?: TemplateLoadOptions) => loadBrowserEntry(entry, options),
  })
}

export const TEMPLATE_CATALOG: readonly OfficialTemplate[] = Object.freeze(
  officialTemplateEntries.map(descriptor),
)

export const DEFAULT_TEMPLATE = TEMPLATE_CATALOG.find(({ id }) => id === DEFAULT_TEMPLATE_ID)!

export function getOfficialTemplate(id: TemplateId) {
  const template = TEMPLATE_CATALOG.find((candidate) => candidate.id === id)
  if (!template) throw new Error(`The official template catalog does not contain "${id}".`)
  return template
}
