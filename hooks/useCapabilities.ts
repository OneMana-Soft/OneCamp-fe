import { useCallback } from "react";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";

const NO_CAPS: Record<string, boolean> = {};

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

    // The same `caps` and `can` until the answer changes. A new `can` on every
    // render made everything memoised on it rebuild each time: the command
    // palette rebuilt all of its commands on every keystroke.
    const caps = data?.data ?? NO_CAPS;
    const can = useCallback((capability: string): boolean => caps[capability] === true, [caps]);

    return { caps, can, isLoading, isError, mutate };
}
