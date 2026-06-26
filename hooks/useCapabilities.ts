import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";

interface CapabilitiesResponse {
    data: Record<string, boolean>;
}

/**
 * useCapabilities exposes the current user's resolved capability set and a
 * `can(capability)` helper for gating UI.
 *
 * It revalidates (on mount + throttled focus) rather than fetching once per
 * session: an admin can flip a capability policy at any time, and a deploy can
 * add a new capability, so a session-frozen snapshot would leave the UI showing
 * a stale gate until a hard reload. The backend caches policies (short TTL) so
 * the extra revalidation is cheap; dedupingInterval keeps repeated mounts off
 * the network. Fails closed: while loading or on error, `can` returns false.
 */
export function useCapabilities() {
    const { data, isLoading, isError, mutate } = useFetch<CapabilitiesResponse>(
        GetEndpointUrl.MyCapabilities,
        undefined,
        { dedupingInterval: 15_000 },
    );

    const caps = data?.data || {};
    const can = (capability: string): boolean => caps[capability] === true;

    return { caps, can, isLoading, isError, mutate };
}
