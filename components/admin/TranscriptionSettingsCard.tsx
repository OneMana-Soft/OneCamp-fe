"use client"

// TranscriptionSettingsCard — admin UI for call-transcription configuration
// that previously required editing env files + redeploying: the transcription
// mode (browser vs. server-side vs. off) and a model-agnostic STT config
// (provider + model + optional endpoint/language + encrypted key). DB-first
// with env fallback; secrets are write-only (only has_* + source shown).
// Changes apply at runtime — new calls pick them up immediately, and the
// browser path switches without a frontend rebuild.
//
// STT is plug-and-play: the "OpenAI-compatible" provider + a Base URL lets an
// admin point at OpenAI Whisper, Groq, or a self-hosted Whisper endpoint
// without any code change.
//
// Two ways of saving, each said out loud. The mode saves the moment it is
// picked, and Off asks first, because it ends captions and transcripts for
// every call. The speech-to-text block is several fields that only make sense
// together, so its edits wait in a save bar. Until the stored settings are
// read there is no form: a failed read used to show "Browser" as the mode.

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { SaveBar, SettingRow, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { CheckCircle2, Loader2, XCircle } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
    getTranscriptionConfig,
    updateTranscriptionConfig,
    testTranscriptionConfig,
    type TranscriptionConfig,
    type TranscriptionMode,
    type STTProvider,
    type TranscriptionTestResult,
} from "@/services/settingsService"
import { appMutate as globalMutate } from "@/lib/swrMutate";

// Where a value comes from when it isn't saved here: the stored setting wins,
// then the server's environment, then the built-in default.
const SOURCE_NOTE: Partial<Record<string, string>> = {
    env: "From the server's environment until you change it here.",
    default: "The default until you change it here.",
}

const MODE_LABEL: Record<TranscriptionMode, string> = {
    frontend: "Browser",
    backend: "Server",
    off: "Off",
}

const MODE_DESCRIPTION: Record<TranscriptionMode, string> = {
    frontend: "Each person's browser transcribes their own speech. Free and needs no key, but it favours English and only Chrome and Edge take part: someone on Firefox or Safari is missing from the transcript.",
    backend: "An agent on the server transcribes every speaker with the speech-to-text model below. Better quality, and nobody is left out. The bundled server keeps the audio on this machine; a cloud provider bills per minute.",
    off: "No live captions, and no transcript is kept for any call.",
}

const PROVIDER_LABEL: Record<STTProvider, string> = {
    local: "Self-hosted (runs on this server)",
    deepgram: "Deepgram",
    google: "Google Cloud Speech-to-Text",
    openai: "OpenAI-compatible (Whisper, Groq or your own)",
}

// Shown under the picker. Only the bundled option keeps the audio on the
// machine, and that is the difference an admin is actually choosing between,
// so it is stated rather than left to be inferred from the provider's name.
const PROVIDER_NOTE: Record<STTProvider, string> = {
    local: "Meeting audio never leaves this server, and there is nothing to pay per minute. Start it with `make stt_up`. The first call after a restart is slower while the model loads.",
    deepgram: "Meeting audio is sent to Deepgram and billed per minute.",
    google: "Meeting audio is sent to Google Cloud and billed per minute.",
    openai: "Meeting audio is sent to the endpoint you enter below. Billing depends on who runs it.",
}

const MODEL_PLACEHOLDER: Record<STTProvider, string> = {
    local: "whisper-1",
    deepgram: "nova-2",
    google: "The provider's default",
    openai: "whisper-1",
}

/** A help line, with where the value comes from when that isn't here. */
const withSource = (help: string, source: string | undefined) =>
    [help, source ? SOURCE_NOTE[source] : undefined].filter(Boolean).join(" ")

export default function TranscriptionSettingsCard() {
    const { toast } = useToast()
    const confirm = useConfirm()
    const [config, setConfig] = useState<TranscriptionConfig | null>(null)
    const [failed, setFailed] = useState(false)
    const [retrying, setRetrying] = useState(false)

    // Local editable state.
    const [mode, setMode] = useState<TranscriptionMode>("frontend")
    const [sttProvider, setSttProvider] = useState<STTProvider>("deepgram")
    const [model, setModel] = useState("")
    const [baseUrl, setBaseUrl] = useState("")
    const [language, setLanguage] = useState("")
    const [apiKey, setApiKey] = useState("")
    const [googleCreds, setGoogleCreds] = useState("")

    const [savingMode, setSavingMode] = useState(false)
    const [savingBackend, setSavingBackend] = useState(false)
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<TranscriptionTestResult | null>(null)

    // The speech-to-text fields, back to what is stored. Secret inputs always
    // reset to blank (write-only).
    const resetBackend = useCallback((c: TranscriptionConfig | null) => {
        if (c) {
            setSttProvider(c.stt_provider)
            setModel(c.stt_model ?? "")
            setBaseUrl(c.stt_base_url ?? "")
            setLanguage(c.stt_language ?? "")
        }
        setApiKey("")
        setGoogleCreds("")
    }, [])

    const applyConfig = useCallback((c: TranscriptionConfig | null) => {
        setConfig(c)
        if (c) setMode(c.mode)
        resetBackend(c)
    }, [resetBackend])

    const load = useCallback(async () => {
        try {
            const c = await getTranscriptionConfig()
            if (!c) throw new Error("no transcription settings in the reply")
            applyConfig(c)
            setFailed(false)
        } catch {
            setFailed(true)
        }
    }, [applyConfig])

    useEffect(() => {
        void load()
    }, [load])

    // Saving the mode also busts the client-config SWR cache so open call UIs
    // pick up the new mode on their next read. Only the mode is taken from the
    // reply: speech-to-text edits still waiting in the save bar stay.
    const saveMode = async (next: TranscriptionMode) => {
        const before = mode
        setMode(next)
        setSavingMode(true)
        try {
            const c = await updateTranscriptionConfig({ mode: next })
            if (c) {
                setConfig(c)
                setMode(c.mode)
            }
            globalMutate("client-config")
            toast({ title: "Transcription mode changed", description: MODE_DESCRIPTION[next] })
        } catch (e) {
            toast({
                title: "Couldn't change the transcription mode",
                description: apiErrorMessage(e, "Try again in a moment."),
                variant: "destructive",
            })
            setMode(before)
        } finally {
            setSavingMode(false)
        }
    }

    const pickMode = (next: TranscriptionMode) => {
        if (next === mode || savingMode) return
        if (next !== "off") {
            void saveMode(next)
            return
        }
        confirm({
            title: "Turn off transcription?",
            description:
                "New calls get no live captions and keep no transcript, so there is nothing to search, recap or turn into notes afterwards.",
            confirmText: "Turn off",
            destructive: true,
            onConfirm: () => void saveMode("off"),
        })
    }

    const showBackendConfig = mode === "backend"
    // The bundled server sits on the stack network with no credential of its
    // own, so asking for a key would be a question with no right answer.
    const usesApiKey = sttProvider === "deepgram" || sttProvider === "openai"

    const backendDirty =
        !!config &&
        (sttProvider !== config.stt_provider ||
            model.trim() !== (config.stt_model ?? "") ||
            language.trim() !== (config.stt_language ?? "") ||
            (sttProvider === "openai" && baseUrl.trim() !== (config.stt_base_url ?? "")) ||
            (usesApiKey && apiKey.trim() !== "") ||
            (sttProvider === "google" && googleCreds.trim() !== ""))

    // Backend block: provider + model + optional endpoint/language + the
    // relevant secret. Secrets are sent only when non-blank ("keep existing").
    // Returns true on success so callers (Save and test) can chain safely.
    const saveBackend = async (): Promise<boolean> => {
        setSavingBackend(true)
        try {
            const req: Parameters<typeof updateTranscriptionConfig>[0] = {
                stt_provider: sttProvider,
                stt_model: model.trim(),
                stt_language: language.trim(),
                // base_url only applies to the openai-compatible kind; clear it
                // otherwise so a stale endpoint can't leak across providers.
                stt_base_url: sttProvider === "openai" ? baseUrl.trim() : "",
            }
            if (sttProvider === "google") {
                if (googleCreds.trim()) req.google_credentials = googleCreds.trim()
            } else if (apiKey.trim()) {
                req.stt_api_key = apiKey.trim()
            }
            const c = await updateTranscriptionConfig(req)
            if (c) {
                setConfig(c)
                resetBackend(c)
            }
            setTestResult(null) // config changed — any prior test result is stale
            toast({ title: "Speech-to-text settings saved" })
            return true
        } catch (e) {
            toast({
                title: "Couldn't save the speech-to-text settings",
                description: apiErrorMessage(e, "Check the fields and try again."),
                variant: "destructive",
            })
            return false
        } finally {
            setSavingBackend(false)
        }
    }

    // Test probes the SAVED config server-side, so unsaved edits are saved
    // first and the admin tests exactly what's on screen. If that save fails
    // (e.g. invalid endpoint URL → 400), there is nothing to test.
    const runTest = async () => {
        setTesting(true)
        setTestResult(null)
        try {
            if (backendDirty && !(await saveBackend())) return
            const res = await testTranscriptionConfig()
            setTestResult(res)
            if (res?.ok) {
                toast({ title: "The test passed", description: res.message })
            } else {
                toast({ title: "The test failed", description: res?.message, variant: "destructive" })
            }
        } catch (e) {
            const msg = apiErrorMessage(e, "Try again in a moment.")
            setTestResult({ ok: false, provider: sttProvider, message: msg })
            toast({ title: "Couldn't run the test", description: msg, variant: "destructive" })
        } finally {
            setTesting(false)
        }
    }

    const busy = savingBackend || testing

    return (
        <SettingsSection
            title="Call transcription"
            description="Live captions during calls, and a transcript of every call, recorded or not, for searchable playback, the meeting recap and the notes document. Changes reach new calls at once."
        >
            {!config && failed ? (
                <ErrorState
                    subject="the transcription settings"
                    retrying={retrying}
                    onRetry={() => {
                        setRetrying(true)
                        void load().finally(() => setRetrying(false))
                    }}
                />
            ) : !config ? (
                <div role="status" aria-label="Loading the transcription settings" className="rounded-lg border border-border px-4 py-3">
                    <SkeletonRows rows={2} avatar={false} />
                </div>
            ) : (
                <>
                    <div className="space-y-2">
                        <SettingsList>
                            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                                <div className="min-w-0 space-y-1">
                                    <p id="transcription-mode" className="text-sm font-medium leading-5">Mode</p>
                                    <p id="transcription-mode-desc" className="text-xs text-muted-foreground text-pretty">
                                        {withSource(MODE_DESCRIPTION[mode], config.mode_source)}
                                    </p>
                                </div>
                                {/* One of three: a segmented radio group, so every
                                    choice is in view and Off can ask first. */}
                                <div
                                    role="radiogroup"
                                    aria-labelledby="transcription-mode"
                                    aria-describedby="transcription-mode-desc"
                                    className="inline-flex w-fit shrink-0 gap-1 rounded-md bg-muted p-1"
                                >
                                    {(Object.keys(MODE_LABEL) as TranscriptionMode[]).map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            role="radio"
                                            aria-checked={mode === m}
                                            disabled={savingMode}
                                            onClick={() => pickMode(m)}
                                            className={cn(
                                                "h-7 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50",
                                                mode === m ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                                            )}
                                        >
                                            {MODE_LABEL[m]}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </SettingsList>
                        <p className="text-xs text-muted-foreground">The mode saves as soon as you pick it.</p>
                    </div>

                    {/* Backend STT model config (only relevant in backend mode) */}
                    {showBackendConfig && (
                        <div className="space-y-3 pt-3">
                            <div className="space-y-1">
                                <h3 className="text-sm font-semibold">Speech-to-text</h3>
                                <p className="max-w-[65ch] text-xs text-muted-foreground text-pretty">
                                    What the server&apos;s agent transcribes with. Keys are encrypted when saved and never shown again.
                                </p>
                            </div>
                            <SettingsList>
                                <SettingRow
                                    label="Provider"
                                    controlId="stt-provider"
                                    description={withSource(PROVIDER_NOTE[sttProvider], config.stt_provider_source)}
                                >
                                    <Select
                                        value={sttProvider}
                                        onValueChange={(v) => setSttProvider(v as STTProvider)}
                                        disabled={busy}
                                    >
                                        <SelectTrigger id="stt-provider" aria-describedby="stt-provider-desc" className="h-8 w-full sm:w-80">
                                            <SelectValue placeholder="Choose a provider" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(Object.keys(PROVIDER_LABEL) as STTProvider[]).map((p) => (
                                                <SelectItem key={p} value={p}>
                                                    {PROVIDER_LABEL[p]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </SettingRow>

                                <SettingRow
                                    label="Model"
                                    controlId="stt-model"
                                    description="The model's name at the provider. Leave it blank for the provider's default."
                                >
                                    <Input
                                        id="stt-model"
                                        aria-describedby="stt-model-desc"
                                        value={model}
                                        onChange={(e) => setModel(e.target.value)}
                                        placeholder={MODEL_PLACEHOLDER[sttProvider]}
                                        disabled={busy}
                                        className="h-8 w-full sm:w-64"
                                        spellCheck={false}
                                        autoComplete="off"
                                    />
                                </SettingRow>

                                {/* Base URL: the openai-compatible provider only. The bundled
                                    server's endpoint is a server-side constant, which is what
                                    lets the backend probe it without the SSRF guard. */}
                                {sttProvider === "openai" && (
                                    <SettingRow
                                        label="Endpoint base URL"
                                        controlId="stt-base-url"
                                        description="Any OpenAI-compatible endpoint: OpenAI, Groq or your own faster-whisper. Leave it blank for OpenAI's own."
                                    >
                                        <Input
                                            id="stt-base-url"
                                            aria-describedby="stt-base-url-desc"
                                            type="url"
                                            inputMode="url"
                                            value={baseUrl}
                                            onChange={(e) => setBaseUrl(e.target.value)}
                                            placeholder="https://api.openai.com/v1"
                                            disabled={busy}
                                            className="h-8 w-full sm:w-64"
                                            spellCheck={false}
                                            autoComplete="off"
                                        />
                                    </SettingRow>
                                )}

                                <SettingRow
                                    label="Language"
                                    controlId="stt-language"
                                    description="Leave it blank to detect the language, or enter a code such as en, es or fr."
                                >
                                    <Input
                                        id="stt-language"
                                        aria-describedby="stt-language-desc"
                                        value={language}
                                        onChange={(e) => setLanguage(e.target.value)}
                                        placeholder="Detect it"
                                        disabled={busy}
                                        className="h-8 w-full sm:w-40"
                                        spellCheck={false}
                                        autoComplete="off"
                                    />
                                </SettingRow>

                                {/* Secret: API key for deepgram/openai, JSON for google */}
                                {usesApiKey ? (
                                    <SettingRow
                                        label="API key"
                                        controlId="stt-api-key"
                                        description={withSource(
                                            config.has_stt_api_key ? "Saved. Leave it blank to keep it." : "Not set yet.",
                                            config.stt_api_key_source,
                                        )}
                                    >
                                        <Input
                                            id="stt-api-key"
                                            aria-describedby="stt-api-key-desc"
                                            type="password"
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                            placeholder={config.has_stt_api_key ? "••••••••" : "Your provider's API key"}
                                            disabled={busy}
                                            className="h-8 w-full sm:w-64"
                                            autoComplete="new-password"
                                        />
                                    </SettingRow>
                                ) : sttProvider === "google" ? (
                                    <div className="space-y-2 px-4 py-3">
                                        <div className="space-y-1">
                                            <Label htmlFor="stt-google-json" className="text-sm font-medium leading-5">
                                                Service account JSON
                                            </Label>
                                            <p id="stt-google-json-desc" className="text-xs text-muted-foreground text-pretty">
                                                {withSource(
                                                    config.has_google_credentials
                                                        ? "Saved. Leave it blank to keep it, or paste new JSON to replace it."
                                                        : "Not set yet. Paste the key file Google gives you for a service account.",
                                                    config.google_source,
                                                )}
                                            </p>
                                        </div>
                                        <Textarea
                                            id="stt-google-json"
                                            aria-describedby="stt-google-json-desc"
                                            value={googleCreds}
                                            onChange={(e) => setGoogleCreds(e.target.value)}
                                            placeholder={config.has_google_credentials ? "••••••••" : '{ "type": "service_account", … }'}
                                            rows={4}
                                            disabled={busy}
                                            spellCheck={false}
                                            className="font-mono text-xs md:text-xs"
                                        />
                                    </div>
                                ) : null}
                            </SettingsList>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void runTest()}
                                    disabled={busy}
                                    className="h-8 gap-1.5"
                                >
                                    {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                                    {testing ? "Testing…" : backendDirty ? "Save and test the connection" : "Test the connection"}
                                </Button>
                            </div>

                            {testResult && (
                                <div
                                    className={cn(
                                        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                                        testResult.ok
                                            ? "border-success/20 bg-success/10 text-success-ink"
                                            : "border-destructive/20 bg-destructive/10 text-danger-ink",
                                    )}
                                    role="status"
                                >
                                    {testResult.ok ? (
                                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                                    ) : (
                                        <XCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                                    )}
                                    <span>{testResult.message}</span>
                                </div>
                            )}

                            <SaveBar
                                dirty={backendDirty}
                                saving={savingBackend && !testing}
                                what="speech-to-text changes"
                                onSave={() => void saveBackend()}
                                onDiscard={() => resetBackend(config)}
                            />
                        </div>
                    )}
                </>
            )}
        </SettingsSection>
    )
}
