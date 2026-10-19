/**
 * The client config's place in the app's cache: what this server has (AI,
 * calls…), its upload limit and transcription mode. A module of its own so
 * the cache that keeps it for the next load (lib/swrCache) needn't import the
 * hook that reads it.
 */
export const CLIENT_CONFIG_KEY = "client-config"
