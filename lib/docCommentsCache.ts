import { GetEndpointUrl } from "@/services/endPoints"

/**
 * The cached answer the old flat comment list was read from. Since B7 a doc's
 * comments are read as threads (components/threads, the threads store), so
 * nothing asks for this answer; lib/docCache still corrects it after a rename,
 * a restore and a share, which does nothing now (C12 may drop those lines).
 */
export const docCommentsKey = (docId: string) => `${GetEndpointUrl.GetAllCommentOfDoc}/${docId}`
