import { describe, it, expect } from 'vitest'
import {
  exceedsUploadLimit,
  approxDataUrlBytes,
  formatUploadBytes,
  uploadLimitMessage,
  isDataURL,
  parseDataURL,
  extensionForMimeType,
  dataURLToFile,
} from '@/lib/utils/uploadLimit'

describe('exceedsUploadLimit', () => {
  it('refuses a payload over the cap', () => {
    expect(exceedsUploadLimit(11 * 1024 * 1024, 10 * 1024 * 1024)).toBe(true)
  })

  it('allows a payload at or under the cap', () => {
    expect(exceedsUploadLimit(10 * 1024 * 1024, 10 * 1024 * 1024)).toBe(false)
    expect(exceedsUploadLimit(1, 10 * 1024 * 1024)).toBe(false)
  })

  // An unconfigured client must not block legitimate uploads; the server still
  // enforces its own cap.
  it('treats a non-positive limit as no limit', () => {
    expect(exceedsUploadLimit(999 * 1024 * 1024, 0)).toBe(false)
    expect(exceedsUploadLimit(999 * 1024 * 1024, -1)).toBe(false)
  })

  // A bogus measurement is not evidence of a violation.
  it('does not refuse on an unusable size', () => {
    expect(exceedsUploadLimit(NaN, 10)).toBe(false)
    expect(exceedsUploadLimit(Infinity, 10)).toBe(false)
    expect(exceedsUploadLimit(-5, 10)).toBe(false)
  })
})

describe('approxDataUrlBytes', () => {
  // base64 is 4 characters per 3 bytes, so the decoded size is ~3/4 of the encoded
  // length. This is the estimate that decides whether an editor-held image is worth
  // sending at all.
  it('estimates the decoded size of a data URL', () => {
    // "AAAA" -> 3 bytes decoded.
    expect(approxDataUrlBytes('data:image/png;base64,AAAA')).toBe(3)
    // 4000 chars -> ~3000 bytes.
    const big = 'data:image/png;base64,' + 'A'.repeat(4000)
    expect(approxDataUrlBytes(big)).toBe(3000)
  })

  it('discounts base64 padding, which carries no data', () => {
    expect(approxDataUrlBytes('data:image/png;base64,AAAA==')).toBe(3)
    expect(approxDataUrlBytes('data:image/png;base64,AAAAA=')).toBe(3)
  })

  // A remote src must never be mistaken for an inline payload, or a normal
  // uploaded image would be refused for being "too large".
  it('returns zero for anything that is not a data URL', () => {
    expect(approxDataUrlBytes('https://cdn.example.com/a.png')).toBe(0)
    expect(approxDataUrlBytes('')).toBe(0)
    expect(approxDataUrlBytes('data:image/png;base64')).toBe(0) // no comma
    expect(approxDataUrlBytes('data:,')).toBe(0) // empty payload
    expect(approxDataUrlBytes(undefined as unknown as string)).toBe(0)
  })

  it('is large enough to catch a real photo', () => {
    // A ~4 MB photo becomes ~5.5 MB of base64.
    const encodedLen = Math.ceil((4 * 1024 * 1024 * 4) / 3)
    const dataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(encodedLen)
    const approx = approxDataUrlBytes(dataUrl)
    expect(approx).toBeGreaterThan(3.9 * 1024 * 1024)
    expect(approx).toBeLessThan(4.2 * 1024 * 1024)
  })
})

describe('formatUploadBytes', () => {
  it('renders readable sizes across units', () => {
    expect(formatUploadBytes(512)).toBe('512 B')
    expect(formatUploadBytes(2048)).toBe('2.0 KB')
    expect(formatUploadBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('degrades safely on unusable input', () => {
    expect(formatUploadBytes(0)).toBe('0 B')
    expect(formatUploadBytes(-1)).toBe('0 B')
    expect(formatUploadBytes(NaN)).toBe('0 B')
  })
})

describe('uploadLimitMessage', () => {
  // "File too large" without the size or the cap leaves the person guessing what
  // to change, so both must always appear.
  it('states both the actual size and the actual limit', () => {
    const msg = uploadLimitMessage(12.4 * 1024 * 1024, 10, 'holiday.png')
    expect(msg).toContain('holiday.png')
    expect(msg).toContain('12.4 MB')
    expect(msg).toContain('10 MB')
  })

  it('reads correctly without a label', () => {
    const msg = uploadLimitMessage(11 * 1024 * 1024, 10)
    expect(msg).toContain('That file is')
    expect(msg).toContain('10 MB')
    expect(msg).not.toContain('undefined')
  })

  it('ignores a blank label rather than rendering an empty subject', () => {
    expect(uploadLimitMessage(1024, 10, '   ')).toContain('That file is')
  })
})

// --- Embedded payload handling -------------------------------------------------

describe('isDataURL', () => {
  it('recognises inline payloads and nothing else', () => {
    expect(isDataURL('data:image/png;base64,AAAA')).toBe(true)
    expect(isDataURL('https://cdn.example.com/a.png')).toBe(false)
    expect(isDataURL('/relative/a.png')).toBe(false)
    expect(isDataURL('')).toBe(false)
    expect(isDataURL(undefined)).toBe(false)
    expect(isDataURL(null)).toBe(false)
    expect(isDataURL(42)).toBe(false)
  })
})

describe('parseDataURL', () => {
  // "SGVsbG8=" is base64 for "Hello".
  it('decodes mime type and bytes', () => {
    const parsed = parseDataURL('data:image/png;base64,SGVsbG8=')
    expect(parsed).not.toBeNull()
    expect(parsed!.mimeType).toBe('image/png')
    expect(Array.from(parsed!.bytes)).toEqual([72, 101, 108, 108, 111])
  })

  it('keeps only the mime type, dropping parameters', () => {
    const parsed = parseDataURL('data:image/jpeg;charset=utf-8;base64,SGVsbG8=')
    expect(parsed!.mimeType).toBe('image/jpeg')
  })

  // Callers run this over content they do not control, so one bad src must be
  // skippable rather than fatal.
  it('returns null instead of throwing on anything undecodable', () => {
    expect(parseDataURL('https://example.com/a.png')).toBeNull()
    expect(parseDataURL('data:image/png;base64')).toBeNull() // no comma
    expect(parseDataURL('data:image/png;base64,')).toBeNull() // empty payload
    expect(parseDataURL('data:image/png,notbase64')).toBeNull() // not base64
    expect(parseDataURL('data:image/png;base64,!!!not-valid-base64!!!')).toBeNull()
  })

  // A percent-encoded text data URL carries no bulk, so it is deliberately not
  // treated as a payload worth offloading.
  it('ignores non-base64 data URLs', () => {
    expect(parseDataURL('data:text/plain,hello%20world')).toBeNull()
  })
})

describe('extensionForMimeType', () => {
  it('maps the common image types', () => {
    expect(extensionForMimeType('image/png')).toBe('png')
    expect(extensionForMimeType('IMAGE/JPEG')).toBe('jpg')
    expect(extensionForMimeType('image/webp')).toBe('webp')
    expect(extensionForMimeType('image/svg+xml')).toBe('svg')
  })

  it('falls back rather than guessing', () => {
    expect(extensionForMimeType('application/x-thing')).toBe('bin')
    expect(extensionForMimeType('')).toBe('bin')
  })
})

describe('dataURLToFile', () => {
  it('produces an uploadable file with a sensible name and type', () => {
    const file = dataURLToFile('data:image/png;base64,SGVsbG8=', 'pasted-image')
    expect(file).not.toBeNull()
    expect(file!.name).toBe('pasted-image.png')
    expect(file!.type).toBe('image/png')
    expect(file!.size).toBe(5)
  })

  it('sanitises the name hint so it cannot carry path separators', () => {
    const file = dataURLToFile('data:image/png;base64,SGVsbG8=', '../../etc/passwd')
    expect(file!.name).not.toContain('/')
    expect(file!.name).toBe('....etcpasswd.png')
  })

  it('falls back to a default name when the hint is unusable', () => {
    const file = dataURLToFile('data:image/gif;base64,SGVsbG8=', '///')
    expect(file!.name).toBe('pasted-image.gif')
  })

  it('returns null for a payload it cannot decode, so the caller can skip it', () => {
    expect(dataURLToFile('https://example.com/a.png')).toBeNull()
    expect(dataURLToFile('data:image/png;base64,')).toBeNull()
  })

  // The round trip that matters: a real image pasted from another application must
  // come back out as a file the normal upload path accepts.
  it('round-trips a payload large enough to matter', () => {
    const bytes = 64 * 1024
    const base64 = btoa('x'.repeat(bytes))
    const file = dataURLToFile(`data:image/jpeg;base64,${base64}`)
    expect(file!.size).toBe(bytes)
    expect(file!.type).toBe('image/jpeg')
  })
})
