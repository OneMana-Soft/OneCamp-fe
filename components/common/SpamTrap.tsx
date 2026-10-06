"use client"

/**
 * A field people never see and bots fill: the public pages (intake forms,
 * booking pages) send its value, and the server drops any request that filled
 * it. Off-screen rather than display:none, which some bots skip; untabbable,
 * hidden from assistive tech, and marked so automated checks know to leave it.
 */
export function SpamTrap({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden" data-spam-trap>
      <label htmlFor={id}>Website</label>
      <input id={id} name="website" tabIndex={-1} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
