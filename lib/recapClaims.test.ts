import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { ASSISTANT_BIO } from "./assistantCopy"

/**
 * The meeting recap needs the call to have been recorded, and there is no way
 * for a user to find that out by using the product.
 *
 * The agent only posts transcript lines while an egress is running, the backend
 * rejects a transcript with no egress id, and the recap skips when there are no
 * lines. Every one of those is correct, and every one of them is silent: an
 * unrecorded call simply produces nothing, with no error to explain it.
 *
 * So the explanation has to live in the copy, and this is what keeps it there.
 * These assertions look pedantic until someone tightens the wording, drops the
 * condition as redundant, and quietly restores a feature that fails without
 * saying so. Failing here is the reminder to say it another way, not to delete
 * the check.
 */

const root = join(__dirname, "..")
const source = (p: string) => readFileSync(join(root, p), "utf8")

/** Pull one JSX/TS block out of a source file so a match elsewhere cannot pass for it. */
function block(file: string, startMarker: string, endMarker: string): string {
    const text = source(file)
    const start = text.indexOf(startMarker)
    expect(start, `${startMarker} no longer appears in ${file}`).toBeGreaterThan(-1)
    const end = text.indexOf(endMarker, start + startMarker.length)
    expect(end, `${endMarker} no longer follows ${startMarker} in ${file}`).toBeGreaterThan(-1)
    return text.slice(start, end)
}

describe("every surface that describes the recap says it needs a recording", () => {
    it("the assistant's own profile does", () => {
        expect(ASSISTANT_BIO).toMatch(/recorded/i)
    })

    it("the Meeting Recap setting does, and says what happens without one", () => {
        const description = block("components/admin/AIModelsCard.tsx", "Meeting Recap</h4>", "</p>")
        expect(description).toMatch(/recorded call/i)
        expect(description).toMatch(/no recap/i)
        // minRecapLines skips a recorded but near-empty call, just as silently.
        expect(description).toMatch(/short/i)
    })

    it("the meeting_ended trigger says it fires either way and carries no transcript", () => {
        const help = block("components/admin/WorkflowEditDialog.tsx", "meeting_ended:", "};")
        // The trigger is not the recap: it fires for unrecorded calls too, and a
        // workflow author who assumes otherwise builds one that posts nothing.
        expect(help).toMatch(/whether or not it was recorded/i)
        expect(help).toMatch(/not what was said/i)
    })

    it("the transcription setting still explains where transcripts come from", () => {
        const note = source("components/admin/TranscriptionSettingsCard.tsx")
        expect(note).toMatch(/Transcripts are captured for recorded calls/i)
    })
})
