/**
 * The workspace's upload limit, as its client config says (useClientConfig):
 * one cap for every file a doc takes (N27), checked before anything is sent.
 * Kept here by the doc's overlay, which reads the config; null until it has.
 */
let current: { bytes: number; mb: number } | null = null

export function setUploadLimit(limit: { bytes: number; mb: number } | null) {
  current = limit && limit.bytes > 0 ? limit : null
}

export const uploadLimitNow = () => current
