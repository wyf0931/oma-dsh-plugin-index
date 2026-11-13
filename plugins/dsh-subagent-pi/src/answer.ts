/**
 * Answer selection for one delegated Pi turn. Pi emits both streamed text
 * deltas and completed messages; the completed non-empty assistant message is
 * authoritative, matching the shared SubagentResult rule "last non-empty
 * assistant message, else the accumulated text stream".
 *
 * @module dsh-subagent-pi/answer
 */

/** One assistant message as the RPC stream reports it. */
interface AssistantMessage {
  readonly content: ReadonlyArray<{ readonly type: string; readonly text?: string }>
}

/** Extract the concatenated text content of one assistant message. */
function assistantText(message: AssistantMessage): string {
  let text = ''
  for (const block of message.content) {
    if (block.type === 'text' && block.text !== undefined) text += block.text
  }
  return text
}

/** State accumulated while a delegated turn streams. */
export interface AnswerCollector {
  /** Record a text delta from the streaming response. */
  delta(text: string): void
  /** Record a completed assistant message. */
  message(message: AssistantMessage): void
  /** Read the currently selected answer text. */
  answer(): string
}

/**
 * Create an answer collector for one delegated turn.
 * @returns a collector that prefers the last non-empty completed message.
 */
export function createAnswerCollector(): AnswerCollector {
  let streamed = ''
  let lastMessage = ''
  return {
    delta(text) {
      streamed += text
    },
    message(message) {
      const text = assistantText(message)
      if (text.trim().length > 0) lastMessage = text
    },
    answer() {
      return lastMessage !== '' ? lastMessage : streamed
    },
  }
}
