import { createRequire } from "node:module"
import type { Page, WebSocketRoute } from "@playwright/test"

// A call server for one browser, faked: LiveKit's signal socket answered in
// the test, and the media server's half of the peer connection played by a
// second RTCPeerConnection in the same page. The room connects for real, so
// the room's metadata (what the call holds, the board on the stage) reaches
// the app as LiveKit sends it, and the server's data packets arrive on the
// data channel as they do from a real call. Nothing leaves the machine.
//
// The protocol's messages come from livekit-client's own copy of
// @livekit/protocol, so they are the ones the app decodes.
const protocol = createRequire(require.resolve("livekit-client"))("@livekit/protocol")
const { DataPacket, DataPacket_Kind, JoinResponse, ParticipantInfo, ParticipantInfo_State, ParticipantPermission, ParticipantUpdate, Room, ServerInfo, SessionDescription, SignalRequest, SignalResponse, TrackInfo, TrackPublishedResponse, TrackSource, UserPacket } = protocol

/** Someone in the call: their identity, the name everyone sees, and their LiveKit attributes (the call's role travels there). */
export interface FakePerson {
  identity: string
  name: string
  attributes?: Record<string, string>
}

const ROOM = { sid: "RM_fake", name: "fake-call" }

function personInfo(p: FakePerson, sid: string, state = ParticipantInfo_State.ACTIVE) {
  return new ParticipantInfo({
    sid,
    identity: p.identity,
    name: p.name,
    attributes: p.attributes ?? {},
    state,
    joinedAt: BigInt(Math.floor(Date.now() / 1000)),
    permission: new ParticipantPermission({ canSubscribe: true, canPublish: true, canPublishData: true }),
  })
}

/**
 * Answers the call's signal socket for `page`: you join as `you`, with
 * `others` already in the call, and the room's metadata as `metadata`
 * (an object, as the server writes it). Register it after stubBackend, so it
 * takes the call's socket from the stub's silent one. With `holdJoin` the
 * join isn't answered until releaseJoin(), so the room stays connecting, as
 * behind a slow call server: LiveKit names the room only from that answer.
 */
export async function fakeCallServer(page: Page, opts: { you: FakePerson; others?: FakePerson[]; metadata?: Record<string, unknown>; holdJoin?: boolean }) {
  let socket: WebSocketRoute | undefined
  let metadata = JSON.stringify(opts.metadata ?? {})
  let tracks = 0
  // What the page has published (its source, as LiveKit names it) and whether it is muted now.
  const published: { sid: string; source: string; muted: boolean }[] = []
  let releaseJoin = () => {}
  const joinHeld = opts.holdJoin ? new Promise<void>((resolve) => (releaseJoin = resolve)) : undefined
  const send = (message: { case: string; value: unknown }) => socket?.send(Buffer.from(new SignalResponse({ message }).toBinary()))

  // Each join is a connection of its own, numbered (a move to a breakout room
  // is one, calls package C). The page keeps only the newest one's peer
  // connection: a move closes the one before, and an offer from a connection
  // a move has replaced is moot. Answered anyway, it raced the move: it failed
  // ("Execution context was destroyed"), or it made a peer connection the new
  // connection's offer then landed on, whose data channel never opened.
  let generation = 0

  // The media server's end of the publisher connection, in the page: it
  // answers each offer with every candidate in the answer, and keeps the
  // client's reliable data channel to send the server's packets on. Null when
  // the connection was replaced meanwhile.
  async function answer(sdp: string, gen: number): Promise<string | null> {
    return page.evaluate(
      async ({ offer, gen }: { offer: string; gen: number }) => {
        type Server = { pc: RTCPeerConnection; reliable?: RTCDataChannel }
        const w = window as unknown as { __fakeCallServer?: Server; __fakeCallServerGen?: number }
        if (w.__fakeCallServerGen !== gen) return null
        if (!w.__fakeCallServer) {
          const pc = new RTCPeerConnection()
          const server: Server = { pc }
          pc.ondatachannel = ({ channel }) => {
            if (channel.label === "_reliable") server.reliable = channel
          }
          w.__fakeCallServer = server
        }
        const { pc } = w.__fakeCallServer
        await pc.setRemoteDescription({ type: "offer", sdp: offer })
        await pc.setLocalDescription(await pc.createAnswer())
        if (pc.iceGatheringState !== "complete") {
          await new Promise<void>((done) => {
            pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && done())
          })
        }
        return w.__fakeCallServerGen === gen ? pc.localDescription!.sdp : null
      },
      { offer: sdp, gen },
    )
  }

  // What the server's side asked of the page is moot, not a failure, once the
  // test has ended (a renegotiation after the last check), the page that
  // asked has gone (a navigation destroys its context, and its connection
  // with it), or a newer connection has replaced the one it was for. A test
  // that didn't expect the navigation fails on its own checks.
  const unlessMoot = <T,>(p: Promise<T>, gen: number): Promise<T | undefined> =>
    p.catch((e: unknown) => {
      if (page.isClosed() || /Test ended|has been closed|Execution context was destroyed/.test(String(e)) || gen !== generation) return undefined
      throw e
    })

  // The token each join came with, in order: a move to a breakout room is a
  // join of its own (calls package C), on a media connection of its own.
  const joins: string[] = []
  await page.routeWebSocket(/\/rtc(\/v1)?(\?|$)/, async (ws) => {
    joins.push(new URL(ws.url()).searchParams.get("access_token") ?? "")
    const gen = ++generation
    socket = ws
    await unlessMoot(
      page.evaluate((gen: number) => {
        const w = window as unknown as { __fakeCallServer?: { pc: RTCPeerConnection }; __fakeCallServerGen?: number }
        w.__fakeCallServer?.pc.close()
        delete w.__fakeCallServer
        w.__fakeCallServerGen = gen
      }, gen),
      gen,
    )
    if (joinHeld) await joinHeld
    const join = new JoinResponse({
      room: new Room({ ...ROOM, metadata }),
      participant: personInfo(opts.you, "PA_you"),
      otherParticipants: (opts.others ?? []).map((p, i) => personInfo(p, `PA_other${i}`)),
      serverVersion: "1.9.0",
      serverInfo: new ServerInfo({ version: "1.9.0", protocol: 15 }),
      subscriberPrimary: false,
      pingTimeout: 0,
      pingInterval: 0,
    })
    send({ case: "join", value: join })
    ws.onMessage(async (raw) => {
      const request = SignalRequest.fromBinary(typeof raw === "string" ? Buffer.from(raw) : raw)
      const m = request.message
      if (gen !== generation) return // a connection a move has replaced
      if (m.case === "offer") {
        const sdp = await unlessMoot(answer(m.value.sdp, gen), gen)
        if (sdp == null || gen !== generation) return
        send({ case: "answer", value: new SessionDescription({ type: "answer", sdp, id: m.value.id }) })
      } else if (m.case === "trickle") {
        const candidate = JSON.parse(m.value.candidateInit)
        // A trickle can still arrive as the test ends and closes the page, or as a move replaces its connection; only then is its failure nothing.
        await unlessMoot(
          page.evaluate((c) => (window as unknown as { __fakeCallServer?: { pc: RTCPeerConnection } }).__fakeCallServer?.pc.addIceCandidate(c), candidate),
          gen,
        )
      } else if (m.case === "addTrack") {
        tracks += 1
        const track = new TrackInfo({ sid: `TR_${tracks}`, type: m.value.type, name: m.value.name, source: m.value.source, muted: m.value.muted, width: m.value.width, height: m.value.height })
        published.push({ sid: track.sid, source: TrackSource[m.value.source] ?? String(m.value.source), muted: m.value.muted })
        send({ case: "trackPublished", value: new TrackPublishedResponse({ cid: m.value.cid, track }) })
      } else if (m.case === "mute") {
        const was = published.find((t) => t.sid === m.value.sid)
        if (was) was.muted = m.value.muted
      }
    })
  })

  return {
    /** The room's metadata changes, as the server writes it. */
    setMetadata(next: Record<string, unknown>) {
      metadata = JSON.stringify(next)
      send({ case: "roomUpdate", value: { room: new Room({ ...ROOM, metadata }) } })
    },
    /** A data packet from the server (no sender) on `topic`, over the reliable channel. */
    async sendData(topic: string, payload: unknown) {
      const bytes = new DataPacket({
        kind: DataPacket_Kind.RELIABLE,
        value: { case: "user", value: new UserPacket({ payload: new TextEncoder().encode(JSON.stringify(payload)), topic }) },
      }).toBinary()
      await page.waitForFunction(() => (window as unknown as { __fakeCallServer?: { reliable?: RTCDataChannel } }).__fakeCallServer?.reliable?.readyState === "open")
      await page.evaluate((b: number[]) => (window as unknown as { __fakeCallServer: { reliable: RTCDataChannel } }).__fakeCallServer.reliable.send(new Uint8Array(b)), Array.from(bytes))
    },
    /**
     * Someone already in the call leaves the room you're in, as LiveKit says
     * it (a participant update, disconnected): for a move of theirs to a
     * breakout room, or their leaving the call.
     */
    gone(identity: string) {
      const i = (opts.others ?? []).findIndex((p) => p.identity === identity)
      if (i < 0) throw new Error(`${identity} isn't among the call's others`)
      send({ case: "update", value: new ParticipantUpdate({ participants: [personInfo(opts.others![i], `PA_other${i}`, ParticipantInfo_State.DISCONNECTED)] }) })
    },
    /** Answers a join held by `holdJoin`, and every join after it. */
    releaseJoin: () => releaseJoin(),
    /** Every track the page has published, in order: its source (CAMERA, MICROPHONE…) and whether it is muted now. */
    published: () => published.map((t) => ({ ...t })),
    /** The token of every join so far, the latest last. */
    joins: () => [...joins],
    /** Whether the room is connected: the media connection is up. */
    connected: () => page.evaluate(() => (window as unknown as { __fakeCallServer?: { pc: RTCPeerConnection } }).__fakeCallServer?.pc.connectionState === "connected"),
  }
}
