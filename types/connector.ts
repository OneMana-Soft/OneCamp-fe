// Per-user connector types (Gmail, Google Calendar, GitHub). These mirror the
// backend connectorStatusView. Secrets/tokens are never exposed to the FE — the
// only state surfaced is whether the user has connected each provider.

export interface ConnectorPermission {
    capability: "read" | "write"
    description: string
}

export interface ConnectorStatus {
    id: string
    name: string
    description: string
    icon_key: string
    permissions: ConnectorPermission[]
    connected: boolean
}
