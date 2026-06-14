import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";

interface CapabilitiesResponse {
    data: Record<string, boolean>;
}

/**
 * useCapabilities exposes the current user's resolved capability set and a
 * `can(capability)` helper for gating UI. Fetched once per session (policies
 * change rarely; the backend caches them too). Fails closed: while loading or
 * on error, `can` returns false so a gated entry is hidden rather than flashing
 * in and then 403-ing.
 */
export function useCapabilities() {
    const { data, isLoading, isError, mutate } = useFetchOnlyOnce<CapabilitiesResponse>(
        GetEndpointUrl.MyCapabilities,
    );

    const caps = data?.data || {};
    const can = (capability: string): boolean => caps[capability] === true;

    return { caps, can, isLoading, isError, mutate };
}
