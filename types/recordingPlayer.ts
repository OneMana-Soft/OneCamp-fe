/**
 * What the one recording player opens with (store/slice/uiSlice.ts recordingPlayer).
 * Types only: everything names it with `import type`, so no route's first load counts it.
 */
export interface RecordingPlayerInterface {
  egressId: string;
  // None for a call nobody recorded (zoom-13): the player reads its words and asks for no picture.
  mediaGetUrl?: string;
  transcriptGetUrl: string;
  fileSize: number;
  fileName: string;
  recordedAt: string;
  mediaPath?: string;
  // Where an event's call's words are read, a page at a time (its own transcript route, head C2).
  transcriptPath?: string;
  home?: "event";
  // The place's Delete of the recording, as its host already gives it (a channel's admins; anyone in a chat):
  // with it, every line of the transcript offers its correction (zoom-05, lib/calls/transcriptCorrect).
  mayDelete?: boolean;
  // The recording's state as its list knows it; "transcript_only" for a call with no picture.
  status?: string;
  // Where to start, in ms from the recording's start (a search hit's moment, zoom-13).
  startAtMs?: number;
}
