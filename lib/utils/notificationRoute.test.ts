import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  notificationRoute,
  chatRouteSegment,
  NOTIFICATION_FALLBACK_ROUTE,
  type PushNotificationData,
} from "@/lib/utils/notificationRoute"

/**
 * Two jobs here.
 *
 * First, pin the mapping against the backend's actual payload contract. The bug
 * these replace: both clients built /app/tasks/{thread_id} for task
 * notifications, when the route is /app/task/[task-id] and the backend puts the
 * task id in type_id (thread_id is never set for type "task"). Every task
 * notification tap opened /app/tasks/undefined.
 *
 * Second, keep the service worker's copy honest. public/firebase-messaging-sw.js
 * can't import app modules, so it carries a hand-written mirror; the parity suite
 * below evaluates the real shipped code out of that file and requires it to agree
 * with this module on every case. Editing one without the other fails the build.
 */

const SELF = "self-uuid"
const OTHER = "other-uuid"

/** One row per notification type the backend can send, with the ids it sends. */
const CASES: { name: string; data: PushNotificationData; expected: string }[] = [
  // Chat family: type_id is the chat grouping id — a space-joined pair for a DM,
  // a group id otherwise.
  {
    name: "chat in a DM opens the conversation with the other person",
    data: { type: "chat", type_id: `${SELF} ${OTHER}`, thread_id: "chat-1" },
    expected: `/app/chat/${OTHER}`,
  },
  {
    name: "chat in a group opens the group conversation",
    data: { type: "chat", type_id: "grp-1", thread_id: "chat-1" },
    expected: "/app/chat/group/grp-1",
  },
  {
    name: "chat without thread_id still opens the conversation",
    data: { type: "chat", type_id: "grp-1" },
    expected: "/app/chat/group/grp-1",
  },
  {
    name: "chat_reaction opens the thread it happened in",
    data: { type: "chat_reaction", type_id: `${OTHER} ${SELF}`, thread_id: "chat-9" },
    expected: `/app/chat/${OTHER}/chat-9`,
  },
  {
    name: "chat_comment opens the thread in a group",
    data: { type: "chat_comment", type_id: "grp-2", thread_id: "chat-7" },
    expected: "/app/chat/group/grp-2/chat-7",
  },
  {
    name: "chat_comment_reaction opens the thread",
    data: { type: "chat_comment_reaction", type_id: "grp-2", thread_id: "chat-7" },
    expected: "/app/chat/group/grp-2/chat-7",
  },
  // Channel family: type_id is the channel, thread_id the post.
  {
    name: "channel opens the post when one is given",
    data: { type: "channel", type_id: "ch-1", thread_id: "post-1" },
    expected: "/app/channel/ch-1/post-1",
  },
  {
    name: "channel without a post opens the channel",
    data: { type: "channel", type_id: "ch-1" },
    expected: "/app/channel/ch-1",
  },
  {
    name: "post_comment opens the post",
    data: { type: "post_comment", type_id: "ch-2", thread_id: "post-5" },
    expected: "/app/channel/ch-2/post-5",
  },
  {
    name: "channel_call opens the channel",
    data: { type: "channel_call", type_id: "ch-3" },
    expected: "/app/channel/ch-3",
  },
  // Tasks: the id moves between keys depending on the type. This is the bug.
  {
    name: "task reads the task id from type_id (singular /app/task)",
    data: { type: "task", type_id: "task-1" },
    expected: "/app/task/task-1",
  },
  {
    name: "task_comment reads the task id from thread_id, not the project in type_id",
    data: { type: "task_comment", type_id: "project-1", thread_id: "task-2" },
    expected: "/app/task/task-2",
  },
  { name: "doc_comment opens the doc", data: { type: "doc_comment", type_id: "doc-1" }, expected: "/app/doc/doc-1" },
  { name: "reminder just focuses the app", data: { type: "reminder", type_id: SELF }, expected: "/app" },
]

/** Payloads that must never produce a path with a missing segment. */
const DEGRADED: { name: string; data: PushNotificationData | null | undefined }[] = [
  { name: "no data at all", data: null },
  { name: "undefined data", data: undefined },
  { name: "no type", data: { type_id: "x" } },
  { name: "unknown type", data: { type: "something_new", type_id: "x" } },
  { name: "task with no id", data: { type: "task" } },
  { name: "task_comment with only a project", data: { type: "task_comment", type_id: "project-1" } },
  { name: "channel with no id", data: { type: "channel" } },
  { name: "doc_comment with no id", data: { type: "doc_comment" } },
  { name: "chat with no grouping id", data: { type: "chat" } },
  { name: "chat with a blank grouping id", data: { type: "chat", type_id: "   " } },
]

describe("notificationRoute", () => {
  for (const { name, data, expected } of CASES) {
    it(name, () => {
      expect(notificationRoute(data, SELF)).toBe(expected)
    })
  }

  for (const { name, data } of DEGRADED) {
    it(`falls back rather than routing to a missing id: ${name}`, () => {
      const route = notificationRoute(data, SELF)
      expect(route).toBe(NOTIFICATION_FALLBACK_ROUTE)
    })
  }

  it("never emits an undefined or empty path segment", () => {
    for (const { data } of [...CASES, ...DEGRADED]) {
      const route = notificationRoute(data as PushNotificationData, SELF)
      expect(route).not.toContain("undefined")
      expect(route).not.toContain("//")
      expect(route.endsWith("/")).toBe(false)
    }
  })

  it("refuses to guess a DM when the signed-in user is unknown", () => {
    // Picking the wrong half of the pair would open a conversation with yourself.
    expect(notificationRoute({ type: "chat", type_id: `${SELF} ${OTHER}` }, undefined)).toBe(
      NOTIFICATION_FALLBACK_ROUTE,
    )
    // A group id needs no such knowledge, so it still resolves.
    expect(notificationRoute({ type: "chat", type_id: "grp-1" }, undefined)).toBe("/app/chat/group/grp-1")
  })

  it("handles a self-DM without dropping the conversation", () => {
    expect(chatRouteSegment(`${SELF} ${SELF}`, SELF)).toBe(SELF)
  })
})

/**
 * Parity: evaluate the real code shipped in the service worker and compare it,
 * case for case, with the module above.
 */
describe("service worker mirror", () => {
  const swSource = readFileSync(
    resolve(__dirname, "../../public/firebase-messaging-sw.js"),
    "utf8",
  )

  const BEGIN = "// --- BEGIN notification route"
  const END = "// --- END notification route ---"

  it("still carries the delimited mirror", () => {
    expect(swSource).toContain(BEGIN)
    expect(swSource).toContain(END)
  })

  const start = swSource.indexOf(BEGIN)
  const end = swSource.indexOf(END)
  const mirrorSource = swSource.slice(start, end)

  const mirror = new Function(
    `${mirrorSource}; return { route: oneCampNotificationRoute, segment: oneCampChatRouteSegment, fallback: ONECAMP_NOTIFICATION_FALLBACK_ROUTE };`,
  )() as {
    route: (data: PushNotificationData | null | undefined, selfUUID?: string) => string
    segment: (groupingId: string, selfUUID?: string) => string | null
    fallback: string
  }

  it("agrees on the fallback route", () => {
    expect(mirror.fallback).toBe(NOTIFICATION_FALLBACK_ROUTE)
  })

  for (const { name, data, expected } of CASES) {
    it(`matches the module: ${name}`, () => {
      expect(mirror.route(data, SELF)).toBe(expected)
      expect(mirror.route(data, SELF)).toBe(notificationRoute(data, SELF))
    })
  }

  for (const { name, data } of DEGRADED) {
    it(`matches the module on degraded input: ${name}`, () => {
      expect(mirror.route(data, SELF)).toBe(notificationRoute(data as PushNotificationData, SELF))
    })
  }

  it("matches the module when the signed-in user is unknown", () => {
    const data = { type: "chat", type_id: `${SELF} ${OTHER}` }
    expect(mirror.route(data, undefined)).toBe(notificationRoute(data, undefined))
  })

  it("no longer references the removed /app/tasks path or the old helper", () => {
    expect(swSource).not.toContain("/app/tasks/")
    expect(swSource).not.toContain("getOtherUserId")
  })
})
