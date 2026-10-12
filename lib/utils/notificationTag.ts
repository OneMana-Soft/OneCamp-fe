/**
 * notificationTag: the tag a push notification is shown under.
 *
 * A browser keeps one notification per tag: a newer one with the same tag
 * replaces the one before it. The service worker tagged by kind alone ("chat",
 * "channel"), so every DM shared one tag and Jonas's message replaced Maya's
 * before she was read; every channel message did the same (TN-BUG-6).
 *
 * Now a notification is one per place and sender. The place is the
 * conversation (type_id), and for a reply, a reaction or a task comment the
 * thread it happened in (thread_id); a new message's thread_id is the message
 * itself, so it is left out, and a sender's burst in one conversation stays one
 * notification showing their latest. The sender is the payload's username;
 * a push with none (a reminder) is told apart by what it says. A tag the server
 * sets itself (one per approval, one per agent task) is kept. Each is scoped to
 * the signed-in person, so two accounts in one browser never share one.
 *
 * public/firebase-messaging-sw.js can't import this, so it carries a mirror
 * between "BEGIN notification tag" and "END notification tag";
 * notificationTag.test.ts evaluates it and holds the two to the same answers.
 */
import type { PushNotificationData } from "@/lib/utils/notificationRoute"

/** The payload fields a tag is made from. Everything is optional: it's wire data. */
export interface TaggedPushData extends PushNotificationData {
  tag?: string
  username?: string
  title?: string
  body?: string
}

export function notificationTag(data: TaggedPushData | null | undefined, selfUUID?: string | null): string {
  const t = (v?: string) => (v || "").trim()
  const own = t(data?.tag)
  const kind = t(data?.type) || "general"
  const tag = own || [
    kind,
    t(data?.type_id),
    // A new message's thread_id is the message itself, not a thread.
    kind === "chat" || kind === "channel" ? "" : t(data?.thread_id),
    t(data?.username) || t(data?.body) || t(data?.title),
  ].filter(Boolean).join(":")
  return selfUUID ? `${selfUUID}_${tag}` : tag
}
