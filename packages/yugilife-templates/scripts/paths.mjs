import path from "node:path"
import { fileURLToPath } from "node:url"

export const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
