export interface SliderScale {
  positionToValue: (position: number, min: number, max: number) => number
  valueToPosition: (value: number, min: number, max: number) => number
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value))
}

export const linearSliderScale: SliderScale = {
  positionToValue(position, min, max) {
    if (max <= min) return min
    return min + clampUnit(position) * (max - min)
  },
  valueToPosition(value, min, max) {
    if (max <= min) return 0
    return clampUnit((value - min) / (max - min))
  },
}

function powerCurveExponents(midpoint: number, midpointPosition: number, min: number, max: number) {
  if (max <= min) return null
  const normalizedMidpoint = (midpoint - min) / (max - min)
  const normalizedMidpointPosition = clampUnit(midpointPosition)
  if (
    normalizedMidpoint <= 0 ||
    normalizedMidpoint >= 1 ||
    normalizedMidpointPosition <= 0 ||
    normalizedMidpointPosition >= 1
  ) {
    return null
  }

  const valueToPositionExponent =
    Math.log(normalizedMidpointPosition) / Math.log(normalizedMidpoint)
  return {
    positionToValueExponent: 1 / valueToPositionExponent,
    valueToPositionExponent,
  }
}

export function powerSliderScale(midpoint: number, midpointPosition = 0.5): SliderScale {
  return {
    positionToValue(position, min, max) {
      const exponents = powerCurveExponents(midpoint, midpointPosition, min, max)
      if (!exponents) {
        return linearSliderScale.positionToValue(position, min, max)
      }
      return min + Math.pow(clampUnit(position), exponents.positionToValueExponent) * (max - min)
    },
    valueToPosition(value, min, max) {
      const exponents = powerCurveExponents(midpoint, midpointPosition, min, max)
      if (!exponents) {
        return linearSliderScale.valueToPosition(value, min, max)
      }
      const normalizedValue = clampUnit((value - min) / (max - min))
      return Math.pow(normalizedValue, exponents.valueToPositionExponent)
    },
  }
}
