"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { RoomEvent, RemoteParticipant, DataPacket_Kind } from "livekit-client";
import { CallsPost } from "@/services/endpoints/calls";
import { authedStreamFetch } from "@/lib/utils/streamFetch";
import { readSignal, senderOf } from "@/lib/calls/signals";

/**
 * useInCallAgent — the brain of the multiplayer in-call AI assistant.
 *
 * Owns the shared Q&A conversation for a call and keeps it alive independent of
 * whether the side panel is open. When any participant asks a question:
 *   1. it's added locally and BROADCAST to everyone over the LiveKit data
 *      channel (topic "oc.ai") so the whole room sees "Alice asked: …" instantly;
 *   2. the asker's client streams the answer from the AI over SSE (only the
 *      asker pays the round-trip — answers aren't computed N times);
 *   3. when the answer completes, the SERVER broadcasts the final text (topic
 *      "oc.ai", no sender participant) with the asker's identity, so every
 *      other participant's panel fills in the same answer (CALL-BUG-14). The
 *      asker used to broadcast it, and any participant could send an answer
 *      for any question id: anyone could put words in OneCamp AI's mouth.
 *
 * This makes the assistant a genuinely collaborative, shareable surface rather
 * than a private side-chat, while keeping bandwidth low (we broadcast the
 * question + the final answer, not every token).
 */

export interface InCallQAItem {
    id: string;
    question: string;
    askedByName: string;
    /** True when the local user is the one who asked (drives alignment + who streams). */
    mine: boolean;
    answer: string;
    error?: string;
    /** Asker: streaming the answer. Others: waiting for the broadcast answer. */
    streaming: boolean;
    /** Who asked, by identity: the sender of the question, never a name in it. */
    askerId?: string;
}

const AI_TOPIC = "oc.ai";

// Wire format for the data channel. Kept tiny + versioned for forward-compat.
interface AIWireQuestion {
    v: 1;
    t: "q";
    id: string;
    question: string;
    askedByName: string;
}
interface AIWireAnswer {
    v: 1;
    t: "a";
    id: string;
    answer: string;
    error?: string;
    /** The asker's identity; the server says it, and it must match the question's sender. */
    askedById?: string;
}
type AIWire = AIWireQuestion | AIWireAnswer;

export function useInCallAgent(roomId: string, getTranscript: () => string) {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();

    const [items, setItems] = useState<InCallQAItem[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    const encoder = useRef(new TextEncoder());
    const decoder = useRef(new TextDecoder());
    // Watchdogs for remote questions: if the asker disconnects mid-answer, the
    // answer broadcast never arrives and the item would hang on "Thinking…".
    // We arm a timer per remote question and resolve it to a soft fallback.
    const remoteWatchdogs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    // ── Broadcast helper ────────────────────────────────────────────────
    const broadcast = useCallback(
        (msg: AIWire) => {
            if (!room || room.state !== "connected") return;
            try {
                room.localParticipant.publishData(
                    encoder.current.encode(JSON.stringify(msg)),
                    { reliable: true, topic: AI_TOPIC },
                );
            } catch {
                // Best-effort; a failed broadcast only means others won't see
                // this exchange — the local view is unaffected.
            }
        },
        [room],
    );

    // ── Receive remote Q&A ──────────────────────────────────────────────
    useEffect(() => {
        if (!room) return;

        const onData = (
            payload: Uint8Array,
            participant?: RemoteParticipant,
            _kind?: DataPacket_Kind,
            topic?: string,
        ) => {
            // Questions come from people, answers from the server alone
            // (lib/calls/signals): who sent it is LiveKit's word, not the packet's.
            const msg = readSignal<AIWire>(payload, participant, { topic: AI_TOPIC, from: ["participant", "server"], received: topic });
            if (!msg || msg.v !== 1) return;
            if ((msg.t === "q") !== (senderOf(participant) === "participant")) return;

            // Defensive bounds — a peer could broadcast arbitrarily large data.
            if (msg.t === "q" && typeof msg.question === "string") {
                msg.question = msg.question.slice(0, 2000);
            }
            if (msg.t === "a" && typeof msg.answer === "string") {
                msg.answer = msg.answer.slice(0, 8000);
            }

            if (msg.t === "q") {
                // A question comes from a participant, never from nowhere.
                if (!participant) return;
                // Trust the SENDER's participant identity for attribution rather
                // than the wire-provided name (which a peer could spoof).
                const askedByName =
                    participant.name || participant.identity || msg.askedByName || "Someone";
                setItems((prev) => {
                    if (prev.some((it) => it.id === msg.id)) return prev;
                    return [
                        ...prev,
                        {
                            id: msg.id,
                            question: msg.question,
                            askedByName,
                            mine: false,
                            answer: "",
                            streaming: true,
                            askerId: participant.identity,
                        },
                    ];
                });
                // Arm a watchdog so a dropped asker doesn't leave this hanging.
                if (remoteWatchdogs.current[msg.id]) {
                    clearTimeout(remoteWatchdogs.current[msg.id]);
                }
                remoteWatchdogs.current[msg.id] = setTimeout(() => {
                    setItems((prev) =>
                        prev.map((it) =>
                            it.id === msg.id && it.streaming && !it.answer
                                ? { ...it, streaming: false, error: "The answer didn't arrive (the asker may have left)." }
                                : it,
                        ),
                    );
                    delete remoteWatchdogs.current[msg.id];
                }, 60000);
            } else if (msg.t === "a") {
                // Only the server answers (no sender participant), and only for
                // the person who asked: a participant can't replace an answer.
                if (participant || !msg.askedById) return;
                let accepted = false;
                setItems((prev) =>
                    prev.map((it) => {
                        if (!acceptsAnswer(it, msg.id, msg.askedById)) return it;
                        accepted = true;
                        return { ...it, answer: msg.answer, error: msg.error, streaming: false };
                    }),
                );
                if (accepted && remoteWatchdogs.current[msg.id]) {
                    clearTimeout(remoteWatchdogs.current[msg.id]);
                    delete remoteWatchdogs.current[msg.id];
                }
            }
        };

        room.on(RoomEvent.DataReceived, onData);
        return () => {
            room.off(RoomEvent.DataReceived, onData);
        };
    }, [room]);

    // ── Ask (local) ─────────────────────────────────────────────────────
    const ask = useCallback(
        async (raw: string) => {
            const question = raw.trim();
            if (!question || isStreaming) return;

            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const askedByName =
                localParticipant?.name || localParticipant?.identity || "You";

            // Local optimistic add + broadcast the question to the room.
            setItems((prev) => [
                ...prev,
                { id, question, askedByName, mine: true, answer: "", streaming: true },
            ]);
            broadcast({ v: 1, t: "q", id, question, askedByName });

            abortRef.current?.abort();
            abortRef.current = new AbortController();
            setIsStreaming(true);

            let accumulated = "";
            const finish = (answer: string, error?: string) => {
                // Guard the empty-but-successful case: an empty answer with no
                // error would otherwise leave the bubble on the "Thinking…"
                // spinner forever (here and on every remote). Give a soft
                // fallback so the exchange always resolves to something.
                let finalAnswer = answer;
                const finalError = error;
                if (!finalError && finalAnswer.trim() === "") {
                    finalAnswer = "I couldn't find an answer to that in the call.";
                }
                setItems((prev) =>
                    prev.map((it) =>
                        it.id === id
                            ? { ...it, answer: finalAnswer, error: finalError, streaming: false }
                            : it,
                    ),
                );
                // No broadcast: the server sends everyone the answer itself.
            };

            try {
                const transcript = getTranscript();
                const response = await authedStreamFetch(CallsPost.AIInCallAskStream, {
                    jsonBody: {
                        room_id: roomId,
                        question,
                        // So the server can send everyone the answer under this id.
                        question_id: id,
                        recent_transcript: transcript,
                    },
                    signal: abortRef.current.signal,
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const m = (errData as any)?.msg || `AI request failed: ${response.statusText}`;
                    finish("", m);
                    return;
                }

                const reader = response.body?.getReader();
                if (!reader) {
                    finish("", "No response body");
                    return;
                }

                // Buffer across reads: an SSE frame can be split mid-line
                // between two read() chunks, so we only parse complete lines
                // and carry the remainder forward.
                let buffer = "";
                const handleLine = (line: string): boolean => {
                    if (!line.startsWith("data: ")) return false;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.error) {
                            finish(accumulated, data.error);
                            return true;
                        }
                        if (typeof data.content === "string") {
                            accumulated += data.content;
                            setItems((prev) =>
                                prev.map((it) =>
                                    it.id === id ? { ...it, answer: accumulated } : it,
                                ),
                            );
                        }
                        if (typeof data.replace === "string") {
                            accumulated = data.replace;
                            setItems((prev) =>
                                prev.map((it) =>
                                    it.id === id ? { ...it, answer: accumulated } : it,
                                ),
                            );
                        }
                        if (data.done) {
                            finish(accumulated);
                            return true;
                        }
                    } catch {
                        // skip malformed/partial chunk
                    }
                    return false;
                };

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.current.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    // Keep the last (possibly partial) segment in the buffer.
                    buffer = lines.pop() ?? "";
                    for (const line of lines) {
                        if (handleLine(line)) return;
                    }
                }
                // Flush any trailing complete line left in the buffer.
                if (buffer && handleLine(buffer)) return;
                // Stream ended without explicit done.
                finish(accumulated);
            } catch (err: any) {
                if (err.name === "AbortError") {
                    // Local cancel — mark the item done with whatever we have.
                    setItems((prev) =>
                        prev.map((it) =>
                            it.id === id ? { ...it, streaming: false } : it,
                        ),
                    );
                } else {
                    finish(accumulated, err.message || "Streaming failed");
                }
            } finally {
                setIsStreaming(false);
            }
        },
        [broadcast, getTranscript, isStreaming, localParticipant, roomId],
    );

    const cancel = useCallback(() => {
        abortRef.current?.abort();
        setIsStreaming(false);
    }, []);

    // Abort any in-flight stream on unmount (e.g. leaving the call) and clear
    // any pending remote watchdogs.
    useEffect(() => {
        const watchdogs = remoteWatchdogs.current;
        return () => {
            abortRef.current?.abort();
            Object.values(watchdogs).forEach((t) => clearTimeout(t));
        };
    }, []);

    return { items, ask, cancel, isStreaming };
}

/**
 * Whether an answer may fill this item (CALL-BUG-14): it is for this question,
 * from the server for the participant who asked it, and the question isn't
 * this person's own (they streamed theirs). Pure; the caller has already
 * checked the answer came from the server.
 */
export function acceptsAnswer(item: Pick<InCallQAItem, "id" | "mine" | "askerId">, answerId: string, askedById: string | undefined): boolean {
    return item.id === answerId && !item.mine && !!item.askerId && item.askerId === askedById;
}
