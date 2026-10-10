"use client"

import * as React from 'react'
import type { Editor } from '@tiptap/react'
import type { FormatAction } from '../../types'
import type { toggleVariants } from '@/components/ui/toggle'
import type { VariantProps } from 'class-variance-authority'
import { ChevronDown, List, ListOrdered } from '@/lib/icons'
import { ToolbarSection } from '../toolbar-section'

type ListItemAction = 'orderedList' | 'bulletList'
interface ListItem extends FormatAction {
  value: ListItemAction
}

const formatActions: ListItem[] = [
  {
    value: 'orderedList',
    label: 'Numbered list',
    icon: <ListOrdered className="size-4" strokeWidth={1.75} />,
    isActive: editor => editor.isActive('orderedList'),
    action: editor => editor.chain().focus().toggleOrderedList().run(),
    canExecute: editor => editor.can().chain().toggleOrderedList().run(),
    shortcuts: ['mod', 'shift', '7']
  },
  {
    value: 'bulletList',
    label: 'Bullet list',
    icon: <List className="size-4" strokeWidth={1.75} />,
    isActive: editor => editor.isActive('bulletList'),
    action: editor => editor.chain().focus().toggleBulletList().run(),
    canExecute: editor => editor.can().chain().toggleBulletList().run(),
    shortcuts: ['mod', 'shift', '8']
  }
]

// Built once: ToolbarSection is memoised, and an icon or list made in render
// is a new prop every time, which re-rendered it anyway.
const DROPDOWN_ICON = (
  <>
    <List className="size-4" strokeWidth={1.75} />
    <ChevronDown className="size-4" strokeWidth={1.75} />
  </>
)
const ALL_ACTIONS = formatActions.map(action => action.value)

interface SectionFourProps extends VariantProps<typeof toggleVariants> {
  editor: Editor
  activeActions?: ListItemAction[]
  mainActionCount?: number
}

export const SectionFour: React.FC<SectionFourProps> = ({
  editor,
  activeActions = ALL_ACTIONS,
  mainActionCount = 0,
  size,
  variant
}) => {
  return (
    <ToolbarSection
      editor={editor}
      actions={formatActions}
      activeActions={activeActions}
      mainActionCount={mainActionCount}
      dropdownIcon={DROPDOWN_ICON}
      dropdownTooltip="Lists"
      size={size}
      variant={variant}
    />
  )
}

SectionFour.displayName = 'SectionFour'

