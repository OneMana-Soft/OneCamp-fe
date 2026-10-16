/**
 * A doc's owner lets it into the admins' workspace exports, or takes it out
 * (docs programme C4): a switch in the doc's More menu and its phone sheet, for
 * the owner of a doc that isn't open to the whole workspace, once its state has
 * been read (ConsentPrefetch reads it as the doc opens). The integrator adds
 * this module's line to registry/index.ts.
 */

import { FileArchive } from '@/lib/icons'
import { registerAction, registerSlot } from '@/components/docEditor/registry/registry'
import { knownConsent, toggleConsent } from './consent'

registerSlot({
  slot: 'session',
  id: 'doc-export-consent',
  edition: 'both',
  load: () => import('./ConsentPrefetch'),
})

registerAction({
  id: 'doc.exportConsent',
  label: 'Include in workspace exports',
  icon: FileArchive,
  group: 'export',
  surfaces: ['more', 'phoneSheet'],
  edition: 'both',
  isVisible: (ctx) => {
    const consent = knownConsent(ctx.docId)
    return !!consent?.owner && consent.private
  },
  isChecked: (ctx) => !!knownConsent(ctx.docId)?.allowed,
  run: (ctx) => toggleConsent(ctx.docId),
})
