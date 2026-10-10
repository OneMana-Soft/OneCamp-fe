"use client"

import * as React from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorStateAfterPaint } from '../hooks/use-editor-state-after-paint'
import type { FormatAction } from '../types'
import type { VariantProps } from 'class-variance-authority'
import type { toggleVariants } from '@/components/ui/toggle'
import { cn } from '@/lib/utils/helpers/cn'
import { ChevronDown } from '@/lib/icons'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ToolbarButton } from './toolbar-button'
import { ShortcutKey } from './shortcut-key'
import { getShortcutKey } from '../utils'

interface ToolbarSectionProps extends VariantProps<typeof toggleVariants> {
  editor: Editor
  actions: FormatAction[]
  activeActions?: string[]
  mainActionCount?: number
  dropdownIcon?: React.ReactNode
  dropdownTooltip?: string
  dropdownClassName?: string
}

// Each action's state, two characters apiece in `actions` order: lit (1/0),
// then available (1/0). A string, so an unchanged toolbar compares equal.
const stateOf = (actions: FormatAction[], editor: Editor) =>
  actions.map(a => `${a.isActive(editor) ? 1 : 0}${a.canExecute(editor) ? 1 : 0}`).join('')

// Memoised, and it reads the editor after the keystroke's frame has painted
// (useEditorStateAfterPaint): a doc's toolbar re-rendered all five sections on
// every key, each asking every button whether its command could run, and that
// was the slowest work on the page while typing. A section now re-renders only
// when one of its buttons turns on or off, or becomes (un)available, a frame
// after the change. toolbarSection.test.tsx holds it.
export const ToolbarSection = React.memo(function ToolbarSection({
  editor,
  actions,
  activeActions,
  mainActionCount = 0,
  dropdownIcon,
  dropdownTooltip = 'More options',
  dropdownClassName = 'w-12',
  size,
  variant
}: ToolbarSectionProps) {
  const state = useEditorStateAfterPaint(editor, e => stateOf(actions, e)) ?? ''
  const lit = (action: FormatAction) => state[actions.indexOf(action) * 2] === '1'
  const available = (action: FormatAction) => state[actions.indexOf(action) * 2 + 1] !== '0'

  const { mainActions, dropdownActions } = React.useMemo(() => {
    const effectiveActiveActions = activeActions ?? actions.map(action => action.value)
    const sortedActions = actions
      .filter(action => effectiveActiveActions.includes(action.value))
      .sort((a, b) => effectiveActiveActions.indexOf(a.value) - effectiveActiveActions.indexOf(b.value))

    return {
      mainActions: sortedActions.slice(0, mainActionCount),
      dropdownActions: sortedActions.slice(mainActionCount)
    }
  }, [actions, activeActions, mainActionCount])

  const renderToolbarButton = (action: FormatAction) => (
    <ToolbarButton
      key={action.label}
      onClick={() => action.action(editor)}
      disabled={!available(action)}
      isActive={lit(action)}
      tooltip={`${action.label} ${action.shortcuts.map(s => getShortcutKey(s).symbol).join(' ')}`}
      aria-label={action.label}
      size={size}
      variant={variant}
    >
      {action.icon}
    </ToolbarButton>
  )

  const renderDropdownMenuItem = (action: FormatAction) => (
    <DropdownMenuItem
      key={action.label}
      onClick={() => action.action(editor)}
      disabled={!available(action)}
      className={cn('flex flex-row items-center justify-between gap-4', {
        'bg-accent': lit(action)
      })}
      aria-label={action.label}
    >
      <span className="grow">{action.label}</span>
      <ShortcutKey keys={action.shortcuts} />
    </DropdownMenuItem>
  )

  const isDropdownActive = dropdownActions.some(lit)

  return (
    <>
      {mainActions.map(renderToolbarButton)}
      {dropdownActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButton
              isActive={isDropdownActive}
              tooltip={dropdownTooltip}
              aria-label={dropdownTooltip}
              className={cn(dropdownClassName)}
              size={size}
              variant={variant}
            >
              {dropdownIcon || <ChevronDown className="size-4" strokeWidth={1.75} />}
            </ToolbarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-full">
            {dropdownActions.map(renderDropdownMenuItem)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
})
