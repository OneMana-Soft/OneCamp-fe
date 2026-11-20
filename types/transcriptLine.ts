import type { TranscriptInfoInterface } from "@/types/recording"

/**
 * A transcript's line as the player's panel reads it (zoom-05): its own id,
 * which a correction names, and a corrected line's facts (transcript_text is
 * its words now; these, what was said, and when and by whom it changed). Kept
 * beside TranscriptInfoInterface rather than in it: the routes that read that
 * type on their first load carry none of this.
 */
export interface TranscriptLine extends TranscriptInfoInterface {
  uid?: string
  transcript_original_text?: string
  transcript_corrected_at?: string
  transcript_corrected_by?: { user_uuid: string; user_full_name?: string }
}
