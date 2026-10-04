import { useEffect, useRef } from "react"

export function safeFileName(name: string) {
  const normalized = name
    .trim()
    .replaceAll(/[^a-zA-Z0-9_-]+/g, "-")
    .replaceAll(/^-|-$/g, "")
  return normalized || "yugilife-card"
}

export function readSelectedFile(
  event: { target: HTMLInputElement },
  maximumBytes: number,
  noun: string,
) {
  const file = event.target.files?.[0]
  event.target.value = ""
  if (file && file.size > maximumBytes) {
    throw new Error(`${noun} must be smaller than ${maximumBytes / 1024 / 1024} MiB.`)
  }
  return file
}

// Object URLs live until unmount so revoking cannot race the browser consuming a download.
export function useDownloads() {
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), [])
  return function download(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    urls.current.push(url)
    const link = document.createElement("a")
    link.download = fileName
    link.href = url
    document.body.append(link)
    link.click()
    link.remove()
  }
}
