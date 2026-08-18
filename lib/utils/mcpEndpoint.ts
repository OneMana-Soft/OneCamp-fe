/**
 * The MCP connection details, derived rather than written down.
 *
 * OneCamp exposes itself as an MCP server at a single JSON-RPC endpoint, and until now the only
 * place that URL existed was docs/MCPServer.md in the repository. An admin could enable the surface
 * and a user could mint a token, and neither was ever told where to send it — which for a
 * self-hosted product means the last step of the setup lives somewhere the operator never looks.
 *
 * DERIVED FROM THE SAME BASE URL AXIOS USES, so it cannot drift from the instance actually being
 * administered. Hardcoding a copy of the host in a component would be wrong the first time someone
 * ran a second deployment, and wrong silently, in a block of text people copy without reading.
 *
 * Pure functions taking the base explicitly, so the shapes below are testable without a browser and
 * without an environment.
 */

import { apiUrl } from "@/lib/utils/apiUrl"

/** Shown in place of a real credential where none is available. Matches docs/MCPServer.md. */
export const MCP_TOKEN_PLACEHOLDER = "oc_your_token_here"

/** The JSON-RPC path, relative to the API root. */
const MCP_PATH = "v1/mcp"

/**
 * The JSON-RPC endpoint, absolute.
 *
 * The trailing-slash normalisation this used to perform inline now lives in lib/utils/apiUrl, because
 * the SCIM card needed exactly the same thing and copied it — which is how the rule this function's
 * comment set out ("instead of being a detail each caller has to remember") stopped being one. Same
 * behaviour, one implementation; the tests below still pass unchanged.
 */
export function mcpEndpointUrl(base?: string): string {
  return apiUrl(MCP_PATH, base)
}

/**
 * The `mcpServers` block for a client that reads a config file (Claude Desktop, Cursor, ...).
 *
 * Two spaces of indentation and a trailing newline, because this is pasted into a JSON file rather
 * than read on screen.
 *
 * @param token the real credential when one is available — only at the moment a token is created,
 *   since only a hash is stored afterwards. Falls back to an obvious placeholder.
 */
export function mcpClientConfig(
  token: string = MCP_TOKEN_PLACEHOLDER,
  base?: string,
): string {
  const url = mcpEndpointUrl(base)
  const config = {
    mcpServers: {
      onecamp: {
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  }
  return `${JSON.stringify(config, null, 2)}\n`
}

/**
 * A one-line request that proves the connection, for a reader who would rather check than configure.
 *
 * tools/list rather than initialize: the server keeps no session state, so there is nothing to
 * establish first, and tools/list is the call whose answer is actually informative — an empty list
 * is the signature of a surface that is off or a token with no scopes.
 */
export function mcpCurlExample(
  token: string = MCP_TOKEN_PLACEHOLDER,
  base?: string,
): string {
  const url = mcpEndpointUrl(base)
  return [
    `curl -s ${url} \\`,
    `  -H "Authorization: Bearer ${token}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  ].join("\n")
}
