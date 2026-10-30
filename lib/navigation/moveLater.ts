/**
 * A move the page makes by itself a while later (GitHub's callback taking an
 * admin on). From this call on, the person's first press or key, or
 * Back/Forward, ends it, so it never pulls them from a move of their own,
 * even one still loading: a push cancels a move on its way. go(ms) moves ms
 * later unless they moved; theyMoved says they did; stop() ends it (unmount).
 */
export function moveLater(move: () => void, theyMoved: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let over = false
  const moved = () => {
    stop()
    theyMoved()
  }
  addEventListener("pointerdown", moved, true)
  addEventListener("keydown", moved, true)
  addEventListener("popstate", moved)
  function stop() {
    over = true
    clearTimeout(timer)
    removeEventListener("pointerdown", moved, true)
    removeEventListener("keydown", moved, true)
    removeEventListener("popstate", moved)
  }
  const go = (ms: number) => {
    if (!over)
      timer = setTimeout(() => {
        stop()
        move()
      }, ms)
  }
  return { go, stop }
}
