"use client"

// WorkspaceSettingsCard — admin UI for operational settings that previously
// required editing env files + redeploying: per-file upload limit, the sign-up
// allow-list. The email key moved to the Email section (EmailProviderCard), so
// email is configured in one place. DB-first with env fallback. Changes apply
// without a restart.

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/ui/error-state"
import { SaveBar, SettingRow, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import { useToast } from "@/hooks/use-toast"
import { getWorkspaceSettings, updateWorkspaceSettings, type WorkspaceSettings } from "@/services/settingsService"
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
    const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
    const [state, setState] = useState<"loading" | "failed" | "ready">("loading")
    const [draft, setDraft] = useState<Draft>({ uploadLimit: "", allowedUsers: "" })
    const [saving, setSaving] = useState(false)
    // Said under the field it is about, not in a toast that leaves with the error.
    const [sizeError, setSizeError] = useState("")
    // Why the server wouldn't save the allow-list (a public email domain, say).
    const [accessRefusal, setAccessRefusal] = useState("")
    const sizeRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLTextAreaElement>(null)

    const saved = settings ? draftOf(settings) : null
    const sizeChanged = !!saved && draft.uploadLimit !== saved.uploadLimit
    const listChanged = !!saved && !sameList(draft.allowedUsers, saved.allowedUsers)
    const dirty = sizeChanged || listChanged

    const load = () => {
        setState("loading")
        getWorkspaceSettings()
            .then((s) => {
                // No answer to build the form from is a failed read too: an empty
                // allow-list here would save as "invite only".
                if (!s) {
                    setState("failed")
                    return
                }
                setSettings(s)
                setDraft(draftOf(s))
                setState("ready")
            })
            .catch(() => setState("failed"))
    }

    useEffect(() => {
        load()
    }, [])

    const discard = () => {
        if (saved) setDraft(saved)
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
                    if (s) setSettings(s)
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
                    if (s) {
                        setSettings(s)
                        setDraft((d) => ({ ...d, allowedUsers: draftOf(s).allowedUsers }))
                    }
                } catch (err) {
                    setAccessRefusal(serverMessage(err, "Couldn't save the allow-list. Try again."))
                    listRef.current?.focus()
                    return
                }
            }
            toast({ title: "Workspace settings saved" })
        } finally {
            setSaving(false)
        }
    }

    let body: React.ReactNode
    if (state === "loading") {
        body = (
            <SettingsList>
                <div aria-busy="true" aria-label="Loading the workspace settings" className="space-y-2 px-4 py-3">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-3 w-80 max-w-full" />
                </div>
                <div aria-hidden="true" className="space-y-2 px-4 py-3">
                    <Skeleton className="h-4 w-64" />
                    <Skeleton className="h-16 w-full" />
                </div>
            </SettingsList>
        )
    } else if (state === "failed" || !settings) {
        // No form at all: the fields would be empty, and saving an empty
        // allow-list over a failed read made the workspace invite-only.
        body = <ErrorState subject="the workspace settings" onRetry={load} />
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
                                    setDraft((d) => ({ ...d, uploadLimit: e.target.value }))
                                    setSizeError("")
                                }}
                                className="h-8 w-24 text-right tabular-nums"
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
                    {/* A list, so the field is as wide as the row and its label and help
                        sit above it, at the same padding as the row above. */}
                    <div className="space-y-2 px-4 py-3">
                        <div className="space-y-1">
                            <Label htmlFor="allowed-users" className="text-sm font-medium leading-5">
                                Who can join without an invitation
                            </Label>
                            <p id="allowed-users-desc" className="text-xs text-muted-foreground text-pretty">
                                Emails and domains, separated by commas. Leave it empty and people join only by invitation.
                                People on this list join by signing in, without an invitation. An address on it gets in through
                                Google or GitHub. An entry like @example.com lets in anyone who signs in with a Google Workspace
                                account that example.com manages: not GitHub, and not a personal Google account with an address
                                there. Public email domains like @gmail.com can&apos;t be added. {SOURCE[settings.allowed_users_source] ?? ""}
                            </p>
                        </div>
                        <Textarea
                            ref={listRef}
                            id="allowed-users"
                            name="allowed-users"
                            autoComplete="off"
                            spellCheck={false}
                            value={draft.allowedUsers}
                            onChange={(e) => {
                                setDraft((d) => ({ ...d, allowedUsers: e.target.value }))
                                setAccessRefusal("")
                            }}
                            placeholder="alice@example.com, @example.com"
                            rows={3}
                            aria-invalid={accessRefusal ? true : undefined}
                            aria-describedby={accessRefusal ? "allowed-users-refusal allowed-users-desc" : "allowed-users-desc"}
                        />
                        {accessRefusal && (
                            <p id="allowed-users-refusal" role="alert" className="text-sm text-danger-ink">{accessRefusal}</p>
                        )}
                    </div>
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
