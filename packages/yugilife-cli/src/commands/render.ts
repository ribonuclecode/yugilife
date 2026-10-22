import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { BrowserHost } from "../runtime/browser-host.js"
import { CliError } from "../runtime/errors.js"
import { buildRenderRequest, decodeRasterDataUrl, loadRenderRequest } from "../runtime/input.js"

import type { RenderRequestOptions } from "../runtime/input.js"
import type { RenderFormat, SerializedRenderRequest } from "../runtime/protocol.js"

type SignalOption = { readonly signal?: AbortSignal | undefined }

export interface RenderInput {
  readonly card: Readonly<Record<string, unknown>>
  /** Field or asset key → local file path, resolved against `baseDirectory` (default: cwd). */
  readonly files?: Readonly<Record<string, string>>
  readonly presentationOverrides?: Readonly<Record<string, unknown>>
  readonly template?: string
}

/** A started Chromium that several `render()` calls can share. Call `close()` when done. */
export class RenderBrowser {
  readonly #host = new BrowserHost()
  #queue: Promise<unknown> = Promise.resolve()

  /** @internal */
  async start(signal: AbortSignal | undefined) {
    await this.#host.start(signal)
  }

  /** @internal The harness page renders one card at a time, so calls wait their turn. */
  render(request: SerializedRenderRequest, signal: AbortSignal | undefined) {
    // ponytail: renders run one after another; a pool of pages if parallel throughput matters
    const next = this.#queue.then(() => this.#host.render(request, signal))
    this.#queue = next.catch(() => undefined)
    return next
  }

  async close() {
    await this.#host.close()
  }
}

/** Launches Chromium once so it can be passed to `render()` as `browser`. */
export async function launchBrowser(options: SignalOption = {}) {
  const browser = new RenderBrowser()
  await browser.start(options.signal)
  return browser
}

export interface RenderOptions extends RenderRequestOptions, SignalOption {
  readonly baseDirectory?: string | undefined
  /** Shared browser from `launchBrowser()`; without it each call launches and closes its own. */
  readonly browser?: RenderBrowser | undefined
  /** Defaults to `"png"`. */
  readonly format?: RenderFormat | undefined
}

async function renderRequest(
  request: SerializedRenderRequest,
  label: string,
  signal: AbortSignal | undefined,
  sharedBrowser?: RenderBrowser,
) {
  const browser = sharedBrowser ?? (await launchBrowser({ signal }))
  try {
    const response = await browser.render(request, signal)
    return {
      data:
        response.format === "svg"
          ? Buffer.from(response.payload)
          : decodeRasterDataUrl(response.payload, response.format, label),
      warnings: response.warnings,
    }
  } finally {
    if (!sharedBrowser) await browser.close()
  }
}

/** Renders one card in memory and returns the encoded image bytes. */
export async function render(input: RenderInput, options: RenderOptions = {}) {
  const request = await buildRenderRequest(
    input,
    "render() input",
    path.resolve(options.baseDirectory ?? "."),
    options.format ?? "png",
    options,
  )
  return renderRequest(request, "render()", options.signal, options.browser)
}

export async function runRender(
  inputPath: string,
  outputPath: string,
  options: RenderRequestOptions & SignalOption = {},
) {
  const resolvedOutputPath = path.resolve(outputPath)
  const request = await loadRenderRequest(inputPath, resolvedOutputPath, options)
  const { data, warnings } = await renderRequest(request, outputPath, options.signal)
  try {
    await mkdir(path.dirname(resolvedOutputPath), { recursive: true })
    await writeFile(resolvedOutputPath, data)
  } catch (error) {
    throw new CliError("OUTPUT_WRITE_FAILED", `Could not write output "${outputPath}".`, {
      cause: error,
    })
  }
  return warnings
}
