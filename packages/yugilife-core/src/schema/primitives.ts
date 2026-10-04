export type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function fail(message: string): never {
  throw new Error(message)
}

export function record(value: unknown, location: string): UnknownRecord {
  if (!isRecord(value)) fail(`${location} must be an object.`)
  return value
}

export function nonEmptyRecord(value: unknown, location: string): UnknownRecord {
  const parsed = record(value, location)
  if (Object.keys(parsed).length === 0) fail(`${location} must not be empty.`)
  return parsed
}

export function nonEmptyArray(value: unknown, location: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0) fail(`${location} must be a non-empty array.`)
  return value
}

export function nonEmptyString(value: unknown, location: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${location} must be a non-empty string.`)
  }
  return value
}

export function finiteNumber(value: unknown, location: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${location} must be a finite number.`)
  }
  return value
}

export function positiveNumber(value: unknown, location: string): number {
  const parsed = finiteNumber(value, location)
  if (parsed <= 0) fail(`${location} must be positive.`)
  return parsed
}

export function positiveInteger(value: unknown, location: string) {
  if (!Number.isInteger(value) || Number(value) <= 0)
    fail(`${location} must be a positive integer.`)
}

export function optionalString(value: unknown, location: string): string | undefined {
  return value === undefined ? undefined : nonEmptyString(value, location)
}

export function optionalBoolean(value: unknown, location: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "boolean") fail(`${location} must be a boolean.`)
  return value
}

export function optionalMember(
  value: unknown,
  members: ReadonlySet<string>,
  location: string,
  message = "is unsupported.",
) {
  if (value !== undefined && (typeof value !== "string" || !members.has(value))) {
    fail(`${location} ${message}`)
  }
}

export function stringArray(value: unknown, location: string, unique = false): readonly string[] {
  if (!Array.isArray(value)) fail(`${location} must be an array.`)
  const values = value.map((entry, index) => nonEmptyString(entry, `${location}[${index}]`))
  if (unique && new Set(values).size !== values.length) {
    fail(`${location} must contain unique values.`)
  }
  return values
}

export function assertNoUnknownKeys(
  value: UnknownRecord,
  allowed: ReadonlySet<string> | readonly string[],
  location: string,
) {
  const allowedKeys = allowed instanceof Set ? allowed : new Set(allowed)
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key))
  if (unknownKeys.length > 0) {
    fail(`${location} has unsupported fields: ${unknownKeys.join(", ")}.`)
  }
}

export function relativePath(value: unknown, location: string): string {
  const parsed = nonEmptyString(value, location)
  if (parsed.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(parsed)) {
    fail(`${location} must be relative to its template directory; received "${parsed}".`)
  }
  return parsed
}

export function point(value: unknown, location: string) {
  const parsed = record(value, location)
  assertNoUnknownKeys(parsed, ["x", "y"], location)
  finiteNumber(parsed["x"], `${location}.x`)
  finiteNumber(parsed["y"], `${location}.y`)
}

export function region(value: unknown, location: string) {
  const parsed = record(value, location)
  assertNoUnknownKeys(parsed, ["height", "width", "x", "y"], location)
  finiteNumber(parsed["x"], `${location}.x`)
  finiteNumber(parsed["y"], `${location}.y`)
  positiveNumber(parsed["width"], `${location}.width`)
  positiveNumber(parsed["height"], `${location}.height`)
}

export function finiteTuple(value: unknown, length: number, location: string): readonly number[] {
  if (!Array.isArray(value) || value.length !== length) {
    fail(`${location} must contain exactly ${length} finite numbers.`)
  }
  return value.map((entry, index) => finiteNumber(entry, `${location}[${index}]`))
}
