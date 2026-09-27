import { PostEndpointUrl } from "@/services/endPoints";
import { usePost } from "@/hooks/usePost";
import { useCallback } from "react";

interface AnalyzeImageResponse {
    description: string;
}

/**
 * Hook for analyzing an image attachment with the configured vision model.
 * The caller passes identifiers it already holds from the rendered message
 * (attachment uuid + its source); the user never provides an id. Access is
 * enforced server-side. Returns undefined and surfaces a toast on failure
 * (e.g. no vision model configured, or no access).
 */
export const useAnalyzeImage = () => {
    const { makeRequest, isSubmitting } = usePost();

    const analyzeImage = useCallback(
        async (
            objUuid: string,
            srcKey: string,
            srcRef: string,
            prompt?: string,
        ): Promise<AnalyzeImageResponse | undefined> => {
            return makeRequest<
                { obj_uuid: string; src_key: string; src_ref: string; prompt?: string },
                AnalyzeImageResponse
            >({
                apiEndpoint: PostEndpointUrl.AIAnalyzeImage,
                payload: { obj_uuid: objUuid, src_key: srcKey, src_ref: srcRef, prompt },
                showToast: true,
            });
        },
        [makeRequest],
    );

    return { analyzeImage, isSubmitting };
};

/**
 * Hook for reading a document attachment with AI (DOCX / text-family): returns
 * a summary, or an answer to an optional prompt. Same identifier + access model
 * as useAnalyzeImage; the server sniffs the format and enforces access. The
 * `description` field carries the answer (shared response shape with images).
 */
export const useAnalyzeDocument = () => {
    const { makeRequest, isSubmitting } = usePost();

    const analyzeDocument = useCallback(
        async (
            objUuid: string,
            srcKey: string,
            srcRef: string,
            prompt?: string,
        ): Promise<AnalyzeImageResponse | undefined> => {
            return makeRequest<
                { obj_uuid: string; src_key: string; src_ref: string; prompt?: string },
                AnalyzeImageResponse
            >({
                apiEndpoint: PostEndpointUrl.AIAnalyzeDocument,
                payload: { obj_uuid: objUuid, src_key: srcKey, src_ref: srcRef, prompt },
                showToast: true,
            });
        },
        [makeRequest],
    );

    return { analyzeDocument, isSubmitting };
};

interface TranslateResponse {
    translation: string;
}

export const useTranslateText = () => {
    const { makeRequest, isSubmitting } = usePost();

    const translateText = useCallback(
        async (text: string, targetLanguage?: string): Promise<TranslateResponse | undefined> => {
            return makeRequest<
                { text: string; target_language?: string },
                TranslateResponse
            >({
                apiEndpoint: PostEndpointUrl.AITranslate,
                payload: { text, target_language: targetLanguage },
                showToast: true,
            });
        },
        [makeRequest],
    );

    return { translateText, isSubmitting };
};
