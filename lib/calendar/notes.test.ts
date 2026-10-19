import { describe, expect, it } from "vitest"
import { isRichNotes, notesText, notesToSave, storedNotes } from "./notes"

// DESIGN-BUILD-2's review of FORM: a field showed "<p>Walk the checklist…</p>".
// Notes are kept as rich text (the old forms' editor, a seed, Google Calendar)
// or as plain text; a field shows them as text with their line breaks, and a
// change goes back in the form they were kept in.
describe("an event's notes", () => {
  it("tells rich text from plain, where an address in angle brackets is plain", () => {
    expect(isRichNotes("<p>Walk the checklist.</p>")).toBe(true)
    expect(isRichNotes("Line one<br>Line two")).toBe(true)
    expect(isRichNotes("Write to Sam <sam@example.com> if 3 < 4")).toBe(false)
    expect(isRichNotes("")).toBe(false)
    expect(isRichNotes(undefined)).toBe(false)
  })

  it("shows the old form's and a seed's paragraphs as lines, a blank one for an empty paragraph", () => {
    expect(notesText("<p>Walk the checklist, then decide go or no-go.</p>")).toBe("Walk the checklist, then decide go or no-go.")
    expect(notesText("<p>Agenda</p><p></p><p>1. Numbers</p><p><br></p><p>2. Copy</p>")).toBe("Agenda\n\n1. Numbers\n\n2. Copy")
    // Line ends in the markup are spaces, as a page draws them.
    expect(notesText("<p>Walk the\n  checklist</p>\n<p>then decide</p>")).toBe("Walk the checklist\nthen decide")
  })

  it("shows Google's breaks, lists, links and characters as text", () => {
    const google =
      'Join with Google Meet: <a href="https://meet.google.com/abc-defg-hij">https://meet.google.com/abc-defg-hij</a><br><br><b>Agenda</b><ul><li>Numbers &amp; targets</li><li>Hiring</li></ul>' +
      '<ol><li>First</li><li>Second</li></ol>See <a href="https://www.google.com/url?q=https://example.com/brief&amp;sa=D">the brief</a>&nbsp;&mdash; thanks'
    expect(notesText(google)).toBe(
      "Join with Google Meet: https://meet.google.com/abc-defg-hij\n\nAgenda\n- Numbers & targets\n- Hiring\n1. First\n2. Second\nSee the brief (https://example.com/brief) — thanks",
    )
  })

  it("names a link's address once, and drops a script outright", () => {
    expect(notesText('<a href="mailto:sam@example.com">sam@example.com</a>')).toBe("sam@example.com")
    expect(notesText('<a href="https://meet.example.com/abc">meet.example.com/abc</a>')).toBe("meet.example.com/abc")
    expect(notesText('<a href="javascript:alert(1)">Click</a>')).toBe("Click")
    expect(notesText("<p>Hi</p><script>alert(1)</script><style>p{}</style>")).toBe("Hi")
  })

  it("leaves plain notes as they were typed", () => {
    const plain = "Bring the numbers.\n\n  Indented, as typed. 3 < 4 & 5 > 2"
    expect(notesText(plain)).toBe(plain)
    expect(storedNotes(plain, false)).toBe(plain)
  })

  it("keeps rich text rich: a paragraph a line, characters escaped, web addresses as links", () => {
    expect(storedNotes("Walk the checklist.\n\nThen: 3 < 4 & go", true)).toBe("<p>Walk the checklist.</p><p></p><p>Then: 3 &lt; 4 &amp; go</p>")
    expect(storedNotes("Call: https://meet.example.com/abc?x=1&y=2.\n", true)).toBe(
      '<p>Call: <a href="https://meet.example.com/abc?x=1&amp;y=2">https://meet.example.com/abc?x=1&amp;y=2</a>.</p>',
    )
    expect(storedNotes("(see https://example.com/a)", true)).toBe('<p>(see <a href="https://example.com/a">https://example.com/a</a>)</p>')
    expect(storedNotes("  \n", true)).toBe("")
  })

  it("sends notes as kept when the text wasn't changed, so rich text keeps every mark", () => {
    const kept = '<p>Walk the <strong>checklist</strong>.</p><p><a href="https://example.com/brief">The brief</a></p>'
    expect(notesToSave(notesText(kept), kept)).toBe(kept)
    expect(notesToSave("Walk the checklist.\nThe brief (https://example.com/brief)\nAnd decide.", kept)).toBe(
      '<p>Walk the checklist.</p><p>The brief (<a href="https://example.com/brief">https://example.com/brief</a>)</p><p>And decide.</p>',
    )
    expect(notesToSave("Typed\nhere", "")).toBe("Typed\nhere")
    expect(notesToSave("Changed", "Plain before")).toBe("Changed")
  })
})
