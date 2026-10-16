// Types for the admin app platform (third-party integrations + slash commands).
// Mirrors the Go adapter/Command app DTOs. Secrets are never present here —
// only has_* booleans — matching the AI-provider convention.

export interface AppCommandView {
    id: string
    command: string
    description: string
    usage_hint?: string
    exec_mode: string
    response_type: string
    is_enabled: boolean
}

export interface AppView {
    id: string
    slug: string
    name: string
    description?: string
    icon_url?: string
    kind: "builtin" | "external" | "oauth"
    handler_url?: string
    has_signing_secret: boolean
    has_oauth_config: boolean
    has_api_key?: boolean
    /** An OAuth app's saved settings, without the client secret: what its form edits. */
    oauth?: AppOAuthSettings
    /** A client secret is stored (never its value). */
    has_client_secret?: boolean
    secret_keys?: string[]
    is_enabled: boolean
    is_connected: boolean
    commands: AppCommandView[]
    created_at?: string
    updated_at?: string
}

/** An OAuth app's configuration without its client secret, as the server keeps and shows it. */
export interface AppOAuthSettings {
    client_id: string
    auth_url: string
    token_url: string
    scopes?: string[] | null
}

export interface AppOAuthConfig extends AppOAuthSettings {
    client_secret?: string
}

export interface AppCommandInput {
    command: string
    description: string
    usage_hint?: string
    exec_mode?: string
    response_type?: string
    handler_url?: string
    scope_type?: string
    scope_entity_id?: string
}

export interface CreateAppRequest {
    slug: string
    name: string
    description?: string
    icon_url?: string
    kind: "external" | "oauth"
    handler_url?: string
    signing_secret?: string
    oauth_config?: AppOAuthConfig
    config?: Record<string, string>
    secrets?: Record<string, string>
    commands?: AppCommandInput[]
}

export interface UpdateAppRequest {
    name?: string
    description?: string
    icon_url?: string
    handler_url?: string
    signing_secret?: string
    is_enabled?: boolean
    oauth_config?: AppOAuthConfig
    config?: Record<string, string>
    secrets?: Record<string, string>
    commands?: AppCommandInput[]
}

// ─── Curated marketplace (one-click install) ───────────────────────────────

export interface SetupField {
    key: string
    label: string
    type: "secret" | "handler_url" | "oauth_cred"
    required: boolean
}

export interface MarketplaceItem {
    slug: string
    name: string
    description: string
    category: string
    icon_url?: string
    kind: "external" | "oauth"
    featured: boolean
    commands: string[]
    setup?: SetupField[]
    setup_note?: string
    // per-workspace state
    installed: boolean
    enabled: boolean
    needs_setup: boolean
    is_connected: boolean
    app_id?: string
}
