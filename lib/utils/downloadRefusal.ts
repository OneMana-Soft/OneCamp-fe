/**
 * Throws a failed download's error with its answer read back to the server's
 * own: an answer asked for as a file comes back as one when the server
 * refuses too, so the JSON it holds (msg, code) is read from it, for
 * refusalReason and the rest to read as they read any answer. One that holds
 * no JSON object (a proxy's page), or can't be read, stays as it came. Read
 * only when a download fails (downloadFrom), never with a page's first load.
 */
export async function withItsWords(error: unknown): Promise<never> {
  const response = (error as { response?: { data?: unknown } } | null)?.response
  const file = response?.data as { text?: unknown } | null | undefined
  if (response && typeof file?.text === "function") {
    try {
      const read: unknown = JSON.parse(await (file as Blob).text())
      if (typeof read === "object" && read !== null) response.data = read
    } catch {
      // Not the server's JSON: the answer stays as it came.
    }
  }
  throw error
}
