import { renderCard, TemplateValidationError } from "yugilife-core"

import type {
  BrowserApi,
  BrowserErrorCode,
  BrowserRenderResponse,
  BrowserSmokeResult,
  SerializedRenderRequest,
  SerializedRenderWarning,
} from "../runtime/protocol.js"
import type { CardData, CardTemplate, RenderOptions } from "yugilife-core"

let activeAbortController: AbortController | undefined

const smokeTemplate: CardTemplate = {
  cardFields: [
    {
      defaultValue: "YugiLife CLI",
      kind: "text",
      label: "Name",
      name: "name",
      required: true,
    },
  ],
  dimensions: { height: 2, width: 2 },
  layers: [],
  schemaVersion: 1,
}

function failure(code: BrowserErrorCode, message: string): BrowserRenderResponse {
  return { error: { code, message }, ok: false }
}

function serializeError(error: unknown): BrowserRenderResponse {
  if (error instanceof DOMException && error.name === "AbortError") {
    return failure("ABORTED", "The render was aborted.")
  }
  if (error instanceof TemplateValidationError) {
    return failure("RENDER_VALIDATION_FAILED", error.message)
  }
  return failure("RENDER_FAILED", error instanceof Error ? error.message : String(error))
}

function asDataUrl(file: string) {
  if (!file.startsWith("data:")) throw new Error("Browser file payloads must be data URLs.")
  return file
}

async function blobToDataUrl(blob: Blob, signal: AbortSignal) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  signal.throwIfAborted()
  let binary = ""
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return `data:${blob.type};base64,${btoa(binary)}`
}

function warningsFor(rendered: Awaited<ReturnType<typeof renderCard>>) {
  return rendered.warnings.map((warning): SerializedRenderWarning => ({
    code: warning.code,
    layerId: warning.layerId,
    length: warning.length,
    message: warning.message,
    offset: warning.offset,
  }))
}

async function render(request: SerializedRenderRequest): Promise<BrowserRenderResponse> {
  if (activeAbortController)
    return failure("RENDER_FAILED", "The browser renderer is already busy.")
  const controller = new AbortController()
  activeAbortController = controller
  try {
    const card = { ...request.card }
    const assets: Record<string, string> = {}
    for (const [key, file] of Object.entries(request.files)) {
      const dataUrl = asDataUrl(file)
      card[key] = dataUrl
      assets[key] = dataUrl
    }
    const renderOptions: RenderOptions = {
      assets,
      signal: controller.signal,
      templateBundle: request.templateBundle as RenderOptions["templateBundle"],
      ...(request.presentationOverrides === undefined
        ? {}
        : {
            presentationOverrides: request.presentationOverrides,
          }),
    }
    const rendered = await renderCard(card as CardData, renderOptions)
    const title = request.title === undefined ? {} : { title: request.title }
    const payload =
      request.format === "svg"
        ? await rendered.toSvg({ ...title, textMode: request.textMode ?? "paths" })
        : await blobToDataUrl(
            await rendered.toImage({ format: request.format, ...request.rasterOptions }),
            controller.signal,
          )
    return {
      format: request.format,
      ok: true,
      payload,
      warnings: warningsFor(rendered),
    }
  } catch (error) {
    return serializeError(error)
  } finally {
    activeAbortController = undefined
  }
}

async function smoke(): Promise<BrowserSmokeResult> {
  const rendered = await renderCard(
    { name: "YugiLife CLI" },
    {
      templateBundle: {
        assets: {},
        colorPresets: {},
        manifest: {
          assets: {},
          id: "card/cli-smoke",
          kind: "card",
          name: "CLI smoke",
          template: "template.json",
          version: "2026.01.01",
        },
        template: smokeTemplate,
      },
    },
  )
  return {
    dimensions: rendered.template.dimensions,
    ready: true,
  }
}

const api: BrowserApi = {
  cancel() {
    activeAbortController?.abort()
  },
  render,
  smoke,
}

;(globalThis as unknown as { __yugilifeCli: BrowserApi }).__yugilifeCli = api
