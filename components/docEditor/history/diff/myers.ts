/**
 * Myers' diff (O((N+M)·D)) over two sequences of strings: the shortest list
 * of keeps, removes and adds that turns `a` into `b`. Versions differ in few
 * places, so D is small and this stays fast on long docs. Past `maxD`
 * differences it gives up and returns null: the caller treats the stretch as
 * replaced whole, which is what a reader sees anyway.
 */

export type Op = { kind: "same"; a: number; b: number } | { kind: "del"; a: number } | { kind: "ins"; b: number }

export function myers(a: readonly string[], b: readonly string[], maxD = 2000): Op[] | null {
  // Common ends first: most edits sit in the middle of a long doc.
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const A = a.slice(head, a.length - tail)
  const B = b.slice(head, b.length - tail)
  const mid = core(A, B, maxD)
  if (!mid) return null
  const out: Op[] = []
  for (let i = 0; i < head; i++) out.push({ kind: "same", a: i, b: i })
  for (const op of mid) {
    if (op.kind === "same") out.push({ kind: "same", a: op.a + head, b: op.b + head })
    else if (op.kind === "del") out.push({ kind: "del", a: op.a + head })
    else out.push({ kind: "ins", b: op.b + head })
  }
  for (let k = tail; k > 0; k--) out.push({ kind: "same", a: a.length - k, b: b.length - k })
  return out
}

function core(a: readonly string[], b: readonly string[], maxD: number): Op[] | null {
  const n = a.length
  const m = b.length
  if (n === 0) return b.map((_, j) => ({ kind: "ins" as const, b: j }))
  if (m === 0) return a.map((_, i) => ({ kind: "del" as const, a: i }))
  const max = Math.min(n + m, maxD)
  const offset = max + 1
  let v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  for (let d = 0; d <= max; d++) {
    // Only the band this step reads back: memory grows with D², not D·N.
    trace.push(v.slice(offset - d - 1, offset + d + 2))
    const next = v
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      next[offset + k] = x
      if (x >= n && y >= m) return backtrack(trace, a.length, b.length, d)
    }
    v = next
  }
  return null
}

function backtrack(trace: Int32Array[], n: number, m: number, dEnd: number): Op[] {
  const ops: Op[] = []
  let x = n
  let y = m
  for (let d = dEnd; d > 0; d--) {
    const band = trace[d]
    const at = (kk: number) => band[kk + d + 1]
    const k = x - y
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1
    const prevX = at(prevK)
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) ops.push({ kind: "same", a: --x, b: --y })
    if (x === prevX) ops.push({ kind: "ins", b: --y })
    else ops.push({ kind: "del", a: --x })
  }
  while (x > 0 && y > 0) ops.push({ kind: "same", a: --x, b: --y })
  return ops.reverse()
}
