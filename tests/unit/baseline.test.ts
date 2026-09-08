import { describe, expect, it } from 'vitest'

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

describe('Vitest baseline', () => {
  it('runs a pure function test', () => {
    expect(sum([1, 2, 3])).toBe(6)
  })
})
