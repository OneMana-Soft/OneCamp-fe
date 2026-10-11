import { notFound } from "next/navigation"

/**
 * Any /app address no route answers. Next would otherwise draw the root 404,
 * outside the shell, and a signed-in person lost their sidebar on a bad link;
 * notFound() here renders app/app/not-found.tsx inside it (design v3, §L4).
 */
export default function MissingAppPage() {
  notFound()
}
