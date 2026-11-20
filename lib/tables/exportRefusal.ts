import { apiErrorStatus } from "@/lib/utils/apiError"
import { unprocessableReason } from "@/lib/tables/unprocessable"

/**
 * A refused workbook's words: the server's (a 422: a formula or a rollup it
 * can't work out over every row yet, or more than a workbook holds), or gone
 * for a 404; undefined for a failure to try again. The workbook was asked for
 * as a file, so a refusal came as one: its words are read back here, lazily,
 * and never in the shared download helper, whose new chunk every page would
 * carry. One table's export (exportRows) and every table's (exportAll) say
 * their refusals through it.
 */
export async function refusalOf(thrown: unknown, gone?: string): Promise<string | undefined> {
  const e = await import("@/lib/utils/downloadRefusal").then(({ withItsWords }) => withItsWords(thrown), () => thrown).catch((x: unknown) => x)
  return apiErrorStatus(e) === 404 && gone ? gone : unprocessableReason(e)
}
