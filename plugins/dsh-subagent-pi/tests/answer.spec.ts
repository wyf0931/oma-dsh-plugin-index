import { describe, expect, it } from 'vitest'
import { createAnswerCollector } from '../src/answer.ts'

describe('answer collector', () => {
  it('prefers the last non-empty completed message over the stream', () => {
    const collector = createAnswerCollector()
    collector.delta('Hello')
    collector.message({ content: [{ type: 'text', text: 'Hello there' }] })
    collector.message({ content: [{ type: 'text', text: 'Final answer' }] })
    expect(collector.answer()).toBe('Final answer')
  })

  it('ignores empty completed messages', () => {
    const collector = createAnswerCollector()
    collector.message({ content: [{ type: 'text', text: '   ' }] })
    collector.delta('streamed')
    expect(collector.answer()).toBe('streamed')
  })

  it('joins several text blocks of one message', () => {
    const collector = createAnswerCollector()
    collector.message({ content: [{ type: 'text', text: 'a' }, { type: 'tool', text: 'noise' }, { type: 'text', text: 'b' }] })
    expect(collector.answer()).toBe('ab')
  })

  it('returns an empty answer when nothing arrived', () => {
    expect(createAnswerCollector().answer()).toBe('')
  })
})
