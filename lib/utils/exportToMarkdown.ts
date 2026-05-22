/**
 * Convert HTML to Markdown for export
 * Lightweight converter for common Tiptap nodes
 */

export function htmlToMarkdown(html: string): string {
  const temp = document.createElement('div')
  temp.innerHTML = html
  return nodeToMarkdown(temp)
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || ''
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const children = Array.from(el.childNodes).map(nodeToMarkdown).join('')

  switch (tag) {
    case 'h1':
      return `\n# ${children}\n`
    case 'h2':
      return `\n## ${children}\n`
    case 'h3':
      return `\n### ${children}\n`
    case 'p':
      return `\n${children}\n`
    case 'br':
      return '\n'
    case 'strong':
    case 'b':
      return `**${children}**`
    case 'em':
    case 'i':
      return `*${children}*`
    case 's':
    case 'strike':
      return `~~${children}~~`
    case 'code':
      return `\`${children}\``
    case 'pre':
      return `\n\`\`\`\n${children}\n\`\`\`\n`
    case 'a':
      return `[${children}](${el.getAttribute('href') || ''})`
    case 'img':
      return `![${el.getAttribute('alt') || ''}](${el.getAttribute('src') || ''})`
    case 'ul':
      return children
        .split('\n')
        .filter(Boolean)
        .map((line) => `- ${line}`)
        .join('\n') + '\n'
    case 'ol':
      return children
        .split('\n')
        .filter(Boolean)
        .map((line, i) => `${i + 1}. ${line}`)
        .join('\n') + '\n'
    case 'li':
      return `${children}\n`
    case 'blockquote':
      return children
        .split('\n')
        .filter(Boolean)
        .map((line) => `> ${line}`)
        .join('\n') + '\n'
    case 'hr':
      return '\n---\n'
    case 'div':
      // Handle callout and collapsible custom blocks
      const type = el.getAttribute('data-type')
      if (type === 'callout') {
        const emoji = el.getAttribute('data-emoji') || '💡'
        return `\n> ${emoji} ${children}\n`
      }
      if (type === 'collapsible') {
        const title = el.getAttribute('data-title') || 'Toggle'
        return `\n<details>\n<summary>${title}</summary>\n\n${children}\n</details>\n`
      }
      return children
    default:
      return children
  }
}

export function downloadMarkdown(filename: string, markdown: string) {
  const blob = new Blob([markdown], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
