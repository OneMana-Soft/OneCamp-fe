/**
 * The codec's HTML escaping, the same as the API's: in text & < > and the
 * no-break space; in attribute values only & and ". The collaboration
 * service's DOM (happy-dom) decodes no other reference inside an attribute,
 * so a "&#10;" there would come back as those five characters; a raw line
 * break, < or > inside a quoted value is valid HTML and reads back as itself.
 */

const NBSP = String.fromCharCode(0xa0)

export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split(NBSP).join('&nbsp;')
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}
