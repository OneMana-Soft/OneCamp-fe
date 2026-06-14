// Stub: capabilityService — capability/permissions system not available in this build.

export const CAP_WORKFLOW_MANAGE = "workflow_manage"
export const CAP_INVITATION_CREATE = "invitation_create"

export type CapabilityPolicy = {
    capability: string
    label: string
    description: string
    member_allowed: boolean
    policy: string
}

export const CAPABILITY_META: Record<string, { label: string; description: string }> = {
    [CAP_WORKFLOW_MANAGE]: {
        label: "Manage workflows",
        description: "Allow members to create and manage automation workflows.",
    },
    [CAP_INVITATION_CREATE]: {
        label: "Invite members",
        description: "Allow members to invite others to the workspace.",
    },
}

export async function listCapabilityPolicies(): Promise<CapabilityPolicy[]> {
    return []
}

export async function setCapabilityPolicy(_capability: string, _policy: string): Promise<void> {
    // no-op in public build
}
