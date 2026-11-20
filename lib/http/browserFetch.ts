import axios, { type AxiosAdapter } from "axios"

/**
 * axios's fetch adapter, without the "User-Agent: axios/<version>" it writes
 * on every request (V-1086). Chromium drops that header; Firefox sends it, so
 * the CORS preflight asks for user-agent, which the API's allowed headers
 * don't list, and the request is refused before it leaves: on Firefox every
 * session refresh failed. Every request that wants fetch (a keepalive save,
 * the refresh) names this one, from any axios instance; the guard
 * (browserFetchGuard.test) keeps axios's own out of every other file. A false
 * header stays false: axios's set(..., false) leaves it, and the request
 * drops it.
 */
export const browserFetch: AxiosAdapter = (config) => {
  config.headers.set("User-Agent", false)
  return axios.getAdapter("fetch")(config)
}
