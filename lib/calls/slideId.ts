/**
 * A slide the server takes (CallControl's slideShape): the element id of a
 * frame on the board, as Excalidraw makes them. "" is the whole board. A leaf,
 * so components/livekit/callState checks it without lib/calls/control.
 */
export const SLIDE_ID = /^[\w-]{1,64}$/
