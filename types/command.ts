// Types for the user-facing slash command framework. These mirror the Go
// adapter/Command DTOs and the Slack-compatible Block Kit subset so the
// composer typeahead and interactive cards stay in lockstep with the backend.

export interface CatalogCommand {
    command: string          // canonical name without leading slash, e.g. "remind"
    description: string
    usage_hint?: string
    app_slug?: string
    app_name?: string
    icon_url?: string
    is_builtin: boolean
}

export interface CatalogResponse {
    commands: CatalogCommand[]
}

// --- Block Kit (Slack-compatible subset) ---

export interface BlockText {
    type: "plain_text" | "mrkdwn"
    text: string
}

export interface BlockOption {
    text: string
    value: string
}

export interface BlockElement {
    type: "button" | "select"
    text?: BlockText
    action_id: string
    value?: string
    style?: "default" | "primary" | "danger"
    url?: string
    options?: BlockOption[]
}

export interface Block {
    type: "section" | "divider" | "header" | "context" | "image" | "actions"
    text?: BlockText
    fields?: BlockText[]
    image_url?: string
    alt_text?: string
    title?: BlockText
    elements?: BlockElement[]
    block_id?: string
}

// ClientAction is a typed directive the FE performs for navigation/display/
// composer commands (set_composer, open_search, toggle_media, open_dm, ...).
export interface ClientAction {
    type: string
    payload?: Record<string, string>
}

export interface CommandResponse {
    response_type: "ephemeral" | "in_channel"
    text?: string
    blocks?: Block[]
    trigger_id?: string
    replace_original?: boolean
    ephemeral?: boolean
    client_action?: ClientAction
    preload_urls?: string[]
}

export interface ExecuteCommandRequest {
    command: string
    text: string
    channel_id?: string
    dm_group_id?: string
    thread_ts?: string
    timezone?: string
    trigger_id?: string
}

export interface InteractRequest {
    trigger_id: string
    action_id: string
    value?: string
    command?: string
    state?: Record<string, string>
    channel_id?: string
    dm_group_id?: string
}
