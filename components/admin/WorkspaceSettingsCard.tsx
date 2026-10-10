"use client"

// WorkspaceSettingsCard — admin UI for operational settings that previously
// required editing env files + redeploying: per-file upload limit, the sign-up
// allow-list. The email key moved to the Email section (EmailProviderCard), so
// email is configured in one place. DB-first with env fallback. Changes apply
// without a restart.

import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SaveBar, SettingRow, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import { useToast } from "@/hooks/use-toast"
import { updateWorkspaceSettings, useWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"
import { appMutate as globalMutate } from "@/lib/swrMutate";
import { serverMessage } from "@/lib/http/serverMessage"
import { apiErrorMessage } from "@/lib/utils/apiError"

/** Where a value comes from, as a short sentence after its help. */
const SOURCE: Record<string, string> = {
    db: "Set here.",
    env: "Set in the server's environment file; saving here overrides it.",
    default: "The default.",
    none: "Not set.",
}

type Draft = { uploadLimit: string; allowedUsers: string }

const draftOf = (s: WorkspaceSettings): Draft => ({
    uploadLimit: String(s.upload_limit_mb),
    allowedUsers: s.allowed_users?.join(", ") ?? "",
})
const entries = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean)
const sameList = (a: string, b: string) => entries(a).join(",") === entries(b).join(",")

export default function WorkspaceSettingsCard() {
    const { toast } = useToast()
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
    // Why the server wouldn't save the allow-list (a public email domain, say).
    const [accessRefusal, setAccessRefusal] = useState("")
    const sizeRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLTextAreaElement>(null)

    const saved = settings ? draftOf(settings) : null
    const draft: Draft = edits ?? saved ?? { uploadLimit: "", allowedUsers: "" }
    const sizeChanged = !!saved && draft.uploadLimit !== saved.uploadLimit
    const listChanged = !!saved && !sameList(draft.allowedUsers, saved.allowedUsers)
    const dirty = sizeChanged || listChanged
    const edit = (patch: Partial<Draft>) => setEdits({ ...draft, ...patch })
    // What a save answered goes into the shared read, so every card shows it.
    const store = (s: WorkspaceSettings) => mutate({ data: s }, { revalidate: false })

    const discard = () => {
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
                    const s = await updateWorkspaceSettings({ allowed_users: entries(draft.allowedUsers) }, { ownErrors: true })
                    if (s) await store(s)
                } catch (err) {
                    setAccessRefusal(serverMessage(err, "Couldn't save the allow-list. Try again."))
                    listRef.current?.focus()
                    return
                }
            }
            // Saved: the form follows the server's answer again (the list as
            // the server wrote it back).
            setEdits(null)
            toast({ title: "Workspace settings saved" })
        } finally {
            setSaving(false)
        }
    }

    let body: React.ReactNode
    if (isError || (!isLoading && !settings)) {
        // No form at all: the fields would be empty, and saving an empty
        // allow-list over a failed read made the workspace invite-only.
        body = <ErrorState compact subject="the workspace settings" onRetry={() => void mutate()} />
    } else if (!settings) {
        // The rows' own shape: a setting with its field at the end, then the
        // allow-list's words over its box.
        body = (
            <SettingsList>
                <div aria-busy="true" aria-label="Loading the workspace settings" className="flex items-center justify-between gap-6 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-56" />
                        <Skeleton className="h-3 w-80 max-w-full" />
                    </div>
                    <Skeleton className="h-9 w-24 shrink-0" />
                </div>
                <div aria-hidden="true" className="space-y-2 px-4 py-3">
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-16 w-full" />
                </div>
            </SettingsList>
        )
    } else {
        body = (
            <>
                <SettingsList>
                    <div>
                        <SettingRow
                            label="Largest file a member can upload"
                            description={<>Someone who picks a bigger file is told at once, before anything uploads. {SOURCE[settings.upload_limit_source] ?? ""}</>}
                            controlId="upload-limit"
                        >
                            <Input
                                ref={sizeRef}
                                id="upload-limit"
                                name="upload-limit"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                value={draft.uploadLimit}
                                onChange={(e) => {
                                    edit({ uploadLimit: e.target.value })
                                    setSizeError("")
                                }}
                                className="w-24 text-right tabular-nums"
                                aria-invalid={sizeError ? true : undefined}
                                aria-describedby={sizeError ? "upload-limit-error upload-limit-desc" : "upload-limit-desc"}
                            />
                            <span className="text-sm text-muted-foreground">MB</span>
                        </SettingRow>
                        {sizeError && (
                            <p id="upload-limit-error" role="alert" className="-mt-1 px-4 pb-3 text-sm text-danger-ink">
                                {sizeError}
                            </p>
                        )}
                    </div>
                    {/* Its words over a field as wide as the row, at the same
                        padding as the row above. */}
                    <SettingRow
                        layout="stacked"
                        label="Who can join without an invitation"
                        description={
                            <>
                                Emails and domains, separated by commas; empty means invitation only. A listed address joins
                                by signing in with Google or GitHub. A domain like @example.com admits a Google Workspace
                                account that example.com manages: not GitHub, and not a personal Google account with an address
                                there. Public email domains like @gmail.com can&apos;t be added. {SOURCE[settings.allowed_users_source] ?? ""}
                            </>
                        }
                        controlId="allowed-users"
                    >
                        <Textarea
                            ref={listRef}
                            id="allowed-users"
                            name="allowed-users"
                            autoComplete="off"
                            spellCheck={false}
                            value={draft.allowedUsers}
                            onChange={(e) => {
                                edit({ allowedUsers: e.target.value })
                                setAccessRefusal("")
                            }}
                            placeholder="alice@example.com, @example.com"
                            rows={3}
                            aria-invalid={accessRefusal ? true : undefined}
                            aria-describedby={accessRefusal ? "allowed-users-refusal allowed-users-desc" : "allowed-users-desc"}
                        />
                        {accessRefusal && (
                            <p id="allowed-users-refusal" role="alert" className="mt-2 text-sm text-danger-ink">{accessRefusal}</p>
                        )}
                    </SettingRow>
                </SettingsList>
                <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={discard} what="workspace settings" />
            </>
        )
    }

    return (
        <SettingsSection
            title="Workspace"
            description="Uploads, and who can join without an invitation. Changes apply as soon as they're saved, with no restart."
        >
            {body}
        </SettingsSection>
    )
}
