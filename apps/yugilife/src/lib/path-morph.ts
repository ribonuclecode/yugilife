const pathNumberPattern = /-?\d*\.?\d+/g

export function createPathInterpolator(from: string, to: string) {
  const fromNumbers = from.match(pathNumberPattern)?.map(Number) ?? []
  const toNumbers = to.match(pathNumberPattern)?.map(Number) ?? []

  return (progress: number) => {
    let numberIndex = 0

    return to.replace(pathNumberPattern, () => {
      const fromValue = fromNumbers[numberIndex] ?? 0
      const toValue = toNumbers[numberIndex] ?? fromValue
      numberIndex += 1
      return String(fromValue + (toValue - fromValue) * progress)
    })
  }
}
