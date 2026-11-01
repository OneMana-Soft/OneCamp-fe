/**
 * How the player's stage sits (DESIGN-BUILD-64's MUST 1 on meet-02, as Meet's
 * and Zoom's recording players sit): "picture" is the picture's own box, so
 * no band of black shows round a recording, in the sheet (the words beside it
 * take its height) and on a phone, whose player is always full screen, above
 * the words, which fill what's left; "screen" fills a full screen, a wide
 * screen's Full screen or a phone's with no words under it. Pure.
 *
 * It sits beside the player, which alone reads it, and not in
 * recording/recordingState: the recording lists load that on their first load.
 */
export function stageFit({ fullScreen, phone, words }: { fullScreen: boolean; phone: boolean; words: boolean }): "picture" | "screen" {
  return !fullScreen || (phone && words) ? "picture" : "screen"
}
