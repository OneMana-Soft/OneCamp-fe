import { newLocalId } from "./pendingSend"

// Its own module, beside newLocalId (the one id minter): pendingSend is in every
// route's first load through the store, and only the reply boxes send this way.

// The id each draft's send goes with, by the draft's key (a thread's root id
// for a reply): one slot a draft, emptied once the send went through.
const sendIds = new Map<string, { print: string; id: string }>()

/** A request body that carries its send id. */
export type WithSendId<T> = T & { client_msg_id: string }

/**
 * Sends a draft with its client_msg_id (V-1088). While the same draft (print:
 * its words, files and options) is sent again, after a failed send, a lost
 * answer, or while the first is still on its way, the id is the same, so the
 * server's send-once guard answers with what it already wrote; a draft that
 * changed, or one already sent, goes with a new id. A failure keeps the id for
 * Send again; an older send's answer never takes a newer draft's id with it.
 */
export function sendOnce<R>(key: string, print: readonly unknown[], send: (clientMsgId: string) => Promise<R>): Promise<R> {
  const p = JSON.stringify(print)
  let kept = sendIds.get(key)
  if (!kept || kept.print !== p) {
    kept = { print: p, id: newLocalId() }
    sendIds.set(key, kept)
  }
  const id = kept.id
  return send(id).then((answer) => {
    if (sendIds.get(key)?.id === id) sendIds.delete(key)
    return answer
  })
}
