/**
 * B5's contributions to the doc: an empty doc's starter (templates at 10, a
 * file at 15; B9's draft is 20) and "Save as template" in More. Each loads on
 * first use (EmptyDocStarter.tsx, SaveAsTemplateDialog.tsx).
 */

import { LayoutTemplate } from "@/lib/icons"
import { registerAction, registerDialog, registerSlot } from "@/components/docEditor/registry/registry"

const starter = () => import("@/components/docEditor/EmptyDocStarter")

registerSlot({ slot: "emptyStarter", id: "templates", edition: "both", order: 10, load: () => starter().then((m) => ({ default: m.StarterTemplates })) })
registerSlot({ slot: "emptyStarter", id: "import", edition: "both", order: 15, load: () => starter().then((m) => ({ default: m.StarterImport })) })

registerDialog({ id: "doc.saveAsTemplate", edition: "both", load: () => import("@/components/docTemplates/SaveAsTemplateDialog") })
registerAction({
  id: "doc.saveAsTemplate",
  label: "Save as template",
  icon: LayoutTemplate,
  group: "doc",
  order: 60,
  surfaces: ["more", "palette", "phoneSheet"],
  edition: "both",
  // Every member sees a template's preview, so only someone who may change
  // the doc is offered it: a read-only viewer never publishes a private doc
  // (the server refuses them too).
  isVisible: (ctx) => ctx.canEdit,
  // An empty doc has nothing to make a template of.
  isEnabled: (ctx) => !!ctx.editor && ctx.canEdit && !ctx.editor.isEmpty,
  run: (ctx) => ctx.bus.emit("openDialog", { id: "doc.saveAsTemplate" }),
})
