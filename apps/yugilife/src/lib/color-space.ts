export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch"

export interface ParsedColor {
  h: number
  s: number
  v: number
  a: number
  r: number
  g: number
  b: number
  hex: string
  rgb: string
  hsl: string
  oklch: string
}

export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n))
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, n))
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s
  const hh = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0,
    g = 0,
    b = 0
  if (hh < 1) {
    r = c
    g = x
    b = 0
  } else if (hh < 2) {
    r = x
    g = c
    b = 0
  } else if (hh < 3) {
    r = 0
    g = c
    b = x
  } else if (hh < 4) {
    r = 0
    g = x
    b = c
  } else if (hh < 5) {
    r = x
    g = 0
    b = c
  } else {
    r = c
    g = 0
    b = x
  }
  const m = v - c
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const v = max
  const d = max - min
  const s = max === 0 ? 0 : d / max
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, v }
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0,
    s = 0
  if (d > 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, l }
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hh = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hh % 2) - 1))
  let r = 0,
    g = 0,
    b = 0
  if (hh < 1) {
    r = c
    g = x
  } else if (hh < 2) {
    r = x
    g = c
  } else if (hh < 3) {
    g = c
    b = x
  } else if (hh < 4) {
    g = x
    b = c
  } else if (hh < 5) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  const m = l - c / 2
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

function srgbToLinear(c: number): number {
  c = c / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return clamp01(v) * 255
}

function linearRgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

function oklabToLinearRgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  }
}

export function rgbToOklch(r: number, g: number, b: number): { L: number; C: number; H: number } {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const lab = linearRgbToOklab(lr, lg, lb)
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b)
  let H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI
  if (H < 0) H += 360
  return { L: lab.L, C, H }
}

export function oklchToRgb(L: number, C: number, H: number): { r: number; g: number; b: number } {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const lin = oklabToLinearRgb(L, a, b)
  return {
    r: clamp255(linearToSrgb(lin.r)),
    g: clamp255(linearToSrgb(lin.g)),
    b: clamp255(linearToSrgb(lin.b)),
  }
}

function to2hex(n: number): string {
  return Math.round(clamp255(n)).toString(16).padStart(2, "0")
}

export function rgbToHexStr(r: number, g: number, b: number, a: number): string {
  if (a >= 1) return `#${to2hex(r)}${to2hex(g)}${to2hex(b)}`
  return `#${to2hex(r)}${to2hex(g)}${to2hex(b)}${to2hex(a * 255)}`
}

function expandShortHex(h: string): string {
  if (h.length === 3)
    return h
      .split("")
      .map((c) => c + c)
      .join("")
  if (h.length === 4)
    return h
      .split("")
      .map((c) => c + c)
      .join("")
  return h
}

function parseHex(input: string): { r: number; g: number; b: number; a: number } | null {
  const m = input.trim().match(/^#?([0-9a-fA-F]{3,8})$/)
  if (!m) return null
  const matched = m[1]
  if (matched === undefined) return null
  let h = matched
  if (h.length === 3 || h.length === 4) h = expandShortHex(h)
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    }
  }
  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16) / 255,
    }
  }
  return null
}

export function parseColor(input: string): { r: number; g: number; b: number; a: number } | null {
  const s = input.trim()
  if (!s) return null
  if (s.startsWith("#") || /^[0-9a-fA-F]{3,8}$/.test(s)) {
    return parseHex(s)
  }
  const rgbM = s.match(/^rgba?\(\s*([^)]+)\)$/i)
  if (rgbM) {
    const captured = rgbM[1]
    if (captured === undefined) return null
    const parts = captured.split(/[\s,/]+/).filter(Boolean)
    const [rPart, gPart, bPart, alphaPart] = parts
    if (rPart === undefined || gPart === undefined || bPart === undefined) return null
    const r = parseFloat(rPart)
    const g = parseFloat(gPart)
    const b = parseFloat(bPart)
    let a = 1
    if (alphaPart !== undefined) {
      a = alphaPart.endsWith("%") ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart)
    }
    if ([r, g, b, a].some(Number.isNaN)) return null
    return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp01(a) }
  }
  const hslM = s.match(/^hsla?\(\s*([^)]+)\)$/i)
  if (hslM) {
    const captured = hslM[1]
    if (captured === undefined) return null
    const parts = captured.split(/[\s,/]+/).filter(Boolean)
    const [hPart, satPart, lightnessPart, alphaPart] = parts
    if (hPart === undefined || satPart === undefined || lightnessPart === undefined) return null
    const h = parseFloat(hPart)
    const sat = satPart.endsWith("%") ? parseFloat(satPart) / 100 : parseFloat(satPart)
    const l = lightnessPart.endsWith("%")
      ? parseFloat(lightnessPart) / 100
      : parseFloat(lightnessPart)
    let a = 1
    if (alphaPart !== undefined) {
      a = alphaPart.endsWith("%") ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart)
    }
    if ([h, sat, l, a].some(Number.isNaN)) return null
    const rgb = hslToRgb(h, clamp01(sat), clamp01(l))
    return { r: clamp255(rgb.r), g: clamp255(rgb.g), b: clamp255(rgb.b), a: clamp01(a) }
  }
  const oklchM = s.match(/^oklch\(\s*([^)]+)\)$/i)
  if (oklchM) {
    const captured = oklchM[1]
    if (captured === undefined) return null
    const parts = captured.split(/[\s,/]+/).filter(Boolean)
    const [lightnessPart, chromaPart, huePart, alphaPart] = parts
    if (lightnessPart === undefined || chromaPart === undefined || huePart === undefined)
      return null
    const L = lightnessPart.endsWith("%")
      ? parseFloat(lightnessPart) / 100
      : parseFloat(lightnessPart)
    const C = parseFloat(chromaPart)
    const H = parseFloat(huePart)
    let a = 1
    if (alphaPart !== undefined) {
      a = alphaPart.endsWith("%") ? parseFloat(alphaPart) / 100 : parseFloat(alphaPart)
    }
    if ([L, C, H, a].some(Number.isNaN)) return null
    const rgb = oklchToRgb(clamp01(L), Math.max(0, C), H)
    return { r: clamp255(rgb.r), g: clamp255(rgb.g), b: clamp255(rgb.b), a: clamp01(a) }
  }
  return null
}

let cssColorCtx: CanvasRenderingContext2D | null = null

export function resolveCssColor(
  input: string,
): { r: number; g: number; b: number; a: number } | null {
  const direct = parseColor(input)
  if (direct) return direct
  const s = input.trim()
  if (!s || typeof document === "undefined") return null
  if (!cssColorCtx) {
    cssColorCtx = document.createElement("canvas").getContext("2d")
    if (!cssColorCtx) return null
  }
  const ctx = cssColorCtx
  ctx.fillStyle = "#000000"
  ctx.fillStyle = s
  const first = String(ctx.fillStyle)
  ctx.fillStyle = "#ffffff"
  ctx.fillStyle = s
  const second = String(ctx.fillStyle)
  if (first !== second) return null
  return parseColor(first)
}

export function buildParsed(h: number, s: number, v: number, a: number): ParsedColor {
  const { r, g, b } = hsvToRgb(h, s, v)
  const hsl = rgbToHsl(r, g, b)
  const oklch = rgbToOklch(r, g, b)
  const hex = rgbToHexStr(r, g, b, a)
  const rgbStr =
    a >= 1
      ? `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
      : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(3))})`
  const hslStr =
    a >= 1
      ? `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%)`
      : `hsla(${Math.round(hsl.h)}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%, ${Number(a.toFixed(3))})`
  const oklchStr =
    a >= 1
      ? `oklch(${(oklch.L * 100).toFixed(1)}% ${oklch.C.toFixed(3)} ${oklch.H.toFixed(1)})`
      : `oklch(${(oklch.L * 100).toFixed(1)}% ${oklch.C.toFixed(3)} ${oklch.H.toFixed(1)} / ${Number(a.toFixed(3))})`
  return {
    h,
    s,
    v,
    a,
    r: Math.round(r),
    g: Math.round(g),
    b: Math.round(b),
    hex,
    rgb: rgbStr,
    hsl: hslStr,
    oklch: oklchStr,
  }
}

export function formatValueByFormat(parsed: ParsedColor, fmt: ColorFormat): string {
  switch (fmt) {
    case "hex":
      return parsed.hex
    case "rgb":
      return parsed.rgb
    case "hsl":
      return parsed.hsl
    case "oklch":
      return parsed.oklch
  }
}
