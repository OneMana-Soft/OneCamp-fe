"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/helpers/cn'
import { isSafeHref } from '@/lib/utils/safeHref'

interface LinkEditorProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultUrl?: string
  defaultText?: string
  defaultIsNewTab?: boolean
  onSave: (url: string, text?: string, isNewTab?: boolean) => void
}

export const LinkEditBlock = React.forwardRef<HTMLDivElement, LinkEditorProps>(
  ({ onSave, defaultIsNewTab, defaultUrl, defaultText, className }, ref) => {
    const formRef = React.useRef<HTMLDivElement>(null)
    const urlRef = React.useRef<HTMLInputElement>(null)
    const [url, setUrl] = React.useState(defaultUrl || '')
    const [text, setText] = React.useState(defaultText || '')
    const [isNewTab, setIsNewTab] = React.useState(defaultIsNewTab || false)

    const handleSave = React.useCallback(
      (e: React.FormEvent) => {
        e.preventDefault()
        // A type="url" field accepts any scheme, "javascript:" too.
        urlRef.current?.setCustomValidity(!url || isSafeHref(url) ? '' : 'Use a web (https://), email (mailto:) or phone (tel:) link')
        if (formRef.current) {
          const isValid = Array.from(formRef.current.querySelectorAll('input')).every(input => input.checkValidity())

          if (isValid) {
            onSave(url, text, isNewTab)
          } else {
            formRef.current.querySelectorAll('input').forEach(input => {
              if (!input.checkValidity()) {
                input.reportValidity()
              }
            })
          }
        }
      },
      [onSave, url, text, isNewTab]
    )

    React.useImperativeHandle(ref, () => formRef.current as HTMLDivElement)

    return (
      <div ref={formRef}>
        <div className={cn('space-y-3', className)}>
          <div className="space-y-1">
            <Label className="text-meta font-medium text-ink-2">Link</Label>
            <Input
              ref={urlRef}
              type="url"
              required
              placeholder="https://"
              dense
              value={url}
              onChange={e => {
                e.target.setCustomValidity('')
                setUrl(e.target.value)
              }}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-meta font-medium text-ink-2">Text</Label>
            <Input dense type="text" placeholder="What the link says" value={text} onChange={e => setText(e.target.value)} />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-ui-sm text-ink-2">Open in a new tab</Label>
            <Switch checked={isNewTab} onCheckedChange={setIsNewTab} />
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    )
  }
)

LinkEditBlock.displayName = 'LinkEditBlock'

