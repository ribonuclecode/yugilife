import type { AssetSource } from "../contracts/index.js"

export function abortReason(signal?: AbortSignal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("Rendering was aborted.", "AbortError")
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortReason(signal)
}

export async function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal)
  if (!signal) return await promise
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortReason(signal))
    signal.addEventListener("abort", abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
  })
}

function urlCacheKey(source: string | URL) {
  const value = source instanceof URL ? source.href : source
  try {
    return new URL(value, typeof document === "undefined" ? undefined : document.baseURI).href
  } catch {
    return value
  }
}

export class SourcePromiseCache<T> {
  readonly #byObject = new WeakMap<object, Map<string, Promise<T>>>()
  readonly #byUrl = new Map<string, Promise<T>>()
  readonly #maximumUrlEntries: number

  constructor(maximumUrlEntries: number) {
    this.#maximumUrlEntries = maximumUrlEntries
  }

  getOrCreate(source: AssetSource, variant: string, create: () => Promise<T>): Promise<T> {
    const { cache, key } = this.#locate(source, variant)
    const cached = cache.get(key)
    if (cached) {
      if (cache === this.#byUrl) this.#touch(key, cached)
      return cached
    }
    const promise = create()
    cache.set(key, promise)
    if (cache === this.#byUrl) this.#evictOldest()
    void promise.catch(() => {
      if (cache.get(key) === promise) cache.delete(key)
    })
    return promise
  }

  #locate(source: AssetSource, variant: string) {
    if (typeof source === "string" || source instanceof URL) {
      return { cache: this.#byUrl, key: `${urlCacheKey(source)}\u0000${variant}` }
    }
    let cache = this.#byObject.get(source)
    if (!cache) {
      cache = new Map()
      this.#byObject.set(source, cache)
    }
    return { cache, key: variant }
  }

  #touch(key: string, value: Promise<T>) {
    this.#byUrl.delete(key)
    this.#byUrl.set(key, value)
  }

  #evictOldest() {
    if (this.#byUrl.size <= this.#maximumUrlEntries) return
    const oldest = this.#byUrl.keys().next().value
    if (oldest !== undefined) this.#byUrl.delete(oldest)
  }
}
