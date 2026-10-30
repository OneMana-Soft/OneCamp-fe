import { fetchFile } from "@/lib/http/fetchFile"

/**
 * A file's bytes as a data URL, read from its address (lib/http/fetchFile:
 * with the session when the file is the API's); null when they can't be read
 * (an answer that isn't the file, such as a 404 page, or no answer). A data
 * URL is one already.
 */
export async function urlToDataURL(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url
  const blob = await fetchFile(url)
  if (!blob) return null
  return new Promise<string | null>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => resolve(null)
    r.readAsDataURL(blob)
  })
}
