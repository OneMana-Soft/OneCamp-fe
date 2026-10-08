import { redirect } from "next/navigation"

// Goals are a view of the Projects page; /app/goals is where people look first.
export default function Page() {
  redirect("/app/project?view=goals")
}
