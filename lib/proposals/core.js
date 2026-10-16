// Edit proposals: the diff, the places and the apply (docs programme, PROGRAM.md
// §4 #19 and D-10; A9).
//
// ONE FILE, TWO PLACES. This file is byte for byte the web app's
// lib/proposals/core.js, and a test on each side pins its SHA-256: a reviewer who
// accepts a suggestion in their own editor, and one who accepts it from a list
// through the collaboration service, must leave the same document, so the two
// never run different code. Change it in both places, then both pins.
//
// WHAT A PROPOSAL IS, HERE. A target: a run of sibling blocks (a paragraph, some
// of a list's items, a section). The base: those blocks as they were when the
// change was proposed. The proposed blocks to put in their place. The difference
// is cut into hunks that a reviewer accepts one by one:
//   - a block hunk swaps, inserts or removes whole blocks;
//   - an inline hunk replaces a run of words inside one block, and keeps the
//     block itself: its id, the anchors of comments on the rest of its text, and
//     the caret of anyone typing there.
// A hunk is placed in the base by a path (child indices down from the target)
// and a range (child indices, or offsets into the block's text).
//
// APPLYING AFTER THE DOC MOVED ON. Each hunk also carries Yjs relative positions
// for its two ends, made when it was proposed. When the target is still exactly
// the base, every hunk lands where it was made. When it is not, each hunk is
// found by its own positions, wherever edits around it moved it, and applies only
// if what it replaces is still there, untouched. A hunk whose text was changed is
// a conflict, and can only be inserted below. Nothing is ever placed by a guess.
//
// It needs only ProseMirror and Yjs, so the browser and the service run it alike.

import { Fragment } from '@tiptap/pm/model'
import * as Y from 'yjs'

export const CORE_VERSION = 1

// Limits. A proposal past them is collapsed (one hunk for the whole target) or
// refused, never cut: a reviewer sees all of a change or none of it.
export const LIMITS = Object.freeze({
    blocks: 2000, // blocks in the base or the proposal, at every depth
    hunks: 300,
    diffCells: 4000000, // one diff's table: a block's words against the other's
})

// ---------------------------------------------------------------------------
// Equality that ignores what is not content
// ---------------------------------------------------------------------------

// A block's id names the block, it is not its content: a proposed paragraph
// that differs from the base only by having no id is the same paragraph.
const IDENTITY_ATTRS = new Set(['blockId'])

const plain = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v)

// canonAttrs keeps the attributes that say something: not identity, not null,
// not the schema's default (an older editor may not write a default the newer
// one does, and the two must still compare equal).
function canonAttrs(attrs, specs) {
    let out = null
    for (const name of Object.keys(attrs || {}).sort()) {
        if (IDENTITY_ATTRS.has(name)) continue
        const value = attrs[name]
        if (value === null || value === undefined) continue
        const spec = specs ? specs[name] : undefined
        if (spec && spec.hasDefault && plain(spec.default) === plain(value)) continue
        if (!out) out = {}
        out[name] = value
    }
    return out
}

function canonMarks(marks) {
    return marks
        .map((m) => {
            const a = canonAttrs(m.attrs, m.type.attrs)
            return JSON.stringify(a ? { t: m.type.name, a } : { t: m.type.name })
        })
        .sort()
}

function canon(node) {
    const out = { t: node.type.name }
    const a = canonAttrs(node.attrs, node.type.attrs)
    if (a) out.a = a
    if (node.marks.length) out.m = canonMarks(node.marks)
    if (node.isText) out.x = node.text
    else if (node.childCount) {
        out.c = []
        node.forEach((child) => out.c.push(canon(child)))
    }
    return out
}

// nodeKey is a node's content as a string: equal keys, equal content.
export const nodeKey = (node) => JSON.stringify(canon(node))

// nodesKey is a run of nodes' content as a string. Adjacent text with the same
// marks is one node in a fragment, so the key does not depend on how it was cut.
export const nodesKey = (nodes) => Fragment.fromArray(nodes).content.map(nodeKey).join('\n')

const attrsKey = (node) => JSON.stringify(canonAttrs(node.attrs, node.type.attrs))

// sameShape: two blocks whose insides can be compared, not just swapped: the
// same type and attributes, and room for content (a textblock or a container).
function sameShape(a, b) {
    return a.type === b.type && !a.isLeaf && attrsKey(a) === attrsKey(b)
}

export const childrenOf = (node) => {
    const out = []
    node.forEach((child) => out.push(child))
    return out
}

// ---------------------------------------------------------------------------
// The longest common subsequence, as runs
// ---------------------------------------------------------------------------

// diffRuns compares two arrays of strings and returns the runs that cover both,
// in order: { same, a0, a1, b0, b1 }. A same run is a[a0..a1) equal to b[b0..b1);
// a changed run is a[a0..a1) replaced by b[b0..b1). The common ends are cut off
// first; the rest is a longest common subsequence, walked the same way on every
// side so ties break alike. null when the table would pass LIMITS.diffCells.
export function diffRuns(a, b) {
    let start = 0
    while (start < a.length && start < b.length && a[start] === b[start]) start++
    let endA = a.length
    let endB = b.length
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--
        endB--
    }
    const n = endA - start
    const m = endB - start
    if (n * m > LIMITS.diffCells) return null
    // ops: '=' (one of each), '-' (one of a), '+' (one of b)
    const ops = []
    if (n > 0 && m > 0) {
        // L[i][j]: the common subsequence of a[start+i..endA) and b[start+j..endB).
        const w = m + 1
        const L = new Uint32Array((n + 1) * w)
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                L[i * w + j] = a[start + i] === b[start + j]
                    ? L[(i + 1) * w + j + 1] + 1
                    : Math.max(L[(i + 1) * w + j], L[i * w + j + 1])
            }
        }
        let i = 0
        let j = 0
        while (i < n && j < m) {
            if (a[start + i] === b[start + j]) {
                ops.push('=')
                i++
                j++
            } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) {
                ops.push('-')
                i++
            } else {
                ops.push('+')
                j++
            }
        }
        while (i++ < n) ops.push('-')
        while (j++ < m) ops.push('+')
    } else {
        for (let i = 0; i < n; i++) ops.push('-')
        for (let j = 0; j < m; j++) ops.push('+')
    }
    const runs = []
    const push = (same, da, db) => {
        const last = runs[runs.length - 1]
        if (last && last.same === same) {
            last.a1 += da
            last.b1 += db
        } else {
            const a0 = last ? last.a1 : 0
            const b0 = last ? last.b1 : 0
            runs.push({ same, a0, a1: a0 + da, b0, b1: b0 + db })
        }
    }
    if (start > 0) push(true, start, start)
    for (const op of ops) push(op === '=', op === '+' ? 0 : 1, op === '-' ? 0 : 1)
    if (endA < a.length) push(true, a.length - endA, b.length - endB)
    return runs
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

// A word, a run of spaces, or any one other character. Built at run time so the
// pattern is not checked against an older language target.
const WORD = new RegExp("[\\p{L}\\p{N}\\p{M}_'’]+|\\s+|[^]", 'gu')
const SPACE = /^\s+$/

// wordsOf cuts text into those tokens, in order; joined, they are the text. A
// suggestion's words here, and a version's in the doc history's word diff, so
// the two mark the same edit alike.
export const wordsOf = (text) => text.match(WORD) || []

// tokensOf cuts a textblock's content into words, spaces and punctuation, each
// with its marks, and inline nodes (a mention, a line break) as one token each.
function tokensOf(block) {
    const out = []
    block.forEach((child) => {
        if (child.isText) {
            const marks = child.marks.length ? JSON.stringify(canonMarks(child.marks)) : ''
            for (const word of wordsOf(child.text)) {
                out.push({ key: 't' + marks + '\u0001' + word, size: word.length, text: word, marks: child.marks, node: null })
            }
        } else {
            out.push({ key: 'n' + nodeKey(child), size: child.nodeSize, text: null, marks: null, node: child })
        }
    })
    return out
}

function tokensToNodes(schema, tokens) {
    const nodes = []
    for (const t of tokens) {
        if (t.node) nodes.push(t.node)
        else nodes.push(schema.text(t.text, t.marks))
    }
    return Fragment.fromArray(nodes).content
}

const toJSONArray = (nodes) => nodes.map((n) => n.toJSON())

// ---------------------------------------------------------------------------
// The hunks
// ---------------------------------------------------------------------------

function blockHunk(out, path, from, to, before, after) {
    out.push({
        op: before.length === 0 ? 'insert' : after.length === 0 ? 'delete' : 'replace',
        level: 'block',
        path,
        from,
        to,
        before: toJSONArray(before),
        after: toJSONArray(after),
    })
}

// inlineHunks adds the word-level hunks turning textblock x into y. false when
// the blocks are too long to compare word by word (the caller swaps them whole).
function inlineHunks(out, path, x, y) {
    const ta = tokensOf(x)
    const tb = tokensOf(y)
    const runs = diffRuns(ta.map((t) => t.key), tb.map((t) => t.key))
    if (!runs) return false
    // Changes parted only by spaces read as one change ("very good" to "really
    // great"), so they are one hunk.
    const merged = []
    for (const r of runs) {
        const last = merged[merged.length - 1]
        const prev = merged[merged.length - 2]
        if (!r.same && last && last.same && prev && !prev.same && ta.slice(last.a0, last.a1).every((t) => t.text !== null && SPACE.test(t.text))) {
            merged.pop()
            prev.a1 = r.a1
            prev.b1 = r.b1
            continue
        }
        merged.push({ ...r })
    }
    const offsets = [0]
    for (const t of ta) offsets.push(offsets[offsets.length - 1] + t.size)
    const schema = x.type.schema
    for (const r of merged) {
        if (r.same) continue
        out.push({
            op: r.a0 === r.a1 ? 'insert' : r.b0 === r.b1 ? 'delete' : 'replace',
            level: 'inline',
            path,
            from: offsets[r.a0],
            to: offsets[r.a1],
            before: toJSONArray(tokensToNodes(schema, ta.slice(r.a0, r.a1))),
            after: toJSONArray(tokensToNodes(schema, tb.slice(r.b0, r.b1))),
        })
    }
    return true
}

// blockHunks adds the hunks turning the blocks base into proposed. Blocks equal
// in both are kept. Between them, a block of the same shape on each side is
// compared inside (words for a textblock, blocks for a container), and the rest
// is swapped whole.
function blockHunks(out, path, base, proposed) {
    const runs = diffRuns(base.map(nodeKey), proposed.map(nodeKey))
    if (!runs) {
        blockHunk(out, path, 0, base.length, base, proposed)
        return
    }
    for (const r of runs) {
        if (r.same) continue
        let i = r.a0
        let j = r.b0
        let pa = i
        let pb = j
        while (i < r.a1 && j < r.b1) {
            const x = base[i]
            const y = proposed[j]
            if (sameShape(x, y)) {
                if (i > pa || j > pb) blockHunk(out, path, pa, i, base.slice(pa, i), proposed.slice(pb, j))
                const inside = path.concat(i)
                if (x.isTextblock) {
                    if (!inlineHunks(out, inside, x, y)) blockHunk(out, path, i, i + 1, [x], [y])
                } else {
                    blockHunks(out, inside, childrenOf(x), childrenOf(y))
                }
                i++
                j++
                pa = i
                pb = j
            } else {
                i++
                j++
            }
        }
        if (r.a1 > pa || r.b1 > pb) blockHunk(out, path, pa, r.a1, base.slice(pa, r.a1), proposed.slice(pb, r.b1))
    }
}

const countBlocks = (nodes) => nodes.reduce((n, node) => n + (node.isBlock ? 1 + countBlocks(childrenOf(node)) : 0), 0)

// diffBlocks is the hunks turning base into proposed (arrays of nodes), in
// document order, with ids h1, h2, ... A diff with more than LIMITS.hunks hunks
// is collapsed into one that swaps the whole target. Throws past LIMITS.blocks.
export function diffBlocks(base, proposed) {
    if (countBlocks(base) > LIMITS.blocks || countBlocks(proposed) > LIMITS.blocks) {
        throw Object.assign(new Error('too large to propose at once'), { status: 413 })
    }
    let out = []
    blockHunks(out, [], base, proposed)
    if (out.length > LIMITS.hunks) {
        out = []
        blockHunk(out, [], 0, base.length, base, proposed)
    }
    return out.map((h, i) => ({ id: `h${i + 1}`, ...h }))
}

export const nodesFromJSON = (schema, json) => (Array.isArray(json) ? json.map((n) => schema.nodeFromJSON(n)) : [])

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

// targetForRange is the run of sibling blocks a change between from and to sits
// in: the textblock around a selection inside one, else the blocks a selection
// spans in their shared parent. { from, to } are positions before and after it.
export function targetForRange(doc, from, to) {
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    const range = $from.blockRange($to)
    if (!range) return { from: 0, to: doc.content.size }
    return { from: range.start, to: range.end }
}

// siblingsBetween is the blocks between from and to when they are whole siblings
// in one parent, else null.
export function siblingsBetween(doc, from, to) {
    if (from < 0 || to > doc.content.size || from > to) return null
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    if ($from.depth !== $to.depth || !$from.sameParent($to) || $from.parent.inlineContent) return null
    if ($from.textOffset !== 0 || $to.textOffset !== 0) return null
    const out = []
    for (let i = $from.index(); i < $to.index(); i++) out.push($from.parent.child(i))
    return out
}

// proposalFromReplacement is what replacing from..to with slice proposes, as a
// target and its blocks before and after: an AI rewrite of a selection, a line
// typed in suggesting mode. The replacement runs on a scratch transform the
// caller passes (new Transform(doc)), so the doc itself is left alone.
export function proposalFromReplacement(scratch, from, to, slice) {
    const doc = scratch.doc
    let target = targetForRange(doc, from, to)
    scratch.replace(from, to, slice)
    for (;;) {
        const base = siblingsBetween(doc, target.from, target.to)
        const newFrom = scratch.mapping.map(target.from, -1)
        const newTo = scratch.mapping.map(target.to, 1)
        const proposed = siblingsBetween(scratch.doc, newFrom, newTo)
        if (base && proposed) return { target, base, proposed }
        // The change reached past the target's parent: take the parent's run.
        const $from = doc.resolve(target.from)
        if ($from.depth === 0) return { target: { from: 0, to: doc.content.size }, base: childrenOf(doc), proposed: childrenOf(scratch.doc) }
        target = { from: $from.before(), to: doc.resolve(target.to).after() }
    }
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

// placeIn is a hunk's place, as document positions, when the blocks at start are
// laid out as `nodes` (the base, or the target as it is now when it equals the
// base).
export function placeIn(start, nodes, hunk) {
    let pos = start
    let level = nodes
    for (let d = 0; d < hunk.path.length; d++) {
        const idx = hunk.path[d]
        if (idx < 0 || idx >= level.length) return null
        for (let i = 0; i < idx; i++) pos += level[i].nodeSize
        pos += 1
        const node = level[idx]
        if (d === hunk.path.length - 1 && hunk.level === 'inline') {
            if (!node.isTextblock || hunk.from < 0 || hunk.from > hunk.to || hunk.to > node.content.size) return null
            return { from: pos + hunk.from, to: pos + hunk.to }
        }
        level = childrenOf(node)
    }
    if (hunk.level === 'inline' || hunk.from < 0 || hunk.from > hunk.to || hunk.to > level.length) return null
    let from = pos
    for (let i = 0; i < hunk.from; i++) from += level[i].nodeSize
    let to = from
    for (let i = hunk.from; i < hunk.to; i++) to += level[i].nodeSize
    return { from, to }
}

// contentAt is what lies between from and to: whole sibling blocks for a block
// hunk, a textblock's inline run for an inline one. null when the place is not
// that kind of place.
function contentAt(doc, from, to, level) {
    if (from < 0 || to > doc.content.size || from > to) return null
    const $from = doc.resolve(from)
    const $to = doc.resolve(to)
    if (!$from.sameParent($to)) return null
    if (level === 'inline') {
        if (!$from.parent.isTextblock) return null
        const out = []
        $from.parent.content.cut($from.parentOffset, $to.parentOffset).forEach((n) => out.push(n))
        return out
    }
    return siblingsBetween(doc, from, to)
}

// checkPlace says whether a hunk can apply at a place: what it replaces is still
// there exactly, and what it brings fits where it goes.
export function checkPlace(doc, place, hunk) {
    if (!place) return false
    const schema = doc.type.schema
    const here = contentAt(doc, place.from, place.to, hunk.level)
    if (!here) return false
    let before
    let after
    try {
        before = nodesFromJSON(schema, hunk.before)
        after = nodesFromJSON(schema, hunk.after)
    } catch {
        return false
    }
    if (nodesKey(here) !== nodesKey(before)) return false
    const $from = doc.resolve(place.from)
    const $to = doc.resolve(place.to)
    const parent = $from.parent
    if (hunk.level === 'inline') {
        return after.every((n) => n.isInline && parent.type.contentMatch.matchType(n.type) !== null &&
            n.marks.every((m) => parent.type.allowsMarkType(m.type)))
    }
    return after.every((n) => n.isBlock) && parent.canReplace($from.index(), $to.index(), Fragment.fromArray(after))
}

// validHunks says whether hunks fit the base they claim to change: each place
// exists, what it says it replaces is what the base has there, and no two
// overlap. A proposal sent by a client is checked with it before anything trusts
// its hunks.
export function validHunks(base, hunks) {
    if (!Array.isArray(hunks) || hunks.length > LIMITS.hunks) return false
    if (base.length === 0 && hunks.some((h) => h.level !== 'block' || h.path.length > 0)) return false
    const schema = base.length ? base[0].type.schema : null
    const ids = new Set()
    const spans = []
    for (const h of hunks) {
        if (!h || typeof h.id !== 'string' || ids.has(h.id) || !Array.isArray(h.path)) return false
        ids.add(h.id)
        if (h.level !== 'block' && h.level !== 'inline') return false
        if (!schema) {
            spans.push([0, 0])
            continue
        }
        // Lay the base out from 0 and check the hunk against it.
        const scratch = schema.topNodeType.create(null, base)
        const place = placeIn(0, base, h)
        if (!place) return false
        const here = contentAt(scratch, place.from, place.to, h.level)
        let before
        try {
            before = nodesFromJSON(schema, h.before)
            nodesFromJSON(schema, h.after)
        } catch {
            return false
        }
        if (!here || nodesKey(here) !== nodesKey(before)) return false
        spans.push([place.from, place.to])
    }
    spans.sort((x, y) => x[0] - y[0] || x[1] - y[1])
    for (let i = 1; i < spans.length; i++) {
        const [a0, a1] = spans[i - 1]
        const [b0, b1] = spans[i]
        // Two insertions at one point, or ranges that cross, cannot both apply.
        if (b0 < a1 || (a0 === a1 && b0 === b1 && a0 === b0)) return false
    }
    return true
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

// applyPlaced applies the placed hunks to a transform, in one go: from the end
// of the doc backwards, so each place is still where it was found.
export function applyPlaced(tr, placed) {
    const schema = tr.doc.type.schema
    const ordered = [...placed].sort((x, y) => y.from - x.from || y.to - x.to)
    for (const p of ordered) {
        tr.replaceWith(p.from, p.to, Fragment.fromArray(nodesFromJSON(schema, p.hunk.after)))
    }
    return tr
}

// insertBelowAt is where "Insert below" puts the proposed blocks: after the
// target, else at `fallback` (the target's old place, or the end of the doc),
// climbing out of any parent that cannot hold them.
export function insertBelowAt(doc, pos, nodes) {
    const frag = Fragment.fromArray(nodes)
    let $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
    // Out of a textblock first: a block goes between blocks.
    while ($pos.parent.inlineContent && $pos.depth > 0) $pos = doc.resolve($pos.after())
    for (;;) {
        if ($pos.parent.canReplace($pos.index(), $pos.index(), frag)) return $pos.pos
        if ($pos.depth === 0) return null
        $pos = doc.resolve($pos.after())
    }
}

// insertBelow puts the proposed blocks below the target, as new blocks.
export function insertBelow(tr, pos, proposedJSON) {
    const nodes = nodesFromJSON(tr.doc.type.schema, proposedJSON)
    if (nodes.length === 0) return null
    const at = insertBelowAt(tr.doc, pos, nodes)
    if (at === null) return null
    tr.insert(at, Fragment.fromArray(nodes))
    return at
}

// ---------------------------------------------------------------------------
// Yjs positions
// ---------------------------------------------------------------------------
//
// A place is kept as two Yjs relative positions, which follow the text they sit
// beside through everyone's edits. `mapping` is the ProseMirror binding's map
// from Yjs types to nodes (y-prosemirror's binding.mapping, or initProseMirrorDoc's
// on the server); `fragment` is the doc's Y.XmlFragment.

const b64encode = (bytes) => {
    let s = ''
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}
const b64decode = (s) => {
    const raw = atob(s)
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
}

function yParentAt(fragment, $pos) {
    let type = fragment
    for (let d = 0; d < $pos.depth; d++) {
        type = type.get($pos.index(d))
        if (!type) return null
    }
    return type
}

const ySize = (type, mapping) => {
    if (type instanceof Y.XmlText) return type.length
    const node = mapping ? mapping.get(type) : null
    return node ? node.nodeSize : 1
}

// relativeAt is the relative position of doc position pos. assoc < 0 keeps it
// beside what is before it (the end of a range: text typed there stays out),
// assoc >= 0 beside what is after it (the start of a range). null when the doc
// and the Yjs types do not line up.
export function relativeAt(fragment, doc, pos, assoc) {
    const $pos = doc.resolve(pos)
    const parent = yParentAt(fragment, $pos)
    if (!parent) return null
    if (!$pos.parent.inlineContent) {
        return Y.createRelativePositionFromTypeIndex(parent, $pos.index(), assoc)
    }
    // Inside a textblock: its Yjs children are text runs and inline nodes.
    let rest = $pos.parentOffset
    const kids = parent.toArray()
    for (let k = 0; k < kids.length; k++) {
        const kid = kids[k]
        if (kid instanceof Y.XmlText) {
            const len = kid.length
            if (rest < len || (rest === len && (assoc < 0 || k === kids.length - 1))) {
                return Y.createRelativePositionFromTypeIndex(kid, rest, assoc)
            }
            rest -= len
        } else {
            if (rest === 0) return Y.createRelativePositionFromTypeIndex(parent, k, assoc)
            rest -= ySize(kid, null)
        }
    }
    return Y.createRelativePositionFromTypeIndex(parent, kids.length, assoc)
}

export const encodeRelative = (rel) => (rel ? b64encode(Y.encodeRelativePosition(rel)) : '')

const deletedOrOutside = (type, fragment) => {
    for (let t = type; t !== fragment; ) {
        if (!t._item || t._item.deleted) return true
        t = t._item.parent
    }
    return false
}

// resolveRelative is the doc position an encoded relative position stands at
// now, or null when what it was beside is gone with its parent, or belongs to
// another copy of the doc.
export function resolveRelative(ydoc, fragment, mapping, encoded) {
    if (typeof encoded !== 'string' || encoded === '') return null
    let abs
    try {
        abs = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(b64decode(encoded)), ydoc)
    } catch {
        return null
    }
    if (!abs) return null
    let type = abs.type
    if (deletedOrOutside(type, fragment)) return null
    let pos = 0
    if (type instanceof Y.XmlText) {
        pos = abs.index
    } else {
        let n = type._first
        let i = 0
        while (i < type._length && i < abs.index && n !== null) {
            if (!n.deleted && n.countable) {
                i++
                pos += ySize(n.content.type, mapping)
            }
            n = n.right
        }
        pos += 1
    }
    while (type !== fragment) {
        const parent = type._item.parent
        pos += 1
        for (let n = parent._first; n !== null; n = n.right) {
            const t = n.content.type
            if (t === type) break
            if (!n.deleted && n.countable) pos += ySize(t, mapping)
        }
        type = parent
    }
    return pos - 1
}

// encodePlaces gives each hunk the relative positions of its two ends, made
// against the live doc while the target at `start` is still the base.
export function encodePlaces(fragment, doc, start, base, hunks) {
    return hunks.map((h) => {
        const place = placeIn(start, base, h)
        if (!place) return { ...h }
        const empty = place.from === place.to
        return {
            ...h,
            start: encodeRelative(relativeAt(fragment, doc, place.from, empty ? -1 : 0)),
            end: encodeRelative(relativeAt(fragment, doc, place.to, -1)),
        }
    })
}

// encodeTarget is the anchor's two positions for a target: its first block (or,
// for an empty target, the point it sits at) and its end.
export function encodeTarget(fragment, doc, target) {
    const empty = target.from === target.to
    return {
        start: encodeRelative(relativeAt(fragment, doc, target.from, empty ? -1 : 0)),
        end: encodeRelative(relativeAt(fragment, doc, target.to, -1)),
    }
}

// ---------------------------------------------------------------------------
// Locate: where each hunk applies in the doc as it is now
// ---------------------------------------------------------------------------

// locate places a proposal's hunks in doc. `range` is the target's place now,
// from its anchor (null when the anchor is lost). `resolve(encoded)` turns a
// hunk's relative position into a doc position (resolveRelative, bound to the
// live doc), or is null where there is no Yjs (a composer that is not shared).
// Returns { exact, placed: [{ hunk, from, to }], conflicts: [id] }.
export function locate(doc, range, baseJSON, hunks, ids, resolve) {
    const schema = doc.type.schema
    const want = ids && ids.length ? new Set(ids) : null
    const chosen = hunks.filter((h) => !want || want.has(h.id))
    let base
    try {
        base = nodesFromJSON(schema, baseJSON)
    } catch {
        return { exact: false, placed: [], conflicts: chosen.map((h) => h.id) }
    }
    const current = range ? siblingsBetween(doc, range.from, range.to) : null
    const exact = !!current && nodesKey(current) === nodesKey(base)
    const placed = []
    const conflicts = []
    for (const h of chosen) {
        let place = null
        if (exact) place = placeIn(range.from, current, h)
        else if (resolve && h.start && h.end) {
            const from = resolve(h.start)
            const to = resolve(h.end)
            if (from !== null && to !== null && from <= to) place = { from, to }
        }
        if (place && checkPlace(doc, place, h)) placed.push({ hunk: h, from: place.from, to: place.to })
        else conflicts.push(h.id)
    }
    return { exact, placed, conflicts }
}
