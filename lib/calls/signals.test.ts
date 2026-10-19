// Call Signals: who sent a packet is LiveKit's word, never the packet's
// (calls audit: captions trusted the speaker a packet claimed).
import { describe, expect, it } from "vitest"
import { readCaption, readSignal, senderOf } from "./signals"

const bytes = (o: object) => new TextEncoder().encode(JSON.stringify(o))

describe("readSignal", () => {
  it("reads only the topic asked for, only from the senders allowed", () => {
    expect(readSignal(bytes({ t: "a" }), undefined, { topic: "oc.ai", from: "server", received: "oc.ai" })).toEqual({ t: "a" })
    expect(readSignal(bytes({ t: "a" }), { identity: "jonas" }, { topic: "oc.ai", from: "server" })).toBeNull()
    expect(readSignal(bytes({ t: "a" }), undefined, { topic: "oc.ai", from: "server", received: "oc.call" })).toBeNull()
    expect(readSignal(new TextEncoder().encode("not json"), undefined, { topic: "x", from: "server" })).toBeNull()
  })

  it("knows the server, a person and the transcription agent apart", () => {
    expect(senderOf(undefined)).toBe("server")
    expect(senderOf({ identity: "maya" })).toBe("participant")
    expect(senderOf({ identity: "transcriber-bot" })).toBe("agent")
    expect(senderOf({ identity: "x", kind: 4 })).toBe("agent")
  })
})

describe("readCaption", () => {
  it("draws a forged line under the name of the person who sent it", () => {
    const forged = bytes({ participantIdentity: "maya", participantName: "Maya Chen", text: "I approve the budget", isFinal: true, id: "1" })
    expect(readCaption(forged, { identity: "jonas", name: "Jonas Weber" }, "lk.transcription")).toMatchObject({ participantIdentity: "jonas", participantName: "Jonas Weber", text: "I approve the budget" })
  })

  it("lets only the agent speak for someone else, and never the server", () => {
    const line = bytes({ participantIdentity: "maya", participantName: "Maya Chen", text: "hi" })
    expect(readCaption(line, { identity: "transcriber-bot" }, "lk.transcription")).toMatchObject({ participantIdentity: "maya", participantName: "Maya Chen" })
    expect(readCaption(line, undefined, "lk.transcription")).toBeNull()
    expect(readCaption(line, { identity: "jonas" }, "oc.ai")).toBeNull()
  })
})

// Step 3, part 2: the call's own signals, the layer the Call State package
// (#29, shared with chat B7) takes over: one topic, a kind and a payload,
// from the sender LiveKit names. Reactions ride on it, UI only.
import { CALL_REACTIONS, CALL_SIGNAL_TOPIC, encodeSignal, readCallSignal, readReaction } from "./signals"

describe("a call's own signals", () => {
  it("carry a kind and a payload on one topic, from the sender LiveKit says", () => {
    const sent = encodeSignal("hand", { up: true })
    expect(readCallSignal(sent, { identity: "maya", name: "Maya Chen" }, CALL_SIGNAL_TOPIC)).toEqual({ kind: "hand", payload: { up: true }, from: { identity: "maya", name: "Maya Chen" } })
  })

  it("take the sender from LiveKit, never from the packet", () => {
    const forged = bytes({ kind: "reaction", payload: { emoji: "👍" }, from: { identity: "maya", name: "Maya Chen" } })
    expect(readCallSignal(forged, { identity: "jonas", name: "Jonas Weber" }, CALL_SIGNAL_TOPIC)?.from).toEqual({ identity: "jonas", name: "Jonas Weber" })
  })

  it("come only from a person in the call, on their own topic, with a kind", () => {
    const sent = encodeSignal("reaction", { emoji: "👍" })
    expect(readCallSignal(sent, undefined, CALL_SIGNAL_TOPIC)).toBeNull()
    expect(readCallSignal(sent, { identity: "transcriber-bot" }, CALL_SIGNAL_TOPIC)).toBeNull()
    expect(readCallSignal(sent, { identity: "maya" }, "oc.ai")).toBeNull()
    expect(readCallSignal(sent, { identity: "maya" }, undefined)).toBeNull()
    expect(readCallSignal(bytes({ payload: {} }), { identity: "maya" }, CALL_SIGNAL_TOPIC)).toBeNull()
  })
})

describe("a reaction", () => {
  it("is one of the tray's emoji, from whoever sent it", () => {
    expect(CALL_REACTIONS).toHaveLength(6)
    expect(readReaction(encodeSignal("reaction", { emoji: "🎉" }), { identity: "maya", name: "Maya Chen" }, CALL_SIGNAL_TOPIC)).toEqual({ emoji: "🎉", identity: "maya", name: "Maya Chen" })
  })

  it("never draws what the tray doesn't offer: words, markup, a run of emoji", () => {
    for (const emoji of ["<img src=x onerror=alert(1)>", "I approve the budget", "👍👍👍👍👍", 42, null]) {
      expect(readReaction(encodeSignal("reaction", { emoji }), { identity: "maya" }, CALL_SIGNAL_TOPIC)).toBeNull()
    }
    expect(readReaction(encodeSignal("hand", { emoji: "👍" }), { identity: "maya" }, CALL_SIGNAL_TOPIC)).toBeNull()
  })
})
