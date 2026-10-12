import { Callout } from '@/components/minimal-tiptap/extensions/callout/callout'
import { Collapsible } from '@/components/minimal-tiptap/extensions/collapsible/collapsible'
import { TableEmbed } from '@/components/minimal-tiptap/extensions/table-embed/table-embed'
import { BlockHandle } from '@/components/minimal-tiptap/extensions/block-handle'
import { ClickToCreateBlock } from '@/components/minimal-tiptap/extensions/click-to-create-block'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'

/**
 * What the doc editor adds to the shared editor extensions. A module constant
 * (it has no inputs), so the schema manifest test builds the doc's schema from
 * this exact list: every node or mark here must also exist on the
 * collaboration server, or a doc holding it cannot be saved
 * (minimal-tiptap/schemaManifest.test.ts).
 */
export const DOC_EXTRA_EXTENSIONS = [
    Callout,
    Collapsible,
    TableEmbed,
    BlockHandle,
    ClickToCreateBlock,
    TaskList.configure({
        HTMLAttributes: {
            class: 'task-list',
        },
    }),
    TaskItem.configure({
        HTMLAttributes: {
            class: 'task-item',
        },
        nested: true,
    }),
]
