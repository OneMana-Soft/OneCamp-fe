// The TLS front of the COOKIE-SCOPE e2e (run.sh): one HTTPS port for every
// *.ws.test host, as the edge is for Cloud workspaces on onemana.dev. A
// workspace's web host goes to the one production build (next start), with the
// build's placeholder addresses rewritten to that workspace's own, so one build
// serves two workspaces; its API host goes to that workspace's API process.
//
// Env: PROXY_PORT, WEB_PORT, API_PORTS ({"acme":18101,...}), TLS_KEY, TLS_CERT.

import { readFileSync } from "node:fs"
import { request } from "node:http"
import { createServer } from "node:https"

const PORT = Number(process.env.PROXY_PORT || 8443)
const WEB_PORT = Number(process.env.WEB_PORT || 3107)
const API_PORTS = JSON.parse(process.env.API_PORTS || "{}")

// What the build was made with (run.sh), and what each host's copy says instead.
const PLACEHOLDER_API = "https://ws-api.placeholder.test:8443/"
const PLACEHOLDER_WEB = "https://ws-web.placeholder.test:8443"
const TEXT = /^(text\/|application\/(javascript|json)|text\/x-component)/

/** Where a host goes: { port, workspace } for its web host, { port } for its API host. */
function route(hostHeader) {
  const host = String(hostHeader || "").split(":")[0]
  const m = /^([a-z0-9]+)(-api)?\.ws\.test$/.exec(host)
  if (!m || !(m[1] in API_PORTS)) return null
  return m[2] ? { port: API_PORTS[m[1]] } : { port: WEB_PORT, workspace: m[1] }
}

function rewrite(body, workspace) {
  return body
    .replaceAll(PLACEHOLDER_API, `https://${workspace}-api.ws.test:${PORT}/`)
    .replaceAll(PLACEHOLDER_WEB, `https://${workspace}.ws.test:${PORT}`)
}

const server = createServer({ key: readFileSync(process.env.TLS_KEY), cert: readFileSync(process.env.TLS_CERT) }, (req, res) => {
  const to = route(req.headers.host)
  if (!to) {
    res.writeHead(421).end()
    return
  }
  const headers = { ...req.headers, "x-forwarded-proto": "https", "x-forwarded-host": req.headers.host }
  if (to.workspace) headers["accept-encoding"] = "identity"
  const upstream = request({ host: "127.0.0.1", port: to.port, method: req.method, path: req.url, headers }, (up) => {
    if (!to.workspace || !TEXT.test(String(up.headers["content-type"] || ""))) {
      res.writeHead(up.statusCode || 502, up.headers)
      up.pipe(res)
      return
    }
    const chunks = []
    up.on("data", (c) => chunks.push(c))
    up.on("end", () => {
      const out = Buffer.from(rewrite(Buffer.concat(chunks).toString("utf8"), to.workspace), "utf8")
      const h = { ...up.headers }
      for (const k of ["content-length", "content-encoding", "transfer-encoding", "etag"]) delete h[k]
      h["content-length"] = String(out.length)
      res.writeHead(up.statusCode || 502, h)
      res.end(out)
    })
  })
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502)
    res.end()
  })
  req.pipe(upstream)
})
// Realtime and calls (websockets) have nowhere to go in this test.
server.on("upgrade", (_req, socket) => socket.destroy())
server.listen(PORT, "127.0.0.1", () => console.log(`front on ${PORT}`))
