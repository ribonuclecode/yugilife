export const coldFirstAlpha = [
  {
    id: "setup",
    label: "Model loading and session setup",
    note: "once per page",
    value: 1738.5,
  },
  { id: "encoder", label: "Encoder", note: "once per image", value: 7606.7 },
  { id: "prompt", label: "First prompt", note: "and every click after it", value: 7934.9 },
] as const

export const quantizationVariants = [
  { emphasis: true, id: "fp32", label: "FP32", x: 343.97, y: 0 },
  { emphasis: true, id: "fp16", label: "FP16", x: 172.23, y: 0.0003 },
  { emphasis: true, id: "int8", label: "INT8", x: 104.15, y: 0.00145 },
  { id: "hqq32", label: "INT4 HQQ b32", x: 80.73, y: 0.01527 },
  { id: "rtn32", label: "INT4 RTN b32", x: 71.87, y: 0.01673 },
  { id: "hqq64", label: "INT4 HQQ b64", x: 70.61, y: 0.01762 },
  { id: "rtn64", label: "INT4 RTN b64", x: 66.18, y: 0.01837 },
  { id: "hqq128", label: "INT4 HQQ b128", x: 65.54, y: 0.02218 },
  { emphasis: true, id: "rtn128", label: "INT4 RTN b128", x: 63.33, y: 0.02406 },
] as const

export const maskPipelines = [
  { label: "WD tagger → SAM3", note: "anime tag classifier", value: 3535.01 },
  { label: "LFM2.5-VL → SAM3", note: "noun phrases", value: 3487.65 },
  { label: "FastVLM → SAM3", note: "noun phrases", value: 2820.83 },
  { label: "Florence-2 → SAM3", note: "phrase extraction", value: 2202.78 },
  { emphasis: true, label: "ToonOut", note: "no phrase stage at all", value: 484.18 },
] as const

const avifSweep: readonly (readonly [number, number, number])[] = [
  [100, 40.37, 0.0017],
  [99, 68.91, 0.0072],
  [97, 74.67, 0.0092],
  [96, 79.08, 0.011],
  [94, 81.34, 0.0121],
  [92, 83.45, 0.0133],
  [91, 84.66, 0.0142],
  [88, 86.7, 0.0161],
  [86, 87.43, 0.0172],
  [84, 87.95, 0.0181],
  [82, 88.41, 0.0189],
  [80, 89.1, 0.0209],
  [75, 89.99, 0.0241],
  [70, 90.63, 0.0277],
  [65, 91.22, 0.0313],
  [60, 91.93, 0.0356],
  [55, 92.76, 0.0423],
  [50, 93.79, 0.0527],
  [45, 94.32, 0.0613],
  [40, 95.03, 0.0732],
  [35, 95.6, 0.0859],
  [30, 96.07, 0.101],
  [25, 96.53, 0.1197],
  [20, 96.88, 0.1393],
  [15, 97.3, 0.165],
  [10, 97.63, 0.2206],
]

export const avifErrorBySize = avifSweep
  .map(([, reduction, error]) => [Number((100 - reduction).toFixed(2)), error] as const)
  .sort((a, b) => a[0] - b[0])

const avifQualityBySize = new Map(
  avifSweep.map(([quality, reduction]) => [Number((100 - reduction).toFixed(2)), quality]),
)

export function avifQualityAt(size: number) {
  const quality = avifQualityBySize.get(size)
  return quality === undefined ? "n/a" : `q${quality}`
}

export const AVIF_SHIPPED_SIZE = 6.21

export const avifQualityWaypoints = [
  { label: "q99", x: 31.09 },
  { label: "q88", x: 13.3 },
  { label: "q20", x: 3.12 },
] as const
