"use client";

import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { FEATURE_CALLS, useClientConfig, useFeatureState } from "@/hooks/useClientConfig";
import { persistTranscriptLine, reportTranscriptionCapability } from "@/services/transcriptService";
import { readCaption } from "@/lib/calls/signals";

// Why the caption overlay may be showing nothing. Reported upward because an
// empty overlay looks identical whether the recognizer is muted, unsupported by
// this browser, or simply waiting for someone to speak — and the user can only
// act on the first two if we say which it is.
export interface TranscriberState {
  status: "listening" | "starting" | "mic-off" | "unsupported" | "disabled" | "off" | "error";
  // The SpeechRecognition error code when status is "error" (not-allowed,
  // audio-capture, network, ...). Carried up so the UI can name the actual
  // problem rather than leaving the user to open devtools.
  error?: string;
}

interface FrontendTranscriberProps {
  onTranscript: (data: any) => void;
  onStatus?: (state: TranscriberState) => void;
  /**
   * Captions are on for the call, this person has been shown where their
   * speech goes, and hasn't asked to be left out (CALL-BUG-2). Nothing is
   * recognised, and no audio leaves the browser, unless this is true. It used
   * to run for every member whenever their microphone was on, captions or
   * not, and nobody in the call was told.
   */
  active: boolean;
  /** The call keeps a transcript (any call but an instant meeting): final lines are stored. */
  persist: boolean;
  /** The language to recognise, BCP-47. Left to the browser when absent; never a fixed en-US. */
  language?: string;
}

/**
 * Whether Chrome can recognise this language on the device itself, so the
 * audio never leaves it (Chrome 139's on-device Web Speech). Anything else,
 * an older Chrome, Edge, an error, is "no", and the browser's own service is
 * used, which the call's notice names.
 */
export async function canRecogniseOnDevice(SpeechRecognition: unknown, language: string | undefined): Promise<boolean> {
  const available = (SpeechRecognition as { available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string> } | undefined)?.available;
  if (typeof available !== "function" || !language) return false;
  try {
    return (await available.call(SpeechRecognition, { langs: [language], processLocally: true })) === "available";
  } catch {
    return false;
  }
}

/**
 * Errors that trying again won't fix: the browser, the person or the speech
 * service said no, or there is no microphone or no such language.
 */
export const RECOGNISER_REFUSALS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported", "bad-grammar"]);

/**
 * When to start the recogniser again after it ended, in ms, or null for
 * never (CALL-BUG-24). A refused recogniser was restarted every 100 ms for
 * the whole call, about 500 times a minute, a quarter of the main thread. A
 * refusal is final now: captions say why instead. A network error backs off
 * 1 s, 2 s, 4 s, up to 30 s. Chrome ends a healthy session after a pause, and
 * that restarts at once, unless sessions keep ending as soon as they start,
 * which backs off the same way. Pure.
 */
export function nextRecogniserStart(lastError: string | null, quickFailures: number): number | null {
  if (lastError && RECOGNISER_REFUSALS.has(lastError)) return null;
  if (lastError === "network") return Math.min(1000 * 2 ** Math.max(0, quickFailures - 1), 30_000);
  if (quickFailures >= 3) return Math.min(100 * 2 ** quickFailures, 30_000);
  return 100;
}

/** A session shorter than this, with nothing heard, counts as a failure to start. */
const QUICK_END_MS = 2000;

export function FrontendTranscriber({ onTranscript, onStatus, active, persist, language }: FrontendTranscriberProps) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [isListening, setIsListening] = useState(false);
  // Web Speech is a Chrome/Edge API. Firefox and Safari have no recognizer at
  // all, so frontend transcription cannot run there whatever the admin sets.
  const [supported, setSupported] = useState(true);
  // Last fatal recognizer error, so the caption overlay can say what went wrong.
  const [fatalError, setFatalError] = useState<string | null>(null);
  // Chrome restarts the recognizer often, and event.results (and so the result
  // index) resets to 0 each time. Utterance ids must include the session or the
  // first utterance after every restart reuses an id the UI has already seen and
  // is discarded as a duplicate.
  const sessionRef = useRef(0);
  // Runtime transcription mode, admin-controlled via /config/client (no longer
  // a build-time env var). "frontend" → run the browser Web-Speech recognizer
  // here; "backend" → the server-side agent transcribes, we only relay/render
  // remote transcripts; "off" → no transcription at all.
  //
  // Fail closed until the server has answered: the config's stand-in says
  // "frontend", and guessing wrong here sends someone's speech to a speech
  // service the workspace turned off.
  const { transcription_mode: mode } = useClientConfig();
  const configKnown = useFeatureState(FEATURE_CALLS) !== "unknown";
  const enabled = active && configKnown && mode === 'frontend';
  // On-device recognition where Chrome offers it for this language; null
  // while that is being asked, and nothing starts until it is answered.
  const [onDevice, setOnDevice] = useState<boolean | null>(null);
  const languageRef = useRef(language);
  const persistRef = useRef(persist);
  
  // Use refs to keep track of latest values without triggering re-renders/effect cleanup
  // Reported once per call. A browser with no recognizer contributes nothing to
  // the transcript, and nothing errors, so without telling the server the
  // record silently loses this person's turns.
  const reportedRoomRef = useRef<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const localParticipantRef = useRef(localParticipant);
  const enabledRef = useRef(enabled);
  const roomRef = useRef(room);
  // Store recent remote transcripts to detect echo
  const remoteTranscriptsBuffer = useRef<{text: string, timestamp: number}[]>([]);

  // Restart policy state (nextRecogniserStart): the last error, how many
  // sessions in a row ended quickly with nothing heard, and when this one began.
  const quickFailuresRef = useRef(0);
  const lastErrorRef = useRef<string | null>(null);
  const sessionStartRef = useRef(0);
  const heardRef = useRef(false);

  // Map to store the start time of each utterance (keyed by resultIndex)
  const startTimesRef = useRef<Map<number, number>>(new Map());

  // Browser-clock wall time (ms) at which THIS client first observed the
  // active recording (egress) in room metadata. Utterance offsets are measured
  // relative to this anchor, in the SAME browser clock as the utterance
  // timestamp — so the seek position in the recorded video is free of the
  // browser-vs-egress-server clock skew that plagues absolute-timestamp math.
  const recordingStartMsRef = useRef<number | null>(null);
  const recordingEgressRef = useRef<string>("");

  // Watch room metadata for the active recording. When a NEW egress appears,
  // stamp the browser clock; when recording stops, clear the anchor so the
  // next recording re-anchors cleanly.
  useEffect(() => {
    if (!room) return;
    const syncRecordingAnchor = () => {
      let egressID = "";
      let isRecording = false;
      try {
        if (room.metadata) {
          const meta = JSON.parse(room.metadata);
          isRecording = !!meta.isRecording;
          egressID = meta.egressID || "";
        }
      } catch {
        /* malformed metadata — treat as no recording */
      }
      if (isRecording && egressID) {
        if (recordingEgressRef.current !== egressID) {
          recordingEgressRef.current = egressID;
          recordingStartMsRef.current = Date.now();
        }
      } else {
        recordingEgressRef.current = "";
        recordingStartMsRef.current = null;
      }
    };
    syncRecordingAnchor(); // capture initial state (recording may already be live on join)
    room.on(RoomEvent.RoomMetadataChanged, syncRecordingAnchor);
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, syncRecordingAnchor);
    };
  }, [room]);

  // Update refs
  useEffect(() => {
      localParticipantRef.current = localParticipant;
      enabledRef.current = enabled;
      roomRef.current = room;
      languageRef.current = language;
      persistRef.current = persist;
  }, [localParticipant, enabled, room, language, persist]);

  // Ask once per language whether it can be recognised on this device, and
  // only while captions are on here: a call touches the speech service only
  // when someone turns captions on. Asking on every join lost the whole tab
  // in a Chromium that exposes the API without its on-device service: the
  // browser ends the page for a "bad Mojo message" (QA F-21).
  useEffect(() => {
    if (typeof window === 'undefined' || !enabled) return;
    let cancelled = false;
    setOnDevice(null);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    void canRecogniseOnDevice(SpeechRecognition, language).then((ok) => {
      if (!cancelled) setOnDevice(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [language, enabled]);

  // Listen for remote transcripts to populate buffer
  useEffect(() => {
    if (!room) return;

    const onDataReceived = (payload: Uint8Array, participant?: any, _kind?: any, topic?: string) => {
        if (!participant || participant.identity === localParticipant.identity) return;
        // The speaker is the sender; only the agent names someone else (lib/calls/signals).
        const data = readCaption(payload, participant, topic);
        if (!data?.text) return;
        // Server mode: the agent's line about this person is theirs to show.
        if (mode === 'backend' && data.participantIdentity === localParticipant.identity) {
            onTranscript(data);
            return; // Don't treat my own speech as echo
        }
        // Remembered briefly, to tell this person's echo of it from their own words.
        remoteTranscriptsBuffer.current.push({ text: String(data.text), timestamp: Date.now() });
    };

    room.on(RoomEvent.DataReceived, onDataReceived);
    return () => {
        room.off(RoomEvent.DataReceived, onDataReceived);
    };
  }, [room, localParticipant]);

  // Clean up buffer periodically to avoid memory leaks if inactive
  useEffect(() => {
    const interval = setInterval(() => {
        const now = Date.now();
        remoteTranscriptsBuffer.current = remoteTranscriptsBuffer.current.filter(t => now - t.timestamp < 3000);
    }, 2000); // Check every 2s
    return () => clearInterval(interval);
  }, []);

  const isMicOn = localParticipant.isMicrophoneEnabled;
  useEffect(() => {
    // Made whatever the mode: making one starts nothing and sends nothing.
    if (typeof window === 'undefined') return;

    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Browser does not support SpeechRecognition");
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    // The person's language, set again before every start (applyLanguage).
    if (languageRef.current) recognition.lang = languageRef.current;

    // Retry logic state - moved to top level

    recognition.onstart = () => {
      sessionRef.current++;
      sessionStartRef.current = Date.now();
      heardRef.current = false;
      setIsListening(true);
      setFatalError(null);
      lastErrorRef.current = null;
      startTimesRef.current.clear();
    };

    recognition.onend = () => {
      setIsListening(false);
      // A session that ended at once with nothing heard counts towards backing off.
      const quick = !heardRef.current && Date.now() - sessionStartRef.current < QUICK_END_MS;
      quickFailuresRef.current = quick ? quickFailuresRef.current + 1 : 0;

      if (localParticipantRef.current?.isMicrophoneEnabled && enabledRef.current && recognitionRef.current) {
          const delay = nextRecogniserStart(lastErrorRef.current, quickFailuresRef.current);
          // Refused: stay stopped. Captions say why (the error status), and
          // turning the microphone or captions off and on tries again.
          if (delay === null) return;

          setTimeout(() => {
              if (localParticipantRef.current?.isMicrophoneEnabled && enabledRef.current && recognitionRef.current) {
                  try {
                     applyLanguage(recognitionRef.current, languageRef.current);
                     recognitionRef.current.start();
                  } catch(e: any) { 
                      // Ignore 'already started' errors which can happen due to race conditions
                      if (e.name !== 'InvalidStateError' && e.message?.indexOf('already started') === -1) {
                          console.error("Failed to restart transcription:", e);
                      }
                  }
              }
          }, delay);
      }
    };

    recognition.onerror = (event: any) => {
      // ignore 'no-speech' errors which happen often
      if (event.error !== 'no-speech') {
          console.error("Frontend Transcription Error:", event.error);
          lastErrorRef.current = event.error;
          // 'aborted' is what a normal stop() looks like, so it is not a fault.
          if (event.error !== 'aborted') setFatalError(event.error);
      }
    };

    recognition.onresult = (event: any) => {
      // Heard something: this session is healthy.
      heardRef.current = true;
      quickFailuresRef.current = 0;
      lastErrorRef.current = null;

      const lp = localParticipantRef.current;
      if (!lp) return;

      // Clean up old remote transcripts (older than 2 seconds) on trigger
      const now = Date.now();
      remoteTranscriptsBuffer.current = remoteTranscriptsBuffer.current.filter(t => now - t.timestamp < 2000);
      const recentRemoteTexts = remoteTranscriptsBuffer.current.map(t => t.text.toLowerCase().trim());
      
      // Process results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        const isFinal = result.isFinal;
        
        // Semantic Echo Cancellation (Improved)
        const normalizedLocal = text.toLowerCase().trim();
        const localTokens = normalizedLocal.split(/\s+/).filter((t: string) => t.length > 0);
        
        // Skip echo check for very short utterances unless exact match (to prevent "No" matching "No problem")
        if (localTokens.length < 2) {
             if (recentRemoteTexts.some(remote => remote === normalizedLocal)) {
                 // Exact match on short word -> Echo
                 continue;
             }
             // Otherwise, let short words pass (likely user response)
        } else {
             // Heuristic: Token Set Overlap
             // If a significant portion of local tokens appear in a recent remote sentence, it's likely echo.
             // We check against EACH recent remote sentence.
             const isEcho = recentRemoteTexts.some(remote => {
                const remoteTokens = new Set(remote.split(/\s+/));
                const overlapCount = localTokens.reduce((count: number, token: string) => remoteTokens.has(token) ? count + 1 : count, 0);
                const overlapRatio = overlapCount / localTokens.length;
                
                // If >75% of local words are in the remote sentence, it's echo.
                // e.g. Speaker: "Hello world how are you"
                // Local (Echo): "Hello world" -> 2/2 -> 1.0 -> Echo
                return overlapRatio > 0.75; 
             });

             if (isEcho) {
                 continue;
             }
        }
        
        // Generate a stable ID for this sentence index.
        const stableId = `local-${lp.identity}-${sessionRef.current}-${i}`;
        
        // Accurate Start Time Logic:
        // Capture the timestamp of the FIRST time we see this result index (First Interim Result).
        if (!startTimesRef.current.has(i)) {
            startTimesRef.current.set(i, Date.now());
        }
        const rawStartTime = startTimesRef.current.get(i) || Date.now();
        
        // VAD Latency Compensation (Pre-roll)
        // WebSpeech often detects speech 200-500ms AFTER it actually started.
        // We shift the timestamp BACK by 500ms to ensure the first syllable isn't clipped when seeking.
        const VAD_OFFSET_MS = 500;
        const adjustedStartTime = rawStartTime - VAD_OFFSET_MS;
        
        // Duration must cover from Adjusted Start to Now
        const durationMs = Date.now() - adjustedStartTime;

        // Cleanup: If final, we can eventually remove it, but keeping it ensures stability if event re-fires?
        // Actually, speechRecognition results are cumulative. Once final, index moves on.
        // We can clear old indexes to prevent memory leak.
        if (isFinal) {
             // Keep it for this render, delete later? Or just let Map grow?
             // Since resultIndex resets on restart, Map should be cleared on start/end.
             // We'll leave it for now or clear very old ones.
             // Actually, simplest is to just use it.
        }

        const payload = {
            participantIdentity: lp.identity,
            participantName: lp.name || lp.identity,
            text: text,
            timestamp: adjustedStartTime, // Client Clock (Shifted back)
            duration: durationMs, // Duration (Includes pre-roll)
            // Skew-free seek anchor: utterance start measured from when THIS
            // browser saw recording start, in the same browser clock. Only set
            // while a recording is active (offsets are meaningless otherwise).
            offsetMs: recordingStartMsRef.current != null
                ? Math.max(0, adjustedStartTime - recordingStartMsRef.current)
                : undefined,
            isFinal: isFinal,
            id: stableId,
            source: 'frontend'
        };
        
        // 1. Update Local UI immediately
        onTranscript(payload);
        
        // 2. Persist FINAL utterances, so the words outlive the call.
        //
        // Browser mode is the default and it used to keep nothing: the text was
        // drawn as a caption and thrown away, so a workspace on default
        // settings had no transcript, no meeting recap and no notes document.
        //
        // Finals only. Interim results are revised on nearly every word, and
        // storing them would file half-sentences that the speaker never
        // finished saying.
        //
        // Best-effort and deliberately silent: a caption that appeared is worth
        // more than an error about a transcript nobody asked for. A refusal is
        // the normal answer for the moment after everyone hangs up.
        // Never in a call that keeps no transcript (an instant meeting).
        if (isFinal && persistRef.current) {
            void persistTranscriptLine({
                room_name: roomRef.current?.name ?? "",
                text,
                offset_ms: payload.offsetMs,
            })
        }

        // 3. Publish to Room (so others see it)
        const currentRoom = roomRef.current;
        if (currentRoom && currentRoom.state === "connected") {
            const data = JSON.stringify(payload);
            const encoder = new TextEncoder();
            lp.publishData(encoder.encode(data), {
                topic: "lk.transcription",
            }).catch(err => console.error("Failed to publish transcript", err));
        }
      }
    };

    recognitionRef.current = recognition;

    // Only Start if mic is presumably on? No, let the toggle effect handle it.
    // Actually, creating it doesn't start it.

    return () => {
       if (recognitionRef.current) {
           recognitionRef.current.onend = null; // prevent restart on unmount
           recognitionRef.current.stop();
       }
    };
  }, []); // Run ONCE on mount

  // Start and stop with the microphone, and only while enabled. On-device
  // where it can be: the answer to that is waited for, so the first words
  // never go to the cloud while the question is still open.
  useEffect(() => {
     const recognition = recognitionRef.current;
     if (isMicOn && enabled && onDevice !== null && recognition && !isListening) {
         applyLanguage(recognition, languageRef.current);
         if ("processLocally" in recognition) recognition.processLocally = onDevice;
         try {
            recognition.start();
         } catch(e) { 
             // often throws if already started
         }
     } else if ((!isMicOn || !enabled) && recognition) {
         // Stopped even before onstart has said it is listening: a start
         // that is still opening is stopped too.
         try {
             recognition.stop();
         } catch {
             /* not started */
         }
     }
  }, [isMicOn, enabled, onDevice]);

  // Report why captions are, or are not, being produced.
  useEffect(() => {
    const roomName = roomRef.current?.name ?? "";
    // Only for a call that is making a transcript: this browser can't add to it.
    if (enabled && persist && !supported && roomName && reportedRoomRef.current !== roomName) {
        reportedRoomRef.current = roomName;
        void reportTranscriptionCapability(roomName, false);
    }

    if (!onStatus) return;
    // Called, never returned: an effect's return value is its cleanup.
    const state: TranscriberState =
      mode === 'off' ? { status: "disabled" }
      : !enabled ? { status: "off" }
      : !supported ? { status: "unsupported" }
      : fatalError ? { status: "error", error: fatalError }
      : !isMicOn ? { status: "mic-off" }
      : { status: isListening ? "listening" : "starting" };
    onStatus(state);
  }, [onStatus, enabled, persist, mode, supported, isMicOn, isListening, fatalError]);

  return null;
}

/** The language to recognise, set before a start; the browser's own when there is none. */
function applyLanguage(recognition: { lang?: string }, language: string | undefined) {
  if (language) recognition.lang = language;
}
