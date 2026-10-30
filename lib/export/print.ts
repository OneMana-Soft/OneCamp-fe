/**
 * Export as PDF: the browser's print dialog, which saves a PDF with real
 * text. The print stylesheet (minimal-tiptap/styles/partials/print.css)
 * prints the sheet alone; no server is involved. A board's frames print
 * the same way (components/board/boardExport).
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
