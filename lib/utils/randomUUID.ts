// A v4 UUID (crypto.randomUUID needs a secure context; plain http isn't one).
export function randomUUID(): string {
  const r = crypto.getRandomValues(new Uint8Array(31))
  let i = 0
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (r[i++] & (15 >> (+c / 4)))).toString(16))
}
