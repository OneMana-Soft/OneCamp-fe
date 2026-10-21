/**
 * A conversation's message list (chat A1 host, PROGRAM.md §3.6: frozen once
 * A1 merges, its slots the integrator's): the one virtual list every
 * conversation and thread draws its messages in, by day, with the unread line,
 * a shared history's heading and the jump to the newest.
 *
 * Step 1 (A1): today's list (components/message/MessageListVirtua), which the
 * per-kind lists reach only through here; CHAT-A1B moves it in.
 */
export { MessageListVirtua as MessageList } from "@/components/message/MessageListVirtua"
