import { describe, expect, it } from 'vitest'
import { drainLines } from '../src/rpc.ts'

describe('JSONL framing', () => {
  it('splits complete records and keeps the remainder', () => {
    const { records, rest } = drainLines('{"type":"a"}\n{"type":"b"}\n{"type":"c"')
    expect(records).toEqual(['{"type":"a"}', '{"type":"b"}'])
    expect(rest).toBe('{"type":"c"')
  })

  it('accepts CRLF and skips blank lines', () => {
    expect(drainLines('{"type":"a"}\r\n\n{"type":"b"}\n').records).toEqual(['{"type":"a"}', '{"type":"b"}'])
  })

  it('does not split on U+2028 inside a JSON string', () => {
    const record = JSON.stringify({ type: 'message_end', text: 'a\u2028b' })
    const { records } = drainLines(`${record}\n`)
    expect(records).toEqual([record])
    expect(JSON.parse(records[0]!).text).toBe('a\u2028b')
  })

  it('returns no record for a partial chunk', () => {
    expect(drainLines('{"type":"message_').records).toEqual([])
  })
})
