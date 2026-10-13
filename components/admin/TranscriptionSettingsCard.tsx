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
// picked, with the saved tick, and Off asks first, because it ends captions
// and transcripts for every call. The speech-to-text block is several fields
// that only make sense together, so it is a batched card whose footer holds
// Save and the connection test. Until the stored settings are read there is
// no form: a failed read used to show "Browser" as the mode.
//
// Design v3 (admin A17): where the model runs is a segmented choice, "On this
// server · Provider"; on this server, a hint row says the memory it needs and
// gives the command that starts it as a code row.

import React, { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { SettingRow, SettingsCard, SettingsCardError, SettingsCardFooter, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { CodeRow } from "@/components/ui/settingsControls"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { CheckCircle2, HardDrive, Loader2, XCircle } from "@/lib/icons"
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

const MODE_OPTIONS = (Object.keys(MODE_LABEL) as TranscriptionMode[]).map((value) => ({ value, label: MODE_LABEL[value] }))

/**
 * The speech-to-text controls' one width (and the inputs' and select's one
 * height, the default 36px), so their left edges line up down the list: they
 * were 320, 256 and 160px wide at two heights. Under its words when the row is
 * narrow, the control takes the row's width.
 */
const CONTROL = "w-full @xl:w-72"

/**
 * What each mode does, and where the audio goes (CALL-BUG-2). Browser mode
 * was "Free and needs no key", silent about the audio, while the Google Cloud
 * provider below said plainly that it sends audio to Google. Browser mode
 * sends it to Google or Microsoft too, from each person's browser. Nothing
 * runs in any mode until someone in the call turns captions on, and the call
 * tells everyone when they do.
 */
export const MODE_DESCRIPTION: Record<TranscriptionMode, string> = {
    frontend: "Each person's browser turns their own speech into text while captions are on in a call. Chrome sends the audio to Google, and Edge to Microsoft; Firefox and Safari can't take part. Free and needs no key. Everyone in the call is told before anything is sent.",
    backend: "An agent on the server transcribes every speaker with the speech-to-text model below while captions are on in a call. Better quality, and nobody is left out. The bundled server keeps the audio on this machine; a cloud provider bills per minute.",
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
const PROVIDER_NOTE: Record<STTProvider, React.ReactNode> = {
    // The command that starts it is a code row in the hint row below.
    local: "Meeting audio never leaves this server, and there is nothing to pay per minute. The first call after a restart is slower while the model loads.",
    deepgram: "Meeting audio is sent to Deepgram and billed per minute.",
    google: "Meeting audio is sent to Google Cloud and billed per minute.",
    openai: "Meeting audio is sent to the endpoint you enter below. Billing depends on who runs it.",
}

/** Where the model runs: the bundled server, or a provider elsewhere. */
type Where = "server" | "provider"
const WHERE_OPTIONS = [
    { value: "server", label: "On this server" },
    { value: "provider", label: "Provider" },
] as const
/** The providers somewhere else, for the picker: every one but the bundled server. */
const CLOUD_PROVIDERS = (Object.keys(PROVIDER_LABEL) as STTProvider[]).filter((p) => p !== "local")

/**
 * The bundled server's default model (WHISPER_MODEL=base in final-compose.yml)
 * and the memory it holds while loaded.
 */
const LOCAL_RAM_HINT = "The bundled base model needs about 1 GB of free memory. A larger WHISPER_MODEL needs more."

const MODEL_PLACEHOLDER: Record<STTProvider, string> = {
    local: "whisper-1",
    deepgram: "nova-2",
    google: "The provider's default",
    openai: "whisper-1",
}

/** Where a value comes from when that isn't here, after a help line drawn on its own. */
const sourceNote = (source: string | undefined) => {
    const note = source ? SOURCE_NOTE[source] : undefined
    return note ? ` ${note}` : null
}

/** A help line, with where the value comes from when that isn't here. */
const withSource = (help: string, source: string | undefined) =>
    [help, source ? SOURCE_NOTE[source] : undefined].filter(Boolean).join(" ")

/** The settings, with the agent's heartbeat (CALL-BUG-4): whether a server transcriber is connected. */
type ConfigWithAgent = TranscriptionConfig & { where?: string; agent?: { running: boolean; seen_at?: number } }

/** The agent's state in words: "Running" or "Not running", never a colour alone. Pure. */
export function agentStatus(agent: ConfigWithAgent["agent"]): { running: boolean; label: string; detail: string } | null {
    if (!agent) return null
    if (agent.running) {
        return { running: true, label: "Running", detail: "The transcription agent is connected and joins calls when captions are turned on." }
    }
    return {
        running: false,
        label: "Not running",
        detail: "No transcription agent is connected, so calls get no captions and no transcript in this mode. Start it on the server.",
    }
}

export default function TranscriptionSettingsCard() {
    const { toast } = useToast()
    const confirm = useConfirm()
    const [config, setConfig] = useState<ConfigWithAgent | null>(null)
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

    const { status: modeStatus, run: runMode } = useSaveStatus()
    const savingMode = modeStatus.state === "saving"
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
        const ok = await runMode(async () => {
            const c = await updateTranscriptionConfig({ mode: next })
            if (c) {
                setConfig(c)
                setMode(c.mode)
            }
            globalMutate("client-config")
        })
        // A refusal slides the choice back; its reason is under the label.
        if (!ok) setMode(before)
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
    const where: Where = sttProvider === "local" ? "server" : "provider"
    const agent = agentStatus(config?.agent)
    const pickWhere = (next: Where) => {
        if (next === where) return
        setSttProvider(next === "server" ? "local" : config && config.stt_provider !== "local" ? config.stt_provider : CLOUD_PROVIDERS[0])
    }

    return (
        <SettingsSection
            title="Call transcription"
            description={
                <>
                    Live captions during calls, and a transcript of every call, recorded or not, for searchable playback,
                    the meeting recap and the notes document. Changes reach new calls at once.{" "}
                    <span>The mode saves as soon as you pick it.</span>
                </>
            }
        >
            {!config && failed ? (
                <SettingsCard>
                    <SettingsCardError
                        what="the transcription settings"
                        retrying={retrying}
                        onRetry={() => {
                            setRetrying(true)
                            void load().finally(() => setRetrying(false))
                        }}
                    />
                </SettingsCard>
            ) : !config ? (
                // The mode's own row stands in, so nothing moves when it arrives.
                <SettingsCard>
                    <div role="status" aria-label="Loading the transcription settings" className="contents">
                        <SettingsRowsSkeleton rows={1} control="field" />
                    </div>
                </SettingsCard>
            ) : (
                <>
                    <SettingsCard>
                        {/* One of three: the app's segmented control, so every
                            choice is in view and Off can ask first. */}
                        <SettingRow
                            label="Mode"
                            controlId="transcription-mode"
                            description={withSource(MODE_DESCRIPTION[mode], config.mode_source)}
                            status={modeStatus}
                        >
                            <SegmentedControl
                                id="transcription-mode"
                                aria-label="Mode"
                                aria-describedby="transcription-mode-desc"
                                value={mode}
                                onValueChange={pickMode}
                                options={MODE_OPTIONS}
                                disabled={savingMode}
                            />
                        </SettingRow>
                    </SettingsCard>

                    {/* Backend STT model config (only relevant in backend mode) */}
                    {showBackendConfig && (
                        <SettingsSection
                            level={3}
                            title="Speech-to-text"
                            description="What the server's agent transcribes with."
                            className="pt-3"
                        >
                            <SettingsCard
                                dirty={backendDirty}
                                footer={
                                    <SettingsCardFooter
                                        hint="Keys are encrypted when saved and never shown again."
                                        dirty={backendDirty}
                                        saving={savingBackend && !testing}
                                        onSave={() => void saveBackend()}
                                        onReset={() => resetBackend(config)}
                                    >
                                        <Button size="sm" variant="secondary" onClick={() => void runTest()} disabled={busy}>
                                            {testing && <Loader2 className="animate-spin" aria-hidden="true" />}
                                            {testing ? "Testing…" : backendDirty ? "Save and test" : "Test the connection"}
                                        </Button>
                                    </SettingsCardFooter>
                                }
                            >
                                <SettingRow
                                    label="Where it runs"
                                    controlId="stt-where"
                                    description={
                                        <>
                                            {PROVIDER_NOTE[sttProvider]}
                                            {sourceNote(config.stt_provider_source)}
                                        </>
                                    }
                                >
                                    <SegmentedControl
                                        id="stt-where"
                                        aria-label="Where it runs"
                                        aria-describedby="stt-where-desc"
                                        value={where}
                                        onValueChange={(v) => pickWhere(v as Where)}
                                        options={WHERE_OPTIONS}
                                        disabled={busy}
                                    />
                                </SettingRow>

                                {agent ? (
                                    <div role="status" data-agent-status={agent.running ? "running" : "not-running"} className="set-row flex items-start gap-2">
                                        {agent.running ? (
                                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden="true" />
                                        ) : (
                                            <XCircle className="mt-0.5 size-4 shrink-0 text-danger-ink" aria-hidden="true" />
                                        )}
                                        <div className="min-w-0 flex-1 space-y-2">
                                            <p className="text-xs">
                                                <span className={agent.running ? "font-medium text-foreground" : "font-medium text-danger-ink"}>Agent: {agent.label}.</span>{" "}
                                                <span className="text-muted-foreground text-pretty">{agent.detail}</span>
                                            </p>
                                            {!agent.running ? <CodeRow value="make stt_up" label="start command" className="max-w-xs" /> : null}
                                        </div>
                                    </div>
                                ) : null}

                                {where === "server" ? (
                                    <div data-ram-hint="" className="set-row flex items-start gap-3">
                                        <span aria-hidden="true" className="mt-0.5 inline-grid size-7 shrink-0 place-items-center rounded-md bg-sunken text-ink-3 ring-1 ring-inset ring-line">
                                            <HardDrive className="size-4" />
                                        </span>
                                        <div className="min-w-0 flex-1 space-y-2">
                                            <p className="text-xs text-muted-foreground text-pretty">{LOCAL_RAM_HINT} Start it on the server:</p>
                                            <CodeRow value="make stt_up" label="start command" className="max-w-xs" />
                                        </div>
                                    </div>
                                ) : (
                                    <SettingRow label="Provider" controlId="stt-provider">
                                        <Select
                                            value={sttProvider}
                                            onValueChange={(v) => setSttProvider(v as STTProvider)}
                                            disabled={busy}
                                        >
                                            <SelectTrigger id="stt-provider" className={CONTROL}>
                                                <SelectValue placeholder="Choose a provider" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {CLOUD_PROVIDERS.map((p) => (
                                                    <SelectItem key={p} value={p}>
                                                        {PROVIDER_LABEL[p]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </SettingRow>
                                )}

                                <SettingRow
                                    label="Model"
                                    controlId="stt-model"
                                    description="Blank uses the provider's default."
                                >
                                    <Input
                                        id="stt-model"
                                        aria-describedby="stt-model-desc"
                                        value={model}
                                        onChange={(e) => setModel(e.target.value)}
                                        placeholder={MODEL_PLACEHOLDER[sttProvider]}
                                        disabled={busy}
                                        className={CONTROL}
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
                                        description="OpenAI, Groq or your own faster-whisper. Blank uses OpenAI's own."
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
                                            className={CONTROL}
                                            spellCheck={false}
                                            autoComplete="off"
                                        />
                                    </SettingRow>
                                )}

                                <SettingRow
                                    label="Language"
                                    controlId="stt-language"
                                    description="Blank detects it, or enter a code such as en, es or fr."
                                >
                                    <Input
                                        id="stt-language"
                                        aria-describedby="stt-language-desc"
                                        value={language}
                                        onChange={(e) => setLanguage(e.target.value)}
                                        placeholder="Detect it"
                                        disabled={busy}
                                        className={CONTROL}
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
                                            className={CONTROL}
                                            autoComplete="new-password"
                                        />
                                    </SettingRow>
                                ) : sttProvider === "google" ? (
                                    <SettingRow
                                        layout="stacked"
                                        label="Service account JSON"
                                        controlId="stt-google-json"
                                        description={withSource(
                                            config.has_google_credentials
                                                ? "Saved. Leave it blank to keep it, or paste new JSON to replace it."
                                                : "Not set yet. Paste the key file Google gives you for a service account.",
                                            config.google_source,
                                        )}
                                    >
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
                                    </SettingRow>
                                ) : null}

                                {/* The test's answer, in the card: a moss check or the danger reason. */}
                                {testResult && (
                                    <div role="status" data-test-result={testResult.ok ? "ok" : "failed"} className="set-row flex items-start gap-2">
                                        {testResult.ok ? (
                                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden="true" />
                                        ) : (
                                            <XCircle className="mt-0.5 size-4 shrink-0 text-danger-ink" aria-hidden="true" />
                                        )}
                                        <span className={testResult.ok ? "text-xs text-foreground" : "text-xs text-danger-ink"}>{testResult.message}</span>
                                    </div>
                                )}
                            </SettingsCard>
                        </SettingsSection>
                    )}
                </>
            )}
        </SettingsSection>
    )
}
