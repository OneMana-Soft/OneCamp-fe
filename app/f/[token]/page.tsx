"use client"

// A public intake form (work.md W46): anyone with the link answers it, page
// by page, and what they send becomes a task for the team that shared it. No
// account needed. The pages (components/forms/FormPages) are a chunk fetched
// with the form's questions, so the link's first load is the frame and the
// wait. Design v3: the frame with the form's light at the top, one card.

import dynamic from "next/dynamic"
import { use, useEffect, useState } from "react"
import { Loader2 } from "@/lib/icons"
import { PublicGone } from "@/components/guest/publicStates"
import { publicTrouble } from "@/services/publicApi"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { formHue } from "@/lib/forms/forms"
import { formPicture, getForm, sendForm, type PublicForm } from "@/services/formService"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"

const pages = () => import("@/components/forms/FormPages")
const FormPages = dynamic(() => pages().then((m) => m.FormPages), { ssr: false, loading: () => <Waiting /> })

export default function IntakeForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [form, setForm] = useState<PublicForm | null>(null)
  // The link's query, read once with the form: its prefill_ answers start the form (tables B5b).
  const [prefill, setPrefill] = useState("")
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading")
  // Bumped by Try again, to read the form again.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    void pages()
    getForm(token).then((res) => {
      if (res.ok) {
        setPrefill(window.location.search)
        // Its cover and logo are paths on the server: drawn from there.
        setForm({ ...res.data, cover: formPicture(res.data.cover), logo: formPicture(res.data.logo) })
        setState("ready")
        document.title = res.data.title
      } else {
        // A busy or unreachable server isn't a closed form: it says so, with Try again.
        setState(publicTrouble(res.status) === "gone" ? "missing" : "failed")
      }
    })
  }, [token, attempt])

  if (state === "loading") return <main className="flex min-h-dvh w-full items-center justify-center bg-frame px-4"><Waiting /></main>
  if (state === "failed") {
    return (
      <PublicGone
        surface="form"
        noun="form"
        kind="failed"
        onRetry={() => {
          setState("loading")
          setAttempt((n) => n + 1)
        }}
      />
    )
  }
  if (state === "missing" || !form) {
    // As every public link says it (PublicGone): it was a lone grey ring with no frame (PTC-19).
    return <PublicGone surface="form" noun="form" detail="The link may be wrong, or the team has closed the form." />
  }
  const hue = formHue(form.title, token)
  return (
    <main className={`${HUE_CLASS[hue]} relative isolate min-h-dvh bg-frame px-4 py-8 sm:py-14`}>
      <div aria-hidden="true" data-form-band="" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[260px] [background:radial-gradient(560px_240px_at_50%_0px,color-mix(in_oklab,var(--hue)_12%,transparent),transparent)]" />
      <FormPages form={form} hue={hue} token={token} prefill={prefill} onSend={async (answers, website, claim) => {
        const res = await sendForm(token, answers, website, claim)
        return res.ok ? "" : res.msg
      }} />
      <MadeWithOneCamp surface="form" className="mt-6" />
    </main>
  )
}

function Waiting() {
  return <Loader2 className="mx-auto my-16 block size-7 animate-spin text-ink-3" aria-label="Opening the form" />
}
