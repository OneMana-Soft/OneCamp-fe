"use client";

import { useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { LocalParticipant, RoomEvent, Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";

interface FrontendTranscriberProps {
  onTranscript: (data: any) => void;
}

export function FrontendTranscriber({ onTranscript }: FrontendTranscriberProps) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [isListening, setIsListening] = useState(false);
  const mode = process.env.NEXT_PUBLIC_TRANSCRIPTION_MODE === 'backend' ? 'backend' : 'frontend';
  const enabled = mode === 'frontend';
  
  // Use refs to keep track of latest values without triggering re-renders/effect cleanup
  const recognitionRef = useRef<any>(null);
  const localParticipantRef = useRef(localParticipant);
  const enabledRef = useRef(enabled);
  const roomRef = useRef(room);
  // Store recent remote transcripts to detect echo
  const remoteTranscriptsBuffer = useRef<{text: string, timestamp: number}[]>([]);

  // Retry logic state
  const retryCountRef = useRef(0);
  const lastErrorRef = useRef<string | null>(null);

  // Map to store the start time of each utterance (keyed by resultIndex)
  const startTimesRef = useRef<Map<number, number>>(new Map());

  // Update refs
  useEffect(() => {
      localParticipantRef.current = localParticipant;
      enabledRef.current = enabled;
      roomRef.current = room;
  }, [localParticipant, enabled, room]);

  // Listen for remote transcripts to populate buffer
  useEffect(() => {
    if (!room) return;

    const onDataReceived = (payload: Uint8Array, participant?: any, kind?: any, topic?: string) => {
        if (topic === "lk.transcription" && participant?.identity !== localParticipant.identity) {
            try {
                const decoder = new TextDecoder();
                const jsonString = decoder.decode(payload);
                const data = JSON.parse(jsonString);
                
                if (data.text) {
                    // Backend Mode: valid transcript from agent checking
                    if (mode === 'backend') {
                         const payloadIdentity = data.participantIdentity;
                         const myIdentity = localParticipant.identity;
                         
                         // If the transcript is FOR ME (from backend), update local UI
                         if (payloadIdentity === myIdentity) {
                             onTranscript(data);
                             return; // Don't treat my own speech as echo
                         }
                    }

                    // Add to buffer
                    remoteTranscriptsBuffer.current.push({
                        text: data.text,
                        timestamp: Date.now()
                    });
                    
                    // Keep buffer small (last 3 seconds?)
                    // Actually clean it up lazy or periodically? Lazy on usage is fine.
                }
            } catch (e) {
                // ignore
            }
        }
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
    if (typeof window === 'undefined' || mode === 'backend') return;

    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Browser does not support SpeechRecognition");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // Retry logic state - moved to top level

    recognition.onstart = () => {
      setIsListening(true);
      lastErrorRef.current = null;
      startTimesRef.current.clear();
    };

    recognition.onend = () => {
      setIsListening(false);
      
      // Auto-restart logic
      if (localParticipantRef.current?.isMicrophoneEnabled && enabledRef.current && recognitionRef.current) {
          let delay = 100;
          
          if (lastErrorRef.current === 'network') {
               // Exponential backoff: 1s, 2s, 4s... max 30s
               delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
               console.warn(`Transcription network error. Retrying in ${delay}ms...`);
               retryCountRef.current++;
          } else {
               // If it stopped cleanly or other non-fatal error, reset retry if we had a successful run?
               // Actually, if we just ran successfully for a while, we should reset.
               // But 'onresult' resets it. If we start and immediately stop without result, maybe we shouldn't reset?
               // For now, let's rely on onresult to reset.
          }

          setTimeout(() => {
              if (localParticipantRef.current?.isMicrophoneEnabled && enabledRef.current && recognitionRef.current) {
                  try {
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
      }
    };

    recognition.onresult = (event: any) => {
      // Reset retry count on successful result
      retryCountRef.current = 0;
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
        const stableId = `local-${lp.identity}-${i}`;
        
        // Accurate Start Time Logic:
        // Capture the timestamp of the FIRST time we see this result index (First Interim Result).
        if (!startTimesRef.current.has(i)) {
            startTimesRef.current.set(i, Date.now());
        }
        let rawStartTime = startTimesRef.current.get(i) || Date.now();
        
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
            isFinal: isFinal,
            id: stableId,
            source: 'frontend'
        };
        
        // 1. Update Local UI immediately
        onTranscript(payload);
        
        // 2. Publish to Room (so others see it)
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

  // Toggle Start/Stop based on Mic state
  useEffect(() => {
     if (isMicOn && enabled && recognitionRef.current && !isListening) {
         try {
            recognitionRef.current.start();
         } catch(e) { 
             // often throws if already started
         }
     } else if ((!isMicOn || !enabled) && isListening && recognitionRef.current) {
         recognitionRef.current.stop();
     }
  }, [isMicOn, enabled]);

  return null;
}
