import { DEFAULT_CONFIG, type ClientConfig } from "@/hooks/useClientConfig"
import { CLIENT_CONFIG_KEY } from "@/lib/clientConfigKey"
import { cachedData } from "@/lib/swrMutate"

/**
 * The client config as last read, or its defaults until the server answers:
 * for code outside React (Docs & Files' uploads). A module of its own because
 * lib/swrMutate is 5.5 KB of source, and every route reaches the hooks.
 */
export function clientConfigNow(): ClientConfig {
  return cachedData<ClientConfig>(CLIENT_CONFIG_KEY) ?? DEFAULT_CONFIG
}
