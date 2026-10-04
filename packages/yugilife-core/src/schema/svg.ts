import { assertNoUnknownKeys, fail, record } from "./primitives.js"

import type { SvgElementDefinition } from "../contracts/index.js"

const safeSvgTags = new Set([
  "circle",
  "ellipse",
  "g",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "text",
  "tspan",
])

const safeSvgAttributes = new Set([
  "baseline-shift",
  "cx",
  "cy",
  "d",
  "dominant-baseline",
  "dx",
  "dy",
  "fill",
  "fill-opacity",
  "fill-rule",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "id",
  "lengthAdjust",
  "letter-spacing",
  "opacity",
  "points",
  "r",
  "role",
  "rx",
  "ry",
  "stroke",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "paint-order",
  "text-anchor",
  "textLength",
  "transform",
  "vector-effect",
  "viewBox",
  "white-space",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
  "xml:space",
])

const activeCssPatterns = [
  /url\s*\(/i,
  /(?:javascript|data|https?):/i,
  /(?:^|[\s;])@import\b/i,
  /expression\s*\(/i,
  /var\s*\(/i,
]

function isUnsafeControlCharacter(character: string) {
  const code = character.codePointAt(0) ?? 0
  return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127
}

function validateAttributeValue(name: string, value: unknown, location: string) {
  if (typeof value !== "string" && typeof value !== "number") {
    fail(`${location}.attributes.${name} must be text or a number.`)
  }
  if (typeof value !== "string") return
  if ([...value].some(isUnsafeControlCharacter)) {
    fail(`${location}.attributes.${name} contains unsupported control characters.`)
  }
  if (
    activeCssPatterns.some((pattern) => pattern.test(value)) ||
    ["\\", "/*", "*/"].some((token) => value.includes(token))
  ) {
    fail(`${location}.attributes.${name} must not contain URL or active CSS content.`)
  }
}

export function validateSvgElementShape(
  input: unknown,
  location = "SVG element",
): SvgElementDefinition {
  const element = record(input, location)
  assertNoUnknownKeys(element, ["attributes", "children", "tag", "text"], location)
  const tag = element["tag"]
  if (typeof tag !== "string" || !safeSvgTags.has(tag)) {
    fail(`${location}.tag must be a supported inert SVG element; received "${String(tag)}".`)
  }
  if (element["text"] !== undefined && typeof element["text"] !== "string") {
    fail(`${location}.text must be a string.`)
  }
  if (element["attributes"] !== undefined) {
    const attributes = record(element["attributes"], `${location}.attributes`)
    Object.entries(attributes).forEach(([name, value]) => {
      if (/^on/i.test(name)) fail(`${location} must not use event attribute "${name}".`)
      if (name.includes(":") && name !== "xml:space") {
        fail(`${location} must not use namespaced attribute "${name}".`)
      }
      if (!safeSvgAttributes.has(name))
        fail(`${location} uses unsupported SVG attribute "${name}".`)
      validateAttributeValue(name, value, location)
      if (name === "xml:space" && value !== "preserve") {
        fail(`${location}.attributes.xml:space must be "preserve".`)
      }
    })
  }
  const children = element["children"]
  if (children !== undefined) {
    if (!Array.isArray(children)) fail(`${location}.children must be an array.`)
    children.forEach((child, index) =>
      validateSvgElementShape(child, `${location}.children[${index}]`),
    )
  }
  return element as unknown as SvgElementDefinition
}
