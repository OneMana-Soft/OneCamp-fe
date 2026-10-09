// The frame the AI UI Designer (BoardUIStudio) shows a generated screen in,
// and the document it's exported as.
//
// The screen's markup is the model's, so it's untrusted. The server strips
// scripts, frames and handlers from it, but by pattern, and a pattern can be
// got round: <img/onerror=…> has no space before its handler, so it stayed.

/**
 * The preview frame's sandbox. It keeps allow-same-origin: the PNG export
 * reads the rendered screen out of the frame (contentDocument, then
 * html-to-image), which a frame of another origin doesn't allow, and nothing
 * talks to the frame by postMessage instead. So a script in the frame runs as
 * the app would, and the frame's CSP (frameDocument) lets none of the
 * markup's run: no inline script and no event handler, only the Tailwind CDN.
 */
export const PREVIEW_SANDBOX = "allow-scripts allow-same-origin"

/**
 * The screen's markup as a document: Tailwind, Inter and a strict CSP. Shown
 * in the preview frame, and what Copy and Download HTML give.
 */
export function frameDocument(bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://cdn.tailwindcss.com 'unsafe-eval'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; connect-src https://cdn.tailwindcss.com https://fonts.googleapis.com;"/>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
<style>*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.12);border-radius:8px}</style>
</head><body>${bodyHtml}</body></html>`
}
