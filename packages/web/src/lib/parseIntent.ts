// Parent-side intent FILTER for messages from the annotate iframe (Step 12).
//
// This is explicitly a shape/size/source filter — NOT a trust or authority guard. Hostile
// uploaded HTML shares the content origin and can forge any message, so passing this filter
// proves nothing about intent. The real guard is the architectural invariant (COMMENTS_PLAN
// constraint 1): an iframe message may only OPEN UI or SUGGEST an anchor; every mutation is
// parent-initiated after an explicit user action, and all anchor resolution is server-side.

export type SelectIntent = { type: 'select'; quote: string; prefix: string; suffix: string }
export type ReadyIntent = { type: 'ready'; filePath: string }
export type Intent = SelectIntent | ReadyIntent

export type ExpectedSource = { origin: string; source: MessageEventSource | Window | null }

const MAX_FIELD = 2000 // chars per text field
const MAX_TOTAL = 8000 // total across fields, bounds a single message

const str = (v: unknown, max = MAX_FIELD): string | null =>
  typeof v === 'string' && v.length <= max ? v : null

/** Validate a message event from the content iframe. Returns a typed intent or null. */
export function parseIntent(event: MessageEvent, expected: ExpectedSource): Intent | null {
  if (event.origin !== expected.origin) return null
  if (expected.source && event.source !== expected.source) return null
  const data = event.data
  if (!data || typeof data !== 'object') return null

  switch ((data as { type?: unknown }).type) {
    case 'glance:select': {
      const d = data as { quote?: unknown; prefix?: unknown; suffix?: unknown }
      const quote = str(d.quote)
      const prefix = str(d.prefix) ?? ''
      const suffix = str(d.suffix) ?? ''
      if (!quote || quote.length + prefix.length + suffix.length > MAX_TOTAL) return null
      return { type: 'select', quote, prefix, suffix }
    }
    case 'glance:ready': {
      const filePath = str((data as { filePath?: unknown }).filePath)
      return filePath ? { type: 'ready', filePath } : null
    }
    default:
      return null
  }
}
