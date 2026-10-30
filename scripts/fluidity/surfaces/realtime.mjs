// The realtime engine against a broker that answers (fakeBroker.mjs), for
// PLATFORM-LEAD-2's realtime split (FLUIDITY-LEAD-6, 21 Oct 2026). Every
// other group keeps the silent broker, so their numbers compare with those
// before it; this one connects. Each open is a new tab's: the browser's cache
// is emptied first.
//
// - rtOpen: a channel opened cold. When its first message shows, and when the
//   app's CONNECT, CONNACK and first SUBSCRIBE reach the broker, all from the
//   navigation's start. rtGapMs is how long after its history's answer the
//   app subscribed: a message sent between the two is in neither.
// - rtLive: once subscribed, a teammate's message published: until it shows.
// - rtGap: a teammate posts, as the server does it (into the history, then
//   published), 50 ms after the history's first answer reached the app: if
//   the app hasn't subscribed by then, only a later read of the history can
//   show it. rtGapShown is 1 when it shows within 6 s.
// - rtHeld: the same with the broker's CONNACK held 3.5 s, past the 3 s after
//   which a client should read the history again once connected (the realtime
//   split's rule). rtHeldReads counts the history's reads.
//
// The broker's topics and the post's shape are PLATFORM-LEAD-2's: the app
// subscribes to every topic /config/mqttConfig names, and routes a message by
// its payload's type (0, 0: a post created).
import { CHANNELS, NOW, PEOPLE, calendarFixtures, chatFixtures, pageOf, shellFixtures, workFixtures, workSidebar } from "../workspace.mjs"

const CH = CHANNELS[1]
const TOPIC = "fluid/c1"
const ROW = { sel: "[data-message-row]" }
// The broker's host only needs the realtime server's name (appServers.mjs);
// the fake takes the socket before any lookup.
const MQTT_CONFIG = {
  msg: "ok",
  data: { clientId: "fluid", username: "u", password: "p", topics: [TOPIC], conversation_topics: { [`channel:${CH.id}`]: [TOPIC] }, ws_url: "ws://onecamp-emqx.fluid.test/mqtt" },
}
const FROM = PEOPLE[1] // Jonas Weber, not the signed-in person

// What the server holds for the channel beyond its fixture: posts sent during
// a run, each from its time on. And the history's reads, by their times.
let sent = []
let reads = []
let afterRead = null // run once, 50 ms after the history's next answer
const newPost = (n, text, atMs) => {
  const uuid = `7d1e0c2a-1111-4a2b-9c3d-${String(n).padStart(12, "0")}`
  const created = new Date(NOW + n * 60_000).toISOString()
  return {
    atMs,
    text,
    // The history's shape (workspace.mjs post())…
    http: { post_uuid: uuid, post_text: `<p>${text}</p>`, post_by: FROM, post_created_at: created, post_comment_count: 0, post_comments: [], post_reactions: [], post_attachments: [] },
    // …and the broker's (type 0, Post; data.type 0, Create).
    mqtt: {
      type: 0,
      data: { type: 0, post_uuid: uuid, post_html_text: `<p>${text}</p>`, user_uuid: FROM.user_uuid, post_channel_uuid: CH.id, post_created_at: created, post_updated_at: created, user_profile_object_key: "", user_full_name: FROM.user_full_name, post_attachments: [] },
    },
  }
}

const group = {
  name: "realtime",
  broker: true,
  fixtures: () => [
    [/\/config\/mqttConfig$/, MQTT_CONFIG],
    [
      new RegExp(`/po/latestPosts/${CH.id}$`),
      () => {
        reads.push(Date.now())
        if (afterRead) setTimeout(afterRead, 50)
        afterRead = null
        const page = pageOf(CH, 0)
        const now = Date.now()
        const late = sent.filter((p) => p.atMs <= now).map((p) => p.http)
        return { msg: "ok", data: { ...page, posts: [...late.reverse(), ...page.posts] } }
      },
    ],
    ...shellFixtures(),
    ...calendarFixtures(),
    ...workFixtures(),
    ...chatFixtures({ sidebar: workSidebar() }),
  ],
  async run(h) {
    const { page, cdp, context } = h
    const broker = context.__broker
    const M = {}
    const sleep = (ms) => page.waitForTimeout(ms)
    sent = []
    reads = []
    afterRead = null
    let n = 0
    const fromNav = async (t) => (t == null ? null : Math.round(t - (await page.evaluate(() => performance.timeOrigin))))
    const firstEvent = (type, since) => broker.events.find((e) => e.type === type && e.t >= since)?.t ?? null
    const shows = (text, timeout) =>
      page
        .waitForFunction((t) => [...document.querySelectorAll("[data-message-row]")].some((el) => el.textContent.includes(t)), text, { timeout })
        .then(() => 1)
        .catch(() => 0)
    // Before a new tab's open: off the app (its socket closes), nothing cached.
    const coldOpen = async () => {
      await page.goto("about:blank")
      await cdp.send("Network.clearBrowserCache").catch(() => {})
      return Date.now()
    }

    // ---- rtOpen: a channel opened cold, until its first message; and the connection ----
    broker.connackDelayMs = 0
    let since = await coldOpen()
    const open = await h.step("rtOpen", {
      act: () => h.goto(`/app/channel/${CH.id}`),
      ready: () => h.ready(ROW, { fromNav: true, timeout: 60000 }),
      nav: true,
      settle: 1500,
    })
    // The engine may load after the page is quiet: wait for its first SUBSCRIBE.
    for (let i = 0; i < 150 && !firstEvent("subscribe", since); i++) await sleep(100)
    M.rtOpenMs = open?.ready
    M.rtOpenRenders = open?.renders
    M.rtOpenKB = open?.net?.scriptKB
    M.rtConnectMs = await fromNav(firstEvent("connect", since))
    M.rtConnackMs = await fromNav(firstEvent("connack", since))
    M.rtSubscribeMs = await fromNav(firstEvent("subscribe", since))
    M.rtGapMs = M.rtSubscribeMs != null && reads.length ? M.rtSubscribeMs - (await fromNav(reads[0])) : null
    M.rtTopics = broker.subscriptions().length

    // ---- rtLive: once subscribed, a teammate's message, until it shows ----
    if (M.rtSubscribeMs != null && h.wants("rtLive")) {
      const p = newPost(++n, "Live hello from the broker", Number.MAX_SAFE_INTEGER)
      const live = await h.step("rtLive", {
        act: async () => {
          broker.publish(TOPIC, p.mqtt)
        },
        ready: () => h.ready({ sel: "[data-message-row]", text: p.text }, { timeout: 10000 }),
        settle: 600,
      })
      M.rtLiveMs = live?.ready
      M.rtLiveRenders = live?.renders
    }

    // ---- rtGap and rtHeld: a teammate posts just after the history's first answer ----
    for (const [id, held] of [["rtGap", 0], ["rtHeld", 3500]]) {
      if (!h.wants(id)) continue
      broker.connackDelayMs = held
      since = await coldOpen()
      const before = reads.length
      let p = null
      afterRead = () => {
        p = newPost(++n, held ? "Posted while the connection waited" : "Posted before the app subscribed", Date.now())
        sent.push(p)
        broker.publish(TOPIC, p.mqtt)
      }
      const navAt = Date.now()
      await h.goto(`/app/channel/${CH.id}`)
      for (let i = 0; i < 100 && !p; i++) await sleep(100)
      M[`${id}Shown`] = p ? await shows(p.text, held ? 10000 : 6000) : null
      M[`${id}ShownMs`] = M[`${id}Shown`] ? Date.now() - navAt : null
      M[`${id}PostedMs`] = p ? p.atMs - navAt : null
      M[`${id}SubscribeMs`] = await fromNav(firstEvent("subscribe", since))
      M[`${id}Reads`] = reads.length - before
      afterRead = null
      broker.connackDelayMs = 0
    }
    return M
  },
}

export default group
