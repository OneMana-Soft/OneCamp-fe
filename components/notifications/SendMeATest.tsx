"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { SettingRow, SettingsList, SettingsSection } from "@/components/ui/settingsSection"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { NotifyPost } from "@/services/endpoints/inbox.notify"
import { NotifyWhyPanel } from "@/components/notifications/NotifyWhyPanel"
import { failureOf, type NotifyState, type TestAnswer } from "@/lib/notifications/whyWords"

/**
 * Settings > Notifications' Test section (A4 H3), in the page's one lazy chunk
 * (components/notifications/KeywordsAndVipsCard's) with the panel it opens:
 * the page draws its place (its id and title) while the code comes.
 */
export function NotifyTestSection() {
  return (
    <SettingsSection id="notifications-test" title="Test" description="Check that notifications reach you, and see why or why not.">
      <SettingsList>
        <SettingRow label="Test notifications" controlId="notify_test" description="Sends one to your own devices now, and shows each step it took.">
          <SendMeATest id="notify_test" />
        </SettingRow>
      </SettingsList>
    </SettingsSection>
  )
}

/**
 * "Send me a test": one notice through the Notification Router to the
 * session's own devices (POST /notify/test, one a minute), and the panel says
 * each step it took. It says its own failures (the panel's words), so the
 * client's toast stays quiet.
 *
 * Permission model: any member, guests included, tests their own devices
 * only; the shared demo visitor is refused (its devices are every visitor's).
 */
export function SendMeATest({ id }: { id?: string }) {
  // The open panel's door: this button's element, or null while it is shut.
  const [door, setDoor] = React.useState<HTMLElement | null>(null)
  const [state, setState] = React.useState<NotifyState<TestAnswer>>({ status: "loading" })
  const panelId = React.useId()
  // Only the latest ask's answer is shown.
  const asked = React.useRef(0)
  const send = React.useCallback(() => {
    const n = ++asked.current
    setState({ status: "loading" })
    axiosInstance.post<TestAnswer>(NotifyPost.Test, {}, OWN_ERRORS).then(
      (res) => n === asked.current && setState({ status: "done", data: res.data }),
      (error) => n === asked.current && setState(failureOf(error)),
    )
  }, [])
  const close = React.useCallback(() => setDoor(null), [])
  return (
    <>
      <Button
        id={id}
        type="button"
        size="sm"
        variant="outline"
        aria-label="Send me a test"
        aria-describedby={id ? `${id}-desc` : undefined}
        aria-haspopup="dialog"
        aria-expanded={!!door}
        aria-controls={door ? panelId : undefined}
        onClick={(e) => {
          if (door) return close()
          setDoor(e.currentTarget)
          send()
        }}
      >
        Send me a test
      </Button>
      {door ? <NotifyWhyPanel kind="test" state={state} onAgain={send} door={door} id={panelId} onClose={close} /> : null}
    </>
  )
}
