const templateVersionPattern = /^\d{4}\.\d{2}\.\d{2}(?:\.[1-9]\d*)?$/

function versionParts(version: string) {
  return version.split(".").map(Number)
}

export function isTemplateVersion(value: unknown): value is string {
  if (typeof value !== "string" || !templateVersionPattern.test(value)) return false
  const [year = 0, month = 0, day = 0] = versionParts(value)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

export function compareTemplateVersions(left: string, right: string) {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  for (let index = 0; index < 4; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}
