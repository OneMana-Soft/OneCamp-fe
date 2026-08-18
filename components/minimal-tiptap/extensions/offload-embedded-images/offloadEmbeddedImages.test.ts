import { describe, it, expect } from 'vitest'
import { shouldOffloadSrc } from './offloadEmbeddedImages'

// The decision of WHICH payloads to move out of a document is the part that has to
// be right: too eager and it uploads inline markers or loops forever, too lax and a
// pasted screenshot stays embedded and reaches the search index.

const dataURL = (bytes: number) => `data:image/png;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`
const MIN = 8 * 1024

describe('shouldOffloadSrc', () => {
  it('offloads an embedded payload big enough to matter', () => {
    expect(shouldOffloadSrc(dataURL(64 * 1024), MIN, new Set())).toBe(true)
  })

  // A hosted image is already fine; re-uploading it would be pointless work and
  // would churn object storage on every keystroke.
  it('ignores anything already hosted', () => {
    expect(shouldOffloadSrc('https://cdn.example.com/a.png', MIN, new Set())).toBe(false)
    expect(shouldOffloadSrc('/uploads/a.png', MIN, new Set())).toBe(false)
    expect(shouldOffloadSrc('', MIN, new Set())).toBe(false)
  })

  // An inline marker or tracking pixel is legitimate rich text. Uploading it would
  // cost a round trip and clutter storage for no benefit.
  it('leaves small inline markers alone', () => {
    expect(shouldOffloadSrc(dataURL(512), MIN, new Set())).toBe(false)
    expect(shouldOffloadSrc('data:image/gif;base64,R0lGODlhAQABAA==', MIN, new Set())).toBe(false)
  })

  it('treats the threshold as inclusive', () => {
    const atLimit = dataURL(MIN)
    expect(shouldOffloadSrc(atLimit, MIN, new Set())).toBe(true)
  })

  // THE LOOP GUARD. Without this, a payload whose upload keeps failing would be
  // retried on every editor update, hammering the server forever.
  it('never re-attempts a payload it has already tried', () => {
    const src = dataURL(64 * 1024)
    const attempted = new Set([src])
    expect(shouldOffloadSrc(src, MIN, attempted)).toBe(false)
  })

  it('does not confuse two different payloads', () => {
    const a = dataURL(64 * 1024)
    const b = `data:image/jpeg;base64,${'B'.repeat(90000)}`
    expect(shouldOffloadSrc(b, MIN, new Set([a]))).toBe(true)
  })

  it('is safe on non-string attributes', () => {
    for (const bad of [undefined, null, 0, {}, []]) {
      expect(shouldOffloadSrc(bad, MIN, new Set())).toBe(false)
    }
  })
})
