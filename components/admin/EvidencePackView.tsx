"use client"

/**
 * The evidence pack, as a document somebody can read.
 *
 * WHY THIS EXISTS. The pack was already assembled, fingerprinted and honest about
 * its own limits — the chain recomputation, what each agent was told, a manifest
 * digesting every section, and a plain statement of what it does not prove. It
 * was available as `onecamp-evidence-pack.json` and nothing else. Nobody hands an
 * auditor a JSON file. The work of assembling the argument was done and then
 * delivered in the one form its reader cannot use.
 *
 * A READING, NOT A REPLACEMENT. The fingerprint is a digest of those exact JSON
 * bytes, so a printed page cannot be verified and must never look as though it
 * can. The document says which pack it is a reading of, keeps the verification
 * steps and the limits in full rather than summarising them, and puts the file
 * download next to the fingerprint it belongs to.
 *
 * GENERIC OVER SECTIONS on purpose. Sections are contributed by whichever
 * packages an edition links, so the AI-free build has fewer and a new subsystem
 * adds one without touching this file. The manifest is the index and it travels
 * inside the same document, so this renders what the pack says it contains rather
 * than what this component was written knowing about.
 */

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { CopyButton, middleEllipsis } from "@/components/ui/settingsControls"
import { Download, Info, ShieldCheck, ShieldAlert } from "@/lib/icons"
import type { EvidencePack, EvidenceManifestEntry } from "@/services/settingsService"

/** A section title a person reads, from an id a programmer wrote. */
export function sectionTitle(id: string): string {
    const words = id.replace(/[_-]+/g, " ").trim()
    if (!words) return "Section"
    return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The rows of a section, whatever shape it arrived in.
 *
 * A section is `unknown` by the time it reaches here. An array is rows; an object
 * is one row; anything else is a value worth showing rather than dropping. The
 * alternative — rendering only what typechecks — silently omits a contributed
 * section, which is the one failure an evidence document must not have.
 */
export function sectionRows(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) {
        return value.map((v) => (v !== null && typeof v === "object" ? (v as Record<string, unknown>) : { value: v }))
    }
    if (value !== null && typeof value === "object") return [value as Record<string, unknown>]
    if (value === null || value === undefined) return []
    return [{ value }]
}

/** Column order taken from the rows themselves, first seen first. */
export function sectionColumns(rows: Array<Record<string, unknown>>): string[] {
    const seen: string[] = []
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (!seen.includes(key)) seen.push(key)
        }
    }
    return seen
}

/** A cell, printable. Objects are shown as compact JSON rather than [object Object]. */
export function cellText(value: unknown): string {
    if (value === null || value === undefined) return ""
    if (typeof value === "object") return JSON.stringify(value)
    return String(value)
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-2xs font-medium text-ink-3">{label}</dt>
            <dd className="mt-1 min-w-0 break-words text-sm text-foreground">{value}</dd>
        </div>
    )
}

/**
 * A long digest on one line: "4dfe57e3…72dd554ee" on screen with copy, the
 * whole value in its title for a pointer and in print (people.css swaps the
 * short form for the full one under @media print, where nothing can be
 * hovered and a reader must be able to compare every character).
 */
export function Fingerprint({ value, label = "fingerprint", copy = true }: { value: string; label?: string; copy?: boolean }) {
    if (!value) return <span className="text-ink-3">none</span>
    return (
        <span data-fingerprint="" className="inline-flex min-w-0 items-center gap-1 ev-mono">
            <span className="ev-short truncate" title={value}>
                {middleEllipsis(value)}
            </span>
            <span className="ev-full">{value}</span>
            {copy && <CopyButton value={value} label={label} className="ev-print-hide" />}
        </span>
    )
}

/** An id as a column shows it: the first eight characters in mono, the whole in its title. */
function ShortId({ value }: { value: string }) {
    return (
        <span className="font-mono text-2xs" title={value}>
            <span className="ev-short">{value.slice(0, 8)}</span>
            <span className="ev-full">{value}</span>
        </span>
    )
}

/** Whether a value looks like an id or a digest: long, with no spaces. Pure. */
export function looksLikeId(v: unknown): v is string {
    return typeof v === "string" && v.length >= 20 && !/\s/.test(v) && /^[0-9a-zA-Z_:-]+$/.test(v)
}

/**
 * The columns a reader reads first (sequence, time, who, what, summary),
 * taken from whatever the section's rows carry; "All columns" shows the rest.
 * A section with none of these keeps its first five. Pure.
 */
export function readableColumns(columns: string[]): string[] {
    const want = [/^seq$/, /(^|_)(time|created_at|at|when|date)$/, /actor|^by$|user|email|agent_name/, /action|^event|kind|tool/, /summary|reason|message|description/]
    const picked: string[] = []
    for (const re of want) {
        const c = columns.find((x) => re.test(x) && !picked.includes(x))
        if (c) picked.push(c)
    }
    return picked.length >= 2 ? picked : columns.slice(0, 5)
}

function Cell({ value }: { value: unknown }) {
    if (looksLikeId(value)) return <ShortId value={value} />
    return <>{cellText(value)}</>
}

/** Field names (snake_case) in a sentence, set in mono. */
function withCode(text: string): React.ReactNode {
    return text.split(/(\b[a-z]+(?:_[a-z0-9]+)+\b)/g).map((part, i) =>
        /^[a-z]+(?:_[a-z0-9]+)+$/.test(part) ? (
            <code key={i} className="font-mono text-2xs text-foreground">
                {part}
            </code>
        ) : (
            part
        ),
    )
}

function SectionTable({ id, rows }: { id: string; rows: Array<Record<string, unknown>> }) {
    const [all, setAll] = useState(false)
    const columns = sectionColumns(rows)
    const readable = readableColumns(columns)
    const shown = all ? columns : readable
    const more = columns.length > readable.length
    return (
        <>
            <div className={all ? "mt-3 overflow-x-auto" : "mt-3"} data-ev-table={id}>
                <table className="ev-table" data-wide={all ? "true" : undefined}>
                    <thead>
                        <tr>
                            {shown.map((c) => (
                                <th key={c} scope="col">
                                    {sectionTitle(c)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={i}>
                                {shown.map((c) => (
                                    <td key={c} className={all ? undefined : "max-w-[18rem] truncate"}>
                                        <Cell value={row[c]} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {more && (
                <Button variant="ghost" size="xs" className="ev-print-hide mt-1 -ml-2" onClick={() => setAll((v) => !v)} aria-expanded={all}>
                    {all ? "Fewer columns" : `All columns (${columns.length})`}
                </Button>
            )}
        </>
    )
}

const EvidencePackView: React.FC<{
    pack: EvidencePack
    /** Saves the JSON the fingerprint belongs to. */
    onDownload?: () => void
}> = ({ pack, onDownload }) => {
    const v = pack.integrity.chain_verification
    const manifest: EvidenceManifestEntry[] = pack.integrity.manifest ?? []

    return (
        // A document: the doc measure (720), its title in doc-title. The page
        // frame above it carries the breadcrumb and Print; on paper only this.
        <article className="ev-doc mx-auto max-w-[720px] print:max-w-none">
            <header>
                <p className="text-xs font-medium text-ink-2">Evidence pack · {pack.pack.product || "OneCamp"}</p>
                <h2 className="mt-1 text-doc-title text-balance">What happened, when, by whom, and under which policy</h2>
                <dl data-ev-meta="" className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Meta label="Window" value={`${fmt(pack.pack.from)} to ${fmt(pack.pack.to)}`} />
                    <Meta label="Generated" value={fmt(pack.pack.generated_at)} />
                    <Meta label="Generated by" value={pack.pack.generated_by || "unknown"} />
                    <Meta label="Fingerprint" value={<Fingerprint value={pack.integrity.pack_fingerprint} label="pack fingerprint" />} />
                </dl>
            </header>

            {/* The verdict first. It is the one thing a reader came for. */}
            <section className="mt-10" aria-labelledby="ev-integrity">
                <h3 id="ev-integrity" className="sr-only">
                    Integrity
                </h3>
                {v ? (
                    <div data-ev-seal="" data-ok={v.ok ? "true" : "false"} className="ev-seal">
                        <span className="ev-seal-tile" aria-hidden="true">
                            {v.ok ? <ShieldCheck /> : <ShieldAlert />}
                        </span>
                        <div className="min-w-0">
                            <p className="text-title-3">{v.ok ? "Every entry verifies" : "The chain did not verify"}</p>
                            <p className="mt-0.5 text-sm text-ink-2">
                                {v.checked.toLocaleString("en")} row{v.checked === 1 ? "" : "s"} recomputed
                                {v.redacted ? `, ${v.redacted} taken at their word after redaction` : ""}
                                {v.partial ? ". A window was checked, not the whole log." : "."}
                            </p>
                            {!v.ok && <p className="mt-1 text-sm text-danger-ink">{v.message}</p>}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-ink-2">No chain verification travelled with this pack.</p>
                )}
            </section>

            {/* The manifest: a digest per section is what lets a reader check
                this document against the file without trusting either. */}
            <section className="ev-section mt-10">
                <h3 className="text-heading">Contents</h3>
                <table className="ev-table mt-3">
                    <thead>
                        <tr>
                            <th scope="col">Section</th>
                            <th scope="col">Rows</th>
                            <th scope="col" className="max-sm:hidden">Describes</th>
                            <th scope="col">SHA-256</th>
                        </tr>
                    </thead>
                    <tbody>
                        {manifest.map((m) => (
                            <tr key={m.section}>
                                <th scope="row" className="font-book">
                                    {sectionTitle(m.section)}
                                </th>
                                <td className="tabular-nums">{m.rows}</td>
                                <td className="text-ink-2 max-sm:hidden">{m.describes}</td>
                                <td>
                                    <Fingerprint value={m.sha256} label={`${sectionTitle(m.section)} digest`} copy={false} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            {/* Every section the pack declared, in the manifest's order. */}
            {manifest.map((m) => {
                const rows = sectionRows(pack.sections?.[m.section])
                return (
                    <section key={m.section} className="ev-section mt-10">
                        <h3 className="text-heading">{sectionTitle(m.section)}</h3>
                        <p className="mt-0.5 text-sm text-ink-2">{m.describes}</p>
                        {rows.length === 0 ? <p className="mt-3 text-sm text-ink-2">Nothing in this window.</p> : <SectionTable id={m.section} rows={rows} />}
                    </section>
                )
            })}

            {/* Verbatim, both of them. Summarising the steps would leave a reader
                trusting the summary, and softening the limits is the failure
                the limits exist to prevent. */}
            <section className="ev-section mt-10">
                <h3 className="text-heading">How to verify this</h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink-2">
                    {pack.how_to_verify?.map((step) => <li key={step}>{withCode(step)}</li>)}
                </ol>
            </section>

            <section data-ev-limits="" className="mt-8 rounded-xl bg-sunken p-4">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                    <Info className="size-4 text-ink-3" aria-hidden="true" />
                    What this does not prove
                </h3>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-ink-2">
                    {pack.limits?.map((limit) => <li key={limit}>{limit}</li>)}
                </ul>
            </section>

            <footer className="mt-10 text-sm text-ink-2">
                <p>
                    This page is a reading of pack <Fingerprint value={pack.integrity.pack_fingerprint} copy={false} />. The fingerprint is a digest
                    of the JSON, so verification is done against the file and not against this page or a print of it.
                </p>
                {onDownload && (
                    <Button variant="secondary" size="sm" className="ev-print-hide mt-4" onClick={onDownload}>
                        <Download aria-hidden="true" />
                        Download the file this reads
                    </Button>
                )}
            </footer>
        </article>
    )
}

/** Dates as a reader reads them, falling back to the raw value rather than "Invalid Date". */
function fmt(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso || "unknown"
    return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z")
}

export default EvidencePackView
