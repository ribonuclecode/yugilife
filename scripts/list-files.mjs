import { readdir } from "node:fs/promises"
import path from "node:path"

export async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const resolved = path.join(directory, entry.name)
      return entry.isDirectory() ? listFiles(resolved) : [resolved]
    }),
  )
  return nested.flat()
}
