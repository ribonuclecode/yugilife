import { decodePreparedTextures, prepareTemplateTextures } from "yugilife-core/color-grading"

import { readPreparedTextures, storePreparedTextures } from "./prepared-texture-storage"

import type { CardTemplateBundle, PreparedTextures } from "yugilife-core"
import type { TemplateLoadProgress } from "yugilife-templates"

export interface ActivePreparedTextures {
  // Matched by object identity: edited user templates may change presets without a new version.
  readonly bundle: CardTemplateBundle
  readonly textures: PreparedTextures | undefined
}

interface TexturePreparationProgress {
  readonly completed: number
  readonly phase: "preparing"
  readonly total: number
}

export type TemplateActivationProgress = TemplateLoadProgress | TexturePreparationProgress

export function activationProgressPercent(progress: TemplateActivationProgress) {
  const done = progress.phase === "preparing" ? progress.completed : progress.loaded
  const total = progress.total ?? 0
  return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : undefined
}

export interface PrepareTexturesOptions {
  readonly onProgress?: ((completed: number, total: number) => void) | undefined
  readonly signal?: AbortSignal | undefined
}

export async function acquirePreparedTextures(
  bundle: CardTemplateBundle,
  options: PrepareTexturesOptions = {},
): Promise<ActivePreparedTextures | undefined> {
  const { id: templateId, version } = bundle.manifest
  try {
    options.onProgress?.(0, 0)
    const stored = await readPreparedTextures(templateId, version)
    if (options.signal?.aborted) return undefined
    if (stored) {
      return { bundle, textures: stored.length > 0 ? decodePreparedTextures(stored) : undefined }
    }

    const { payloads, textures } = await prepareTemplateTextures(bundle, options)
    if (options.signal?.aborted) return undefined
    if (payloads.length === 0) return { bundle, textures: undefined }
    try {
      await storePreparedTextures(templateId, version, payloads)
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.warn(`Could not cache prepared textures for "${templateId}".`, error)
      }
    }
    return { bundle, textures }
  } catch (error: unknown) {
    if (options.signal?.aborted) return undefined
    if (import.meta.env.DEV) {
      console.warn(`Could not prepare textures for "${templateId}".`, error)
    }
    return { bundle, textures: undefined }
  }
}

export function preparedTexturesForBundle(
  prepared: ActivePreparedTextures | undefined,
  bundle: CardTemplateBundle | undefined,
) {
  return preparedTexturesSettled(prepared, bundle) ? prepared?.textures : undefined
}

export function preparedTexturesSettled(
  prepared: ActivePreparedTextures | undefined,
  bundle: CardTemplateBundle | undefined,
) {
  return prepared !== undefined && bundle !== undefined && prepared.bundle === bundle
}
