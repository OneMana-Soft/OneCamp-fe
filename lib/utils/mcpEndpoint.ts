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

/**
 * How to connect an agent, by URL and sign-in. Model-agnostic on purpose:
 * the first recipe is any MCP client on any model (local Ollama included),
 * and the named ones are the clients people ask about most.
 *
 * Since the server speaks OAuth, a client that can sign in needs no token:
 * the person approves it in OneCamp as an agent they sponsor. Menu paths checked against each vendor's own documentation in
 * September 2026; kept here, next to the URL they use, so a changed path is
 * one edit.
 */
interface MCPConnectRecipe {
  id: string
  name: string
  steps: string[]
  /** Something to paste, when the client takes one. */
  snippet?: string
}

export function mcpConnectRecipes(base?: string): MCPConnectRecipe[] {
  const url = mcpEndpointUrl(base)
  return [
    {
      id: "any",
      name: "Any MCP client",
      steps: [
        "OneCamp works with any agent that speaks MCP, on any model: a local one on Ollama or LM Studio, OpenAI, Anthropic, or your own. Point it at the address below.",
        "If the client can sign in (OAuth), it opens OneCamp to approve it as an agent you sponsor. If it can only send a header, make a token in Settings, API tokens, bind it to an agent, and send it as Authorization: Bearer.",
        "Open-source clients that work this way include Open WebUI, goose and ollmcp.",
      ],
      snippet: url,
    },
    {
      id: "open-webui",
      name: "Open WebUI (Ollama)",
      steps: [
        "In Settings, Admin, Integrations, under External Tool Servers, choose + Add Connection.",
        "Set Type to MCP (Streamable HTTP), paste the address below, and pick OAuth 2.1. Save, then choose Authorize OAuth and approve it in OneCamp.",
        "Set WEBUI_SECRET_KEY on the Open WebUI container first, or the sign-in is lost on every restart.",
      ],
      snippet: url,
    },
    {
      id: "claude",
      name: "Claude & Cowork",
      steps: [
        "In Claude, open Customize, then Connectors, then + and Add custom connector. On Team and Enterprise an Owner adds it once under Organization settings, Connectors.",
        "Name it OneCamp and paste the URL below. Leave the OAuth fields empty.",
        "Click Connect and approve it in OneCamp. Claude, Cowork and the desktop app share it.",
      ],
      snippet: url,
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      steps: [
        "In Settings, Apps & Connectors, Advanced settings, turn on Developer mode. On Business and Enterprise an admin enables custom connectors first.",
        "In Settings, Apps & Connectors, choose Create. Name it OneCamp, paste the URL below and pick OAuth.",
        "Sign in when asked and approve it in OneCamp.",
      ],
      snippet: url,
    },
    {
      id: "grok",
      name: "Grok Bot",
      steps: [
        "Message your bot the line below, or add a Custom connector at grok.com/connectors.",
        "Confirm the name and address, then sign in from the connect card and approve it in OneCamp. Every bot on your account can use it.",
      ],
      snippet: `Add a custom MCP server called OneCamp at ${url}`,
    },
    {
      id: "claude-code",
      name: "Claude Code",
      steps: ["Run the line below, then /mcp in Claude Code to sign in and approve it in OneCamp."],
      snippet: `claude mcp add --transport http onecamp ${url}`,
    },
    {
      id: "cursor",
      name: "Cursor",
      steps: ["Add this to .cursor/mcp.json (or your global mcp.json). Cursor asks you to sign in the first time a tool is used."],
      snippet: `${JSON.stringify({ mcpServers: { onecamp: { url } } }, null, 2)}\n`,
    },
  ]
}
