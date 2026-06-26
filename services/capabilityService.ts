import axiosInstance from "@/lib/axiosInstance";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";

/**
 * Generic capability-permission client. Capabilities (create workflows, invite
 * members, …) are either admins_only or all_members; admins set the policy in
 * workspace Settings. The FE uses MyCapabilities to show/hide gated features.
 */

// Stable capability keys (mirror the backend constants).
export const CAP_WORKFLOW_MANAGE = "workflow.manage";
export const CAP_INVITATION_CREATE = "invitation.create";
export const CAP_AGENT_MANAGE = "agent.manage";

export type CapabilityPolicyValue = "admins_only" | "all_members";

export interface CapabilityPolicy {
    capability: string;
    policy: CapabilityPolicyValue;
    updated_by?: string | null;
    updated_at: string;
}

// Human labels + descriptions for the admin Settings UI. Only capabilities the
// backend actually enforces appear here (the backend catalog is the source of
// truth — listCapabilityPolicies returns only wired capabilities).
export const CAPABILITY_META: Record<string, { label: string; description: string }> = {
    [CAP_WORKFLOW_MANAGE]: {
        label: "Create workflows",
        description: "Let members build their own automation workflows (when X happens, do Y).",
    },
    [CAP_INVITATION_CREATE]: {
        label: "Invite people",
        description: "Let members invite new people to the workspace by email.",
    },
    [CAP_AGENT_MANAGE]: {
        label: "Build AI agents",
        description: "Let members create AI agents that use tools to do work in the workspace.",
    },
};

// MyCapabilities returns the current user's capability → allowed map.
export async function getMyCapabilities(): Promise<Record<string, boolean>> {
    const res = await axiosInstance.get(GetEndpointUrl.MyCapabilities);
    return (res.data?.data as Record<string, boolean>) || {};
}

// Admin: list all capability policies.
export async function listCapabilityPolicies(): Promise<CapabilityPolicy[]> {
    const res = await axiosInstance.get(GetEndpointUrl.GetCapabilityPolicies);
    return (res.data?.data as CapabilityPolicy[]) || [];
}

// Admin: set a capability policy.
export async function setCapabilityPolicy(
    capability: string,
    policy: CapabilityPolicyValue,
): Promise<void> {
    await axiosInstance.post(PostEndpointUrl.SetCapabilityPolicy, { capability, policy });
}
