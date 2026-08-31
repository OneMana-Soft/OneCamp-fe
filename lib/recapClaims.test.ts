import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { BOT_PROFILE_COPY } from "./botCopy"

/**
 * The meeting recap skips silently, and the copy has to say when.
 *
 * It USED to need a recording, and these assertions used to enforce exactly
 * that. The requirement is gone: transcripts are now filed under a call session
 * key when nothing is recording, so an unrecorded call gets a recap. The copy
 * that named the old condition would now be a lie, so it changed, and so did
 * this.
 *
 * What has not changed is why the file exists. A recap can still produce
 * nothing (too short, or transcription switched off) and it still says nothing
 * when it does, so the conditions have to live in the copy. Failing here is the
 * reminder to say it another way, not to delete the check.
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
    // Collapsed to single spaces because this is JSX: a sentence is wrapped
    // across source lines, so a phrase that reads as one thing on screen is
    // split by a newline and indentation here. Matching the raw source makes
    // reflowing a paragraph break the guard, which teaches people to delete it.
    return text.slice(start, end).replace(/\s+/g, " ")
}

describe("every surface that describes the recap says when it stays silent", () => {
    it("the assistant's profile no longer promises only recorded calls", () => {
        expect(BOT_PROFILE_COPY.assistant.bio).toMatch(/recaps calls/i)
        expect(BOT_PROFILE_COPY.assistant.bio).not.toMatch(/recorded/i)
    })

    it("and no other kind of bot claims to recap anything", () => {
        // An agent's principal is not the assistant. Describing it as one is
        // how "posts meeting recaps" reached bots that never touch a call.
        for (const kind of ["agent", "automation", "bot"] as const) {
            expect(BOT_PROFILE_COPY[kind].bio).not.toMatch(/recap/i)
        }
    })

    it("the Meeting Recap setting names the conditions that still skip it", () => {
        const description = block("components/admin/AIModelsCard.tsx", "Meeting Recap</h4>", "</p>")
        // The reversal is worth asserting, not just the new wording: the old copy
        // told people to record, and leaving that behind would send them on doing
        // something the product stopped needing.
        expect(description).toMatch(/not required/i)
        expect(description).not.toMatch(/no transcript, so it gets no recap/i)
        // Both remaining silent skips.
        expect(description).toMatch(/short/i)
        expect(description).toMatch(/transcription was off/i)
    })

    it("the meeting_ended trigger says it fires either way and carries no transcript", () => {
        const help = block("components/admin/WorkflowEditDialog.tsx", "meeting_ended:", "};")
        // The trigger is not the recap: it fires for unrecorded calls too, and a
        // workflow author who assumes otherwise builds one that posts nothing.
        expect(help).toMatch(/whether or not it was recorded/i)
        expect(help).toMatch(/not what was said/i)
    })

    it("the transcription setting explains which mode actually keeps the words", () => {
        const note = source("components/admin/TranscriptionSettingsCard.tsx").replace(/\s+/g, " ")
        // No longer "for recorded calls": that requirement is gone.
        expect(note).toMatch(/for every call, recorded or not/i)
        // Browser mode is now the only one with no transcript, which is the
        // surprise left in this feature and so has to be said out loud.
        expect(note).toMatch(/Captions only: nothing is kept afterwards/i)
    })
})
