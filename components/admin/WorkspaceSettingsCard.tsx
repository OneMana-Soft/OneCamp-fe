"use client"

// WorkspaceSettingsCard: the operational settings that once needed an env
// file and a redeploy, the per-file upload limit and the sign-up allow-list.
// DB-first with env fallback; changes apply without a restart.
//
// Design v3 (admin A7, mock M1): a batched card. Its footer says what saving
// does and holds Save, always drawn so the card never changes height while
// you type. The upload size is a number with its unit inside the field; the
// allow-list is chips, each one checked as it is made, and a public domain
// is refused under the field before a request is sent.

import { useId, useRef, useState } from "react"
import { SettingRow, SettingsCard, SettingsCardError, SettingsCardFooter, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { NumberUnitInput } from "@/components/ui/settingsControls"
import { ChevronDown } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { updateWorkspaceSettings, useWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"
import { appMutate as globalMutate } from "@/lib/swrMutate"
import { serverMessage } from "@/lib/http/serverMessage"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { AllowListChipInput } from "@/components/admin/AllowListChipInput"
import { PUBLIC_DOMAIN_LINE, entryProblem, isPublicDomain } from "@/components/admin/allowListEntries"

/** Where a value comes from, when that is worth saying after its help. */
const SOURCE: Record<string, string> = {
    env: "Set in the server's environment file; saving here overrides it.",
}

type Draft = { uploadLimit: string; allowedUsers: string[] }

const draftOf = (s: WorkspaceSettings): Draft => ({
    uploadLimit: String(s.upload_limit_mb),
    allowedUsers: s.allowed_users ?? [],
})
const sameList = (a: string[], b: string[]) => a.join(",") === b.join(",")

export default function WorkspaceSettingsCard() {
    // One read of the workspace's settings, shared with the read receipts,
    // guest access and email cards: four requests became one, and a save here
    // reaches the others.
    const { settings, isLoading, isError, mutate } = useWorkspaceSettings()
    // The person's edits over the server's answer; null while they have none,
    // so the form follows the server until somebody types.
    const [edits, setEdits] = useState<Draft | null>(null)
    const [saving, setSaving] = useState(false)
    // Said under the field it is about, not in a toast that leaves with the error.
    const [sizeError, setSizeError] = useState("")
    // Why the server wouldn't save the allow-list, in its own words.
    const [accessRefusal, setAccessRefusal] = useState("")
    const [howOpen, setHowOpen] = useState(false)
    const howId = useId()
    const sizeRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLInputElement>(null)

    const saved = settings ? draftOf(settings) : null
    const draft: Draft = edits ?? saved ?? { uploadLimit: "", allowedUsers: [] }
    const sizeChanged = !!saved && draft.uploadLimit !== saved.uploadLimit
    const listChanged = !!saved && !sameList(draft.allowedUsers, saved.allowedUsers)
    const dirty = sizeChanged || listChanged
    const edit = (patch: Partial<Draft>) => setEdits({ ...draft, ...patch })
    // Entries the list can't hold: Save waits until they are gone.
    const refused = draft.allowedUsers.filter((e) => entryProblem(e))
    const hasPublic = draft.allowedUsers.some(isPublicDomain)
    // What a save answered goes into the shared read, so every card shows it.
    const store = (s: WorkspaceSettings) => mutate({ data: s }, { revalidate: false })

    const reset = () => {
        setEdits(null)
        setSizeError("")
        setAccessRefusal("")
    }

    const save = async () => {
        if (!saved) return
        if (sizeChanged) {
            const n = Number(draft.uploadLimit)
            if (!Number.isInteger(n) || n < 1) {
                setSizeError("Enter a whole number of 1 MB or more.")
                sizeRef.current?.focus()
                return
            }
        }
        if (refused.length) {
            listRef.current?.focus()
            return
        }
        setSaving(true)
        try {
            if (sizeChanged) {
                try {
                    const s = await updateWorkspaceSettings({ upload_limit_mb: Number(draft.uploadLimit) }, { ownErrors: true })
                    if (s) await store(s)
                    // Bust the client-config cache so composers pick up the new limit.
                    globalMutate("client-config")
                } catch (e) {
                    setSizeError(apiErrorMessage(e, "Couldn't save the size. Try again."))
                    sizeRef.current?.focus()
                    return
                }
            }
            if (listChanged) {
                try {
                    const s = await updateWorkspaceSettings({ allowed_users: draft.allowedUsers }, { ownErrors: true })
                    if (s) await store(s)
                } catch (err) {
                    setAccessRefusal(serverMessage(err, "Couldn't save the allow-list. Try again."))
                    listRef.current?.focus()
                    return
                }
            }
            // Saved: the form follows the server's answer again (the list as
            // the server wrote it back). The card's ring settles; a routine
            // save needs no toast.
            setEdits(null)
        } finally {
            setSaving(false)
        }
    }

    let body: React.ReactNode
    if (isError || (!isLoading && !settings)) {
        // No form at all: the fields would be empty, and saving an empty
        // allow-list over a failed read made the workspace invite-only.
        body = (
            <SettingsCard>
                <SettingsCardError what="the workspace settings" onRetry={() => void mutate()} />
            </SettingsCard>
        )
    } else if (!settings) {
        body = (
            <SettingsCard aria-label="Loading the workspace settings">
                <SettingsRowsSkeleton rows={2} control="field" />
            </SettingsCard>
        )
    } else {
        const listError = accessRefusal || (hasPublic ? PUBLIC_DOMAIN_LINE : "")
        body = (
            <SettingsCard
                dirty={dirty}
                footer={
                    <SettingsCardFooter
                        hint="Applies as soon as it's saved, no restart."
                        dirty={dirty}
                        saving={saving}
                        onSave={() => void save()}
                        onReset={reset}
                        saveDisabled={refused.length > 0}
                    />
                }
            >
                <SettingRow
                    label="Largest file a member can upload"
                    description={<>Bigger files are refused before they upload. {SOURCE[settings.upload_limit_source] ?? ""}</>}
                    controlId="upload-limit"
                >
                    <NumberUnitInput
                        ref={sizeRef}
                        id="upload-limit"
                        name="upload-limit"
                        unit="MB"
                        min={1}
                        value={draft.uploadLimit}
                        onChange={(e) => {
                            edit({ uploadLimit: e.target.value })
                            setSizeError("")
                        }}
                        invalid={!!sizeError}
                        aria-describedby={sizeError ? "upload-limit-error upload-limit-desc" : "upload-limit-desc"}
                    />
                </SettingRow>
                {sizeError && (
                    <p id="upload-limit-error" role="alert" className="-mt-2 px-4 pb-3 text-xs text-danger-ink">
                        {sizeError}
                    </p>
                )}
                <SettingRow
                    layout="stacked"
                    label="Who can join without an invitation"
                    description={<>People with these addresses can sign in with Google or GitHub. {SOURCE[settings.allowed_users_source] ?? ""}</>}
                    controlId="allowed-users"
                >
                    <AllowListChipInput
                        id="allowed-users"
                        inputRef={listRef}
                        value={draft.allowedUsers}
                        onChange={(next) => {
                            edit({ allowedUsers: next })
                            setAccessRefusal("")
                        }}
                        invalid={!!accessRefusal}
                        describedBy={["allowed-users-desc", listError && "allowed-users-refusal", howOpen && howId].filter(Boolean).join(" ")}
                    />
                    {listError && (
                        <p id="allowed-users-refusal" role="alert" className="mt-2 text-xs text-danger-ink text-pretty">
                            {listError}
                        </p>
                    )}
                    {/* The three lines of help this replaced, one press away. */}
                    <button
                        type="button"
                        aria-expanded={howOpen}
                        aria-controls={howId}
                        onClick={() => setHowOpen((o) => !o)}
                        className="mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                        How this works
                        <ChevronDown className={cn("size-3.5 transition-transform duration-150", howOpen && "rotate-180")} aria-hidden="true" />
                    </button>
                    {howOpen && (
                        <p id={howId} className="cfg-reveal mt-1.5 max-w-[60ch] text-xs text-muted-foreground text-pretty">
                            Empty means invitation only. A listed address joins by signing in with Google or GitHub. A
                            domain like @example.com admits a Google Workspace account that example.com manages: not
                            GitHub, and not a personal Google account with an address there. Public email domains like
                            @gmail.com can&apos;t be added.
                        </p>
                    )}
                </SettingRow>
            </SettingsCard>
        )
    }

    return (
        <SettingsSection id="general-workspace" title="Workspace" description="Applies to everyone here.">
            {body}
        </SettingsSection>
    )
}
