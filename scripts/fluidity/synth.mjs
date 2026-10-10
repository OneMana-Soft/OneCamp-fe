// Long conversations, for the steps that need one. The demo's channels hold a
// handful of messages each, which hides what a busy channel costs: scrolling
// one, typing under a long thread. These answer the conversation's GETs with
// many more messages built from the real ones, here in the browser context.
// Nothing reaches the demo but the GET the page was making anyway.

const SPEAKERS = [
  { user_uuid: "3408b5a0-6883-423b-b138-2462fe59c48e", user_name: "Maya Chen", user_full_name: "Maya Chen" },
  { user_uuid: "ce6eaed2-ef46-48a8-9fba-24818ee824c5", user_name: "Jonas Weber", user_full_name: "Jonas Weber" },
  { user_uuid: "6d1c1f6e-0000-4000-8000-00000000f1a1", user_name: "Priya Shah", user_full_name: "Priya Shah" },
  { user_uuid: "6d1c1f6e-0000-4000-8000-00000000f1a2", user_name: "Tomás Ruiz", user_full_name: "Tomás Ruiz" },
]

// Varied on purpose: rows of different heights are what makes a virtual list
// measure, and what moves the page if it gets them wrong.
const BODIES = [
  "<p>Merged. The staging deploy is running now.</p>",
  "<p>Can someone check the numbers on the pricing page against the plans before Thursday? The Business tier still says the old seat count in one place.</p>",
  "<p>Notes from the sync:</p><ul><li><p>Load test moves to Wednesday morning</p></li><li><p>Rollback steps are in the Launch sync notes</p></li><li><p>Legal signed off on the terms</p></li></ul>",
  "<p>👍</p>",
  "<p>The import ran in 4 minutes on the copy of production. Two channels had attachments over the limit, so they came across as links. Everything else matched, including the threads and reactions.</p><p>I'll run it once more on Monday with the final export.</p>",
  "<p>Pushed a fix for the signup email. It was sending the link with the wrong host on self-hosted installs.</p><pre><code>APP_URL=https://work.example.com</code></pre>",
  "<p>Looks good to me.</p>",
  "<p>Who is on call Thursday? I want to put a name next to the rollback steps.</p>",
]

let counter = 0
const id = (n) => `5a1e0000-0000-4000-8000-${String(n).padStart(12, "0")}`
const iso = (ms) => new Date(ms).toISOString()

function post(n, at) {
  const by = SPEAKERS[n % SPEAKERS.length]
  return {
    post_uuid: id(n),
    post_text: BODIES[n % BODIES.length],
    post_by: by,
    post_comment_count: n % 9 === 0 ? 3 : 0,
    post_comments: n % 9 === 0 ? [{ comment_created_at: iso(at + 60000) }] : [],
    post_created_at: iso(at),
  }
}

/**
 * Answers one channel's message GETs with `total` messages: the real ones on
 * top, older made-up ones under them, a page at a time like the server.
 */
export async function longChannel(ctx, channelId, { total = 400, page = 50 } = {}) {
  const base = ++counter * 100000
  let realOldest = Date.now()
  await ctx.route(new RegExp(`/po/latestPosts/${channelId}$`), async (route) => {
    const resp = await route.fetch()
    const json = await resp.json()
    const real = json?.data?.posts ?? []
    if (real.length) realOldest = Math.min(...real.map((p) => Date.parse(p.post_created_at)))
    const made = Array.from({ length: Math.max(0, page - real.length) }, (_, i) => post(base + i, realOldest - (i + 1) * 7 * 60000))
    await route.fulfill({ response: resp, json: { ...json, data: { posts: [...real, ...made], has_more: true } } })
  })
  await ctx.route(new RegExp(`/po/oldPosts/${channelId}/(\\d+)$`), async (route) => {
    const before = Number(new URL(route.request().url()).pathname.split("/").pop()) * 1000
    // Messages are 7 minutes apart; the page before `before` continues the run.
    const offset = Math.round((realOldest - before) / (7 * 60000))
    const posts = []
    for (let i = 0; i < page && offset + i < total; i++) posts.push(post(base + Math.max(0, offset) + i, before - (i + 1) * 7 * 60000))
    await route.fulfill({ status: 200, contentType: "application/json", json: { msg: "ok", data: { posts, has_more: offset + page < total } } })
  })
}

/** Answers one post's thread GET with `total` replies. */
export async function longThread(ctx, postId, { total = 150 } = {}) {
  await ctx.route(new RegExp(`/po/allComments/${postId}$`), async (route) => {
    const resp = await route.fetch()
    const json = await resp.json()
    const data = json?.data
    if (!data) return route.fulfill({ response: resp })
    const real = data.post_comments ?? []
    const start = Date.parse(data.post_created_at || new Date().toISOString())
    const made = Array.from({ length: Math.max(0, total - real.length) }, (_, i) => ({
      comment_uuid: id(900000 + i),
      comment_text: BODIES[i % BODIES.length],
      comment_by: SPEAKERS[i % SPEAKERS.length],
      comment_created_at: iso(start + (i + 1) * 90000),
    }))
    const comments = [...real, ...made]
    await route.fulfill({ response: resp, json: { ...json, data: { ...data, post_comments: comments, post_comment_count: comments.length } } })
  })
}

const FIRST = ["Aarav", "Ines", "Kofi", "Lena", "Mei", "Nadia", "Omar", "Rhea", "Sven", "Tariq", "Yuki", "Zara", "Bruno", "Chidi", "Dara", "Elif"]
const LAST = ["Sharma", "Costa", "Mensah", "Vogel", "Lin", "Haddad", "Farouk", "Iyer", "Berg", "Aziz", "Sato", "Okafor", "Silva", "Eze", "Quinn", "Demir"]

/**
 * Answers one channel's member list with `total` people, none with a photo:
 * a list of coloured avatars, every one drawn from the camp tokens.
 */
export async function manyMembers(ctx, channelId, { total = 200 } = {}) {
  await ctx.route(new RegExp(`/ch/channelInfoWithMemberAdminFlag/${channelId}$`), async (route) => {
    const resp = await route.fetch()
    const json = await resp.json()
    const info = json?.channel_info ?? json?.data?.channel_info
    const real = info?.ch_members ?? []
    const template = real[0] ?? {}
    const made = Array.from({ length: Math.max(0, total - real.length) }, (_, i) => ({
      ...template,
      uid: undefined,
      user_uuid: id(700000 + i),
      user_name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`,
      user_full_name: `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`,
      user_email_id: `person${i}@example.com`,
      user_profile_object_key: "",
      user_status: "offline",
      ch_member_is_admin: false,
      is_bot: false,
    }))
    // The last one by a name the steps wait for: the list has drawn to its end.
    if (made.length) Object.assign(made[made.length - 1], { user_name: "Rhea Silva", user_full_name: "Rhea Silva" })
    if (!info) return route.fulfill({ response: resp })
    info.ch_members = [...real, ...made]
    if (typeof info.ch_member_count === "number") info.ch_member_count = info.ch_members.length
    await route.fulfill({ response: resp, json })
  })
}
