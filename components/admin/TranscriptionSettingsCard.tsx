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

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Mic, CheckCircle2, AlertTriangle, Loader2, XCircle } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import {
    getTranscriptionConfig,
    updateTranscriptionConfig,
    testTranscriptionConfig,
    type TranscriptionConfig,
    type TranscriptionMode,
    type STTProvider,
    type TranscriptionTestResult,
} from "@/services/settingsService"
import { mutate as globalMutate } from "swr"

const SOURCE_LABEL: Record<string, string> = {
    db: "Saved here",
    env: "From environment",
    default: "Default",
    none: "Not configured",
}

const MODE_DESCRIPTION: Record<TranscriptionMode, string> = {
    frontend: "Each participant's browser transcribes their own speech (Web Speech API). Free, no API key, English-biased, quality varies by browser.",
    backend: "A server-side agent transcribes every speaker using your chosen STT model. Higher quality and multi-speaker, but bills per minute.",
    off: "Live captions and transcript capture are disabled for all calls.",
}

const PROVIDER_LABEL: Record<STTProvider, string> = {
    deepgram: "Deepgram",
    google: "Google Cloud Speech-to-Text",
    openai: "OpenAI-compatible (Whisper / Groq / self-hosted)",
}

const MODEL_PLACEHOLDER: Record<STTProvider, string> = {
    deepgram: "nova-2",
    google: "(plugin default)",
    openai: "whisper-1",
}

const SourceBadge = ({ source }: { source: string }) => (
    <span className="text-[11px] text-muted-foreground">Source: {SOURCE_LABEL[source] ?? source}</span>
)

const ConfiguredBadge = ({ configured }: { configured: boolean }) =>
    configured ? (
        <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
            <CheckCircle2 className="h-3 w-3" /> Configured
        </Badge>
    ) : (
        <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3" /> Not set</Badge>
    )

export default function TranscriptionSettingsCard() {
    const { toast } = useToast()
    const [config, setConfig] = useState<TranscriptionConfig | null>(null)
    const [loading, setLoading] = useState(true)

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

    const applyConfig = (c: TranscriptionConfig | null) => {
        setConfig(c)
        if (c) {
            setMode(c.mode)
            setSttProvider(c.stt_provider)
            setModel(c.stt_model ?? "")
            setBaseUrl(c.stt_base_url ?? "")
            setLanguage(c.stt_language ?? "")
        }
        // Secret inputs always reset to blank (write-only).
        setApiKey("")
        setGoogleCreds("")
    }

    const load = () => {
        setLoading(true)
        getTranscriptionConfig()
            .then(applyConfig)
            .catch(() => toast({ title: "Couldn't load transcription settings", variant: "destructive" }))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Saving the mode also busts the client-config SWR cache so open call UIs
    // pick up the new mode on their next read.
    const saveMode = async (next: TranscriptionMode) => {
        setSavingMode(true)
        try {
            const c = await updateTranscriptionConfig({ mode: next })
            applyConfig(c)
            globalMutate("client-config")
            toast({ title: "Transcription mode updated", description: MODE_DESCRIPTION[next] })
        } catch {
            toast({ title: "Failed to update mode", variant: "destructive" })
            setMode(config?.mode ?? "frontend")
        } finally {
            setSavingMode(false)
        }
    }

    // Backend block: provider + model + optional endpoint/language + the
    // relevant secret. Secrets are sent only when non-blank ("keep existing").
    // Returns true on success so callers (Save & test) can chain safely.
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
            applyConfig(c)
            setTestResult(null) // config changed — any prior test result is stale
            toast({ title: "Backend transcription saved" })
            return true
        } catch (e: any) {
            const msg = e?.response?.data?.msg
            toast({ title: "Failed to save backend settings", description: msg, variant: "destructive" })
            return false
        } finally {
            setSavingBackend(false)
        }
    }

    // Test probes the SAVED config server-side. We save the current edits first
    // so the admin tests exactly what's on screen, then run the probe. If the
    // save fails (e.g. invalid endpoint URL → 400), we abort without testing.
    const runTest = async () => {
        setTesting(true)
        setTestResult(null)
        try {
            const saved = await saveBackend()
            if (!saved) return // save surfaced its own error toast; nothing to test
            const res = await testTranscriptionConfig()
            setTestResult(res)
            if (res?.ok) {
                toast({ title: "Transcription test passed", description: res.message })
            } else {
                toast({ title: "Transcription test failed", description: res?.message, variant: "destructive" })
            }
        } catch (e: any) {
            const msg = e?.response?.data?.msg || "Could not run the test."
            setTestResult({ ok: false, provider: sttProvider, message: msg })
            toast({ title: "Transcription test error", description: msg, variant: "destructive" })
        } finally {
            setTesting(false)
        }
    }

    const showBackendConfig = mode === "backend"
    const usesApiKey = sttProvider === "deepgram" || sttProvider === "openai"

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Mic className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg font-semibold">Call transcription</CardTitle>
                </div>
                <CardDescription>
                    Controls live captions and the searchable transcripts attached to recordings. Applies to new calls
                    immediately — no redeploy. Secrets are encrypted at rest and never shown again.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Mode */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium">Mode</h3>
                        {config && <SourceBadge source={config.mode_source} />}
                    </div>
                    <Select
                        value={mode}
                        onValueChange={(v) => { setMode(v as TranscriptionMode); saveMode(v as TranscriptionMode) }}
                        disabled={loading || savingMode}
                    >
                        <SelectTrigger className="w-full sm:w-72">
                            <SelectValue placeholder="Select a mode" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="frontend">Browser (frontend)</SelectItem>
                            <SelectItem value="backend">Server-side agent (backend)</SelectItem>
                            <SelectItem value="off">Off</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{MODE_DESCRIPTION[mode]}</p>
                    <p className="text-[11px] text-muted-foreground">
                        Transcripts are captured for recorded calls and power searchable playback plus AI meeting recaps.
                        Live captions work in any call.
                    </p>
                </div>

                {/* Backend STT model config (only relevant in backend mode) */}
                {showBackendConfig && (
                    <>
                        <Separator />
                        <div className="space-y-4">
                            {/* Provider */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-medium">Speech-to-text provider</h3>
                                    {config && <SourceBadge source={config.stt_provider_source} />}
                                </div>
                                <Select
                                    value={sttProvider}
                                    onValueChange={(v) => setSttProvider(v as STTProvider)}
                                    disabled={loading || savingBackend}
                                >
                                    <SelectTrigger className="w-full sm:w-96">
                                        <SelectValue placeholder="Select a provider" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="deepgram">{PROVIDER_LABEL.deepgram}</SelectItem>
                                        <SelectItem value="google">{PROVIDER_LABEL.google}</SelectItem>
                                        <SelectItem value="openai">{PROVIDER_LABEL.openai}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Model */}
                            <div className="space-y-1.5">
                                <Label className="text-xs">Model</Label>
                                <Input
                                    value={model}
                                    onChange={(e) => setModel(e.target.value)}
                                    placeholder={MODEL_PLACEHOLDER[sttProvider]}
                                    disabled={loading}
                                    className="w-full sm:w-72"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Free-text model name passed to the provider. Leave blank to use its default.
                                </p>
                            </div>

                            {/* Base URL — openai-compatible only */}
                            {sttProvider === "openai" && (
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Endpoint base URL</Label>
                                    <Input
                                        value={baseUrl}
                                        onChange={(e) => setBaseUrl(e.target.value)}
                                        placeholder="https://api.openai.com/v1  ·  or your self-hosted Whisper URL"
                                        disabled={loading}
                                        autoComplete="off"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Any OpenAI-compatible STT endpoint (OpenAI, Groq, self-hosted faster-whisper).
                                        Leave blank for OpenAI's default.
                                    </p>
                                </div>
                            )}

                            {/* Language */}
                            <div className="space-y-1.5">
                                <Label className="text-xs">Language (optional)</Label>
                                <Input
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    placeholder="auto-detect — e.g. en, es, fr"
                                    disabled={loading}
                                    className="w-full sm:w-48"
                                />
                            </div>

                            {/* Secret: API key for deepgram/openai, JSON for google */}
                            {usesApiKey ? (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs">
                                            API key{" "}
                                            {config?.has_stt_api_key && (
                                                <span className="text-muted-foreground font-normal">· leave blank to keep</span>
                                            )}
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <ConfiguredBadge configured={!!config?.has_stt_api_key} />
                                            {config && <SourceBadge source={config.stt_api_key_source} />}
                                        </div>
                                    </div>
                                    <Input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder={config?.has_stt_api_key ? "••••••••" : "Your provider API key"}
                                        disabled={loading}
                                        autoComplete="off"
                                    />
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs">
                                            Google service-account JSON{" "}
                                            {config?.has_google_credentials && (
                                                <span className="text-muted-foreground font-normal">· leave blank to keep</span>
                                            )}
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <ConfiguredBadge configured={!!config?.has_google_credentials} />
                                            {config && <SourceBadge source={config.google_source} />}
                                        </div>
                                    </div>
                                    <textarea
                                        value={googleCreds}
                                        onChange={(e) => setGoogleCreds(e.target.value)}
                                        placeholder={config?.has_google_credentials ? "•••••••• (paste new JSON to replace)" : '{ "type": "service_account", … }'}
                                        rows={4}
                                        disabled={loading}
                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    />
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <Button size="sm" onClick={saveBackend} disabled={savingBackend || testing || loading}>
                                    {savingBackend && !testing ? "Saving…" : "Save backend settings"}
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={runTest}
                                    disabled={testing || savingBackend || loading}
                                    className="gap-1.5"
                                >
                                    {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                    {testing ? "Testing…" : "Save & test"}
                                </Button>
                            </div>

                            {testResult && (
                                <div
                                    className={cn(
                                        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                                        testResult.ok
                                            ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
                                            : "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
                                    )}
                                    role="status"
                                >
                                    {testResult.ok ? (
                                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                                    ) : (
                                        <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    )}
                                    <span>{testResult.message}</span>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}
