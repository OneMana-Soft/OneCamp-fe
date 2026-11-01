/**
 * A grid's block of cells on the clipboard (tables G1): what Sheets and Excel
 * put there (text/plain as tab-separated lines, text/html as a table), read
 * into rows of cells, and a block written back for them. Pure.
 */

/** Rows of cells, as text. */
export type Block = string[][]

/**
 * Tab-separated lines, as Sheets and Excel copy them: rows end at \r\n, \n
 * or \r, cells at a tab; a cell that starts with a quote runs to its closing
 * quote, keeping its tabs and line ends, with "" for a quote. One line end at
 * the very end is dropped; empty text is one empty cell.
 */
export function parseTsv(text: string): Block {
  const rows: Block = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  let fresh = true
  const endCell = () => {
    row.push(cell)
    cell = ""
    fresh = true
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch !== '"') cell += ch
      else if (text[i + 1] === '"') {
        cell += '"'
        i++
      } else quoted = false
      continue
    }
    if (fresh && ch === '"') {
      quoted = true
      fresh = false
      continue
    }
    fresh = false
    if (ch === "\t") endCell()
    else if (ch === "\r" || ch === "\n") {
      endRow()
      if (ch === "\r" && text[i + 1] === "\n") i++
    } else cell += ch
  }
  const endedWithLine = rows.length > 0 && !quoted && fresh && row.length === 0 && cell === "" && /[\r\n]$/.test(text)
  if (!endedWithLine) endRow()
  return rows
}

/** A cell's text as a browser shows it: markup's runs of spaces as one, a <br> as a line end, each line trimmed. */
function cellText(td: Element): string {
  let out = ""
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE) out += (c.textContent ?? "").replace(/\s+/g, " ")
      else if (c.nodeName === "BR") out += "\n"
      else walk(c)
    }
  }
  walk(td)
  return out
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
}

/** The first table of Sheets' or Excel's text/html, as rows of cells; null when there is none. */
export function parseHtmlTable(html: string): Block | null {
  if (typeof DOMParser === "undefined") return null
  const table = new DOMParser().parseFromString(html, "text/html").querySelector("table")
  if (!table) return null
  const rows: Block = []
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    if (tr.closest("table") !== table) continue
    rows.push(
      Array.from(tr.children)
        .filter((c) => c.tagName === "TD" || c.tagName === "TH")
        .map(cellText),
    )
  }
  return rows.length ? rows : null
}

/** The block a paste carries: the HTML table when there is one, else the text. */
export function blockFromClipboard(data: { html?: string; text?: string }): Block {
  return (data.html ? parseHtmlTable(data.html) : null) ?? parseTsv(data.text ?? "")
}

/** A block as tab-separated lines that Sheets and Excel read back cell for cell. */
export function toTsv(b: Block): string {
  const cell = (c: string) => (/[\t\r\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)
  return b.map((r) => r.map(cell).join("\t")).join("\n")
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** A block as an HTML table, escaped, with line ends as <br>. */
export function toHtmlTable(b: Block): string {
  const rows = b.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c).replace(/\r\n|\r|\n/g, "<br>")}</td>`).join("")}</tr>`).join("")
  return `<table><tbody>${rows}</tbody></table>`
}
