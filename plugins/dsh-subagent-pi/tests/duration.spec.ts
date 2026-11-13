import { describe, expect, it } from 'vitest'
import { formatDuration, parseDuration } from '../src/duration.ts'
import { PiSubagentFailure } from '../src/failures.ts'

describe('duration parsing', () => {
  it('accepts unit suffixes', () => {
    expect(parseDuration('45s')).toBe(45_000)
    expect(parseDuration('30m')).toBe(1_800_000)
    expect(parseDuration('1h')).toBe(3_600_000)
    expect(parseDuration('1h30m')).toBe(5_400_000)
    expect(parseDuration('2h 15m')).toBe(8_100_000)
  })

  it('accepts plain milliseconds', () => {
    expect(parseDuration('3600000')).toBe(3_600_000)
  })

  it('accepts the timer ceiling and rejects past it', () => {
    expect(parseDuration('596h')).toBe(2_145_600_000)
    expect(() => parseDuration('597h')).toThrow(PiSubagentFailure)
  })

  it('rejects zero, negatives and unknown units', () => {
    for (const text of ['0', '-1h', '1d', 'h', '1h30', '']) {
      expect(() => parseDuration(text)).toThrow(PiSubagentFailure)
    }
  })
})

describe('duration formatting', () => {
  it('prefers the largest whole unit', () => {
    expect(formatDuration(3_600_000)).toBe('1h')
    expect(formatDuration(5_400_000)).toBe('90m')
    expect(formatDuration(45_000)).toBe('45s')
    expect(formatDuration(1_500)).toBe('1500ms')
  })
})
