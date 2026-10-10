/** Adds a fixed 5% preparation allowance, rounding the extra beads up. */
export function calculateSuggestedBeadCount(actualCount: number): number {
  if (!Number.isSafeInteger(actualCount) || actualCount < 0) {
    throw new RangeError('Actual bead count must be a non-negative safe integer')
  }

  const suggestedCount = actualCount + Math.ceil(actualCount / 20)
  if (!Number.isSafeInteger(suggestedCount)) {
    throw new RangeError('Suggested bead count exceeds the safe integer range')
  }

  return suggestedCount
}
