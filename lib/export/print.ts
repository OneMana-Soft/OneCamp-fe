/**
 * Export as PDF: the browser's print dialog, which saves a PDF with real
 * text. The print stylesheet (minimal-tiptap/styles/partials/print.css)
 * prints the sheet alone; no server is involved. A board's frames print
 * the same way (components/board/boardExport), and a table's view
 * (lib/tables/printView), through printHost.
 */

const IMAGE_WAIT_MS = 3000

export async function printDoc(title: string): Promise<void> {
  if (typeof window === 'undefined') return
  // Pictures further down load now, so the PDF has them.
  const images = Array.from(document.querySelectorAll<HTMLImageElement>('.doc-scroll img'))
  for (const img of images) if (img.loading === 'lazy') img.loading = 'eager'
  const pending = images.filter((img) => !img.complete)
  if (pending.length) {
    await Promise.race([
      Promise.all(
        pending.map(
          (img) =>
            new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
            }),
        ),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, IMAGE_WAIT_MS)),
    ])
  }
  printTitled(title)
}

/**
 * The browser's print dialog, which saves a PDF, named after title: the
 * dialog names the PDF after the page's title, so it is the doc's or the
 * board's while it is open. done runs once the dialog has closed
 * (afterprint), and only then: a browser whose print() returns before its
 * dialog has drawn the page (iOS Safari) still reads what is printed.
 */
export function printTitled(title: string, done?: () => void): void {
  const before = document.title
  if (title.trim()) document.title = title.trim()
  let titled = true
  const untitle = () => {
    if (!titled) return
    titled = false
    document.title = before
  }
  window.addEventListener(
    'afterprint',
    () => {
      untitle()
      done?.()
    },
    { once: true },
  )
  try {
    window.print()
  } finally {
    // A browser that fires no afterprint gets its title back a moment later
    // (the dialog has read it by then).
    setTimeout(untitle, 1000)
  }
}

/**
 * Prints what `fill` puts in a host of its own, and nothing else on the page,
 * under `title` (printTitled names the PDF after it). The host sits at the
 * body's end, out of sight on screen; its print style is `css` (rules on
 * [data-<name>-print], inside @media print), added only for this print. Both
 * go once the dialog closes, printed or cancelled; a browser that never says
 * so keeps them, out of sight, until the next print of that name takes them
 * away. A board's frames (components/board/boardExport) and a table's view
 * (lib/tables/printView) print through it. Its style holds what any of them
 * prints by: the page's margins, white paper in a dark theme too, a table's
 * header row on every page and no row split across two.
 */
export function printHost(name: string, fill: (host: HTMLElement) => void, css: string, title: string): void {
  const mark = `data-${name}-print`
  for (const left of document.querySelectorAll(`[${mark}], style[${mark}-style]`)) left.remove()
  const host = document.createElement("div")
  host.setAttribute(mark, "")
  fill(host)
  const style = document.createElement("style")
  style.setAttribute(`${mark}-style`, "")
  style.textContent = `@media screen{[${mark}]{display:none}}@media print{@page{margin:12mm}html,body{background:#fff!important}body>*:not([${mark}]){display:none!important}[${mark}]{color-scheme:light}[${mark}] thead{display:table-header-group}[${mark}] tr{break-inside:avoid}${css}}`
  document.head.appendChild(style)
  document.body.appendChild(host)
  printTitled(title, () => {
    host.remove()
    style.remove()
  })
}
