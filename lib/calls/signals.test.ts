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
