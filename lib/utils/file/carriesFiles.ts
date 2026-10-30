/** Whether a drag carries files from outside the page (not a row being moved, or text). */
export const carriesFiles = (e: { dataTransfer?: { types?: ArrayLike<string> | readonly string[] } | null }) =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files")
