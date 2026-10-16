import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { patchCached } from "@/lib/swrMutate"
import type { EditProposal, ProposalAuthorKind, ProposalHunk } from "@/lib/proposals/types"
import type { Anchor } from "@/lib/anchors/types"
import type { JSONContent } from "@tiptap/core"

// Edit proposals on the server (business/Proposal; docs programme A9). A
// proposal made here is stored with its hunks; accepting one either applies it
// on the server through the live doc (apply: "server", for a list or the phone)
// or is recorded for the reviewer's own editor, which applies it so their ⌘Z
// undoes it (apply: "client").
//
// The paths live here until the integrator moves them into services/endPoints.ts
// (an append-only file, edited at merge).

export const PROPOSALS_URL = "/proposals"

export const proposalsListUrl = (docId: string, kind = "doc") =>
    docId ? `${PROPOSALS_URL}?resource_kind=${encodeURIComponent(kind)}&resource_uuid=${encodeURIComponent(docId)}` : ""

export interface NewProposal {
    resource_kind: string
    resource_uuid: string
    thread_id?: string
    anchor: Anchor
    base_hash: string
    base: JSONContent[]
    proposed: JSONContent[]
    hunks: ProposalHunk[]
    note?: string
    /** "ai" for an AI rewrite kept for later; the server decides everything else. */
    author_kind?: ProposalAuthorKind
}

export interface DecideInput {
    accept: boolean
    hunk_ids?: string[]
    apply?: "server" | "client"
    insert_below?: boolean
}

/** The ids of the changes whose text moved on, from a 409. */
export function conflictsOf(error: unknown): string[] | null {
    const res = (error as { response?: { status?: number; data?: { conflicts?: unknown } } })?.response
    if (res?.status !== 409 || !Array.isArray(res.data?.conflicts)) return null
    return res.data.conflicts.filter((x): x is string => typeof x === "string")
}

// Every write patches the doc's list in place (I18), so an open panel shows the
// change without a refetch, and never a list keyed by position.
function remember(p: EditProposal) {
    patchCached<{ data?: { proposals?: EditProposal[] } }>(proposalsListUrl(p.resource_uuid, p.resource_kind), (cached) => {
        const list = cached?.data?.proposals ?? []
        const next = list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...list]
        return { ...cached, data: { ...cached?.data, proposals: next } }
    })
    return p
}

export async function createProposal(input: NewProposal): Promise<EditProposal> {
    const res = await axiosInstance.post<{ data: EditProposal }>(PROPOSALS_URL, input)
    return remember(res.data.data)
}

export async function decideProposal(id: string, input: DecideInput): Promise<EditProposal> {
    const res = await axiosInstance.post<{ data: EditProposal }>(`${PROPOSALS_URL}/${id}/decide`, input, { suppressErrorToast: true })
    return remember(res.data.data)
}

export async function withdrawProposal(id: string): Promise<EditProposal> {
    const res = await axiosInstance.post<{ data: EditProposal }>(`${PROPOSALS_URL}/${id}/withdraw`, {})
    return remember(res.data.data)
}

export async function reopenProposal(id: string, hunkIds: string[]): Promise<EditProposal> {
    const res = await axiosInstance.post<{ data: EditProposal }>(`${PROPOSALS_URL}/${id}/reopen`, { hunk_ids: hunkIds })
    return remember(res.data.data)
}

/** A doc's proposals, open ones first, then the latest decided. */
export function useDocProposals(docId: string) {
    const { data, isError, isLoading, mutate } = useFetch<{ data?: { proposals?: EditProposal[] } }>(proposalsListUrl(docId))
    // An error is an error, never an empty list (I19).
    return { proposals: data?.data?.proposals ?? [], isError: !!isError, isLoading, mutate }
}
