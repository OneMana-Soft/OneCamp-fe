// The realtime broker (EMQX) as the app's client sees it: MQTT over a
// WebSocket, protocol 5 (hooks/useMqttConnection.ts), 3.1.1 answered too.
// fakeApp.mjs carries its socket with the collaboration server's timing (the
// handshakes, then half a round trip each way); this answers the packets:
// CONNECT with CONNACK, SUBSCRIBE with SUBACK, UNSUBSCRIBE with UNSUBACK,
// PINGREQ with PINGRESP, and a PUBLISH by handing it to every subscription
// that matches (MQTT 5's No Local respected), acknowledged at QoS 1 and 2.
// publish() is the server's side: a message the app hears as if a teammate
// had sent it. connackDelayMs holds the next CONNACKs that long (a broker slow
// to accept, or a connection that takes a while). Every packet is kept in `events` with the time it was heard or
// sent (Date.now()), which is how a run tells when the app was connected.
// (FLUIDITY-LEAD-6, 21 Oct 2026, for PLATFORM-LEAD-2's realtime split.)

const enc = new TextEncoder()
const dec = new TextDecoder()

/** MQTT's variable byte integer. */
function varint(n) {
  const out = []
  do {
    let b = n % 128
    n = Math.floor(n / 128)
    if (n > 0) b |= 128
    out.push(b)
  } while (n > 0)
  return out
}
/** A packet: its first byte, then the rest's length and the rest. */
function packet(first, body) {
  return Uint8Array.from([first, ...varint(body.length), ...body])
}
const u16 = (n) => [(n >> 8) & 255, n & 255]
const str = (s) => {
  const b = enc.encode(s)
  return [...u16(b.length), ...b]
}

/** Reads one packet's fields from `b` (the bytes after the fixed header). */
function reader(b) {
  let i = 0
  const r = {
    get done() {
      return i >= b.length
    },
    byte: () => b[i++],
    u16: () => {
      const n = (b[i] << 8) | b[i + 1]
      i += 2
      return n
    },
    varint: () => {
      let n = 0
      let mul = 1
      let c
      do {
        c = b[i++]
        n += (c & 127) * mul
        mul *= 128
      } while (c & 128)
      return n
    },
    str: () => {
      const n = r.u16()
      const s = dec.decode(b.subarray(i, i + n))
      i += n
      return s
    },
    skip: (n) => {
      i += n
    },
    rest: () => b.subarray(i),
  }
  return r
}

/** Whether `topic` matches the subscription `filter` (+ one level, # the rest). */
export function topicMatches(filter, topic) {
  const f = filter.split("/")
  const t = topic.split("/")
  for (let k = 0; k < f.length; k++) {
    if (f[k] === "#") return true
    if (k >= t.length) return false
    if (f[k] !== "+" && f[k] !== t[k]) return false
  }
  return f.length === t.length
}

/**
 * A broker for one browser context. `connect(send, close)` is a socket that
 * opened (the interface collabFor's server has): `send` takes the bytes for
 * the client, and the result's `receive` the client's.
 */
export function brokerFor({ log } = {}) {
  const clients = new Set()
  const events = []
  const note = (e) => {
    events.push({ t: Date.now(), ...e })
    log?.push(`mqtt ${e.type}${e.topic ? ` ${e.topic}` : ""}${e.filters ? ` ${e.filters.join(",")}` : ""}`)
  }
  const deliver = (from, topic, payload, retain = false) => {
    let n = 0
    for (const c of clients) {
      if (!c.open || !c.version) continue
      if (![...c.subs].some(([f, o]) => topicMatches(f, topic) && !(o.noLocal && c === from))) continue
      const props = c.version === 5 ? [0] : []
      c.send(packet(0x30 | (retain ? 1 : 0), [...str(topic), ...props, ...payload]))
      n++
    }
    return n
  }

  const broker = {
    events,
    /** Extra ms before a CONNACK is sent (0: at once). */
    connackDelayMs: 0,
    /** Whether any client is connected (its CONNACK sent). */
    get connected() {
      return [...clients].some((c) => c.open && c.version)
    },
    /** The server sends `payload` (a string, an object as JSON, or bytes) on `topic`; how many clients it reached. */
    publish(topic, payload) {
      const bytes = payload instanceof Uint8Array ? payload : enc.encode(typeof payload === "string" ? payload : JSON.stringify(payload))
      const n = deliver(null, topic, bytes)
      note({ type: "publish-out", topic, reached: n })
      return n
    },
    /** The topic filters the clients hold now. */
    subscriptions() {
      return [...clients].flatMap((c) => (c.open ? [...c.subs.keys()] : []))
    },
    connect(send, close) {
      const c = { open: true, version: 0, subs: new Map(), send }
      clients.add(c)
      let buf = new Uint8Array(0)
      const handle = (type, flags, body) => {
        const r = reader(body)
        const props = () => c.version === 5 && r.skip(r.varint())
        switch (type) {
          case 1: {
            // CONNECT: the protocol's name, then its level (4 is 3.1.1, 5 is 5).
            r.str()
            const version = r.byte()
            note({ type: "connect", version })
            const accept = () => {
              if (!c.open) return
              c.version = version
              send(packet(0x20, version === 5 ? [0, 0, 0] : [0, 0]))
              note({ type: "connack" })
            }
            broker.connackDelayMs ? setTimeout(accept, broker.connackDelayMs) : accept()
            return
          }
          case 3: {
            const qos = (flags >> 1) & 3
            const topic = r.str()
            const id = qos ? r.u16() : 0
            props()
            const payload = r.rest()
            note({ type: "publish-in", topic, bytes: payload.length })
            if (qos === 1) send(packet(0x40, u16(id)))
            if (qos === 2) send(packet(0x50, u16(id)))
            deliver(c, topic, payload, (flags & 1) === 1)
            return
          }
          case 6: // PUBREL, then PUBCOMP
            send(packet(0x70, u16(r.u16())))
            return
          case 8: {
            if (!c.version) return // not accepted yet: a real broker hasn't read it
            const id = r.u16()
            props()
            const filters = []
            const codes = []
            while (!r.done) {
              const f = r.str()
              const o = r.byte()
              c.subs.set(f, { qos: o & 3, noLocal: c.version === 5 && (o & 4) === 4 })
              filters.push(f)
              codes.push(Math.min(o & 3, 2))
            }
            note({ type: "subscribe", filters })
            send(packet(0x90, [...u16(id), ...(c.version === 5 ? [0] : []), ...codes]))
            return
          }
          case 10: {
            const id = r.u16()
            props()
            const filters = []
            while (!r.done) {
              const f = r.str()
              c.subs.delete(f)
              filters.push(f)
            }
            note({ type: "unsubscribe", filters })
            send(packet(0xb0, [...u16(id), ...(c.version === 5 ? [0, ...filters.map(() => 0)] : [])]))
            return
          }
          case 12:
            send(Uint8Array.from([0xd0, 0]))
            return
          case 14:
            note({ type: "disconnect" })
            c.open = false
            close()
            return
          default:
            // PUBACK, PUBREC, PUBCOMP for the server's own messages (sent at QoS 0: none come), AUTH.
            return
        }
      }
      return {
        // A WebSocket frame may hold several packets, or part of one.
        receive(bytes) {
          const all = new Uint8Array(buf.length + bytes.length)
          all.set(buf)
          all.set(bytes, buf.length)
          buf = all
          for (;;) {
            if (buf.length < 2) return
            let len = 0
            let mul = 1
            let k = 1
            for (; k < 5; k++) {
              if (k >= buf.length) return
              len += (buf[k] & 127) * mul
              mul *= 128
              if (!(buf[k] & 128)) break
            }
            const end = k + 1 + len
            if (buf.length < end) return
            const first = buf[0]
            const body = buf.subarray(k + 1, end)
            buf = buf.slice(end)
            handle(first >> 4, first & 15, body)
          }
        },
        closed() {
          c.open = false
          clients.delete(c)
          note({ type: "closed" })
        },
      }
    },
  }
  return broker
}
