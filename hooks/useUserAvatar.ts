import { useMemo } from "react";
import { useMediaFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import type { GetMediaURLRes } from "@/types/file";

/**
 * Smart avatar hook that handles both internal S3/Minio profile keys
 * and external URLs (e.g. GitHub avatars) without hitting /getFile/.
 */
export function useUserAvatar(profileKey?: string | null) {
    const isExternalURL =
        typeof profileKey === "string" &&
        (profileKey.startsWith("http://") || profileKey.startsWith("https://"));

    const internalMediaURL = useMemo(() => {
        if (!profileKey || isExternalURL) return "";
        return GetEndpointUrl.PublicAttachmentURL + "/" + profileKey;
    }, [profileKey, isExternalURL]);

    const mediaRes = useMediaFetch<GetMediaURLRes>(internalMediaURL);

    const imageSrc = useMemo(() => {
        if (isExternalURL) return profileKey;
        return mediaRes.data?.url;
    }, [isExternalURL, profileKey, mediaRes.data?.url]);

    return {
        src: imageSrc,
        isExternalURL,
        isLoading: mediaRes.isLoading,
    };
}
