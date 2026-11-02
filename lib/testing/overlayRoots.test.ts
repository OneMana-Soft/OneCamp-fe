import { describe, expect, it } from "vitest"

import { overlayRoots } from "@/lib/testing/overlayRoots"

// A library's readable build as esbuild writes it (numbered jsx calls), one of each
// kind of overlay root, each rule for its classes, and the elements that are none.
const BUNDLE = `
import * as Popover3 from "@radix-ui/react-popover";
import { Content as Floating } from "@radix-ui/react-popover";
import { createPortal as createPortal2 } from "react-dom";
var Panel = React2.forwardRef(({ className, children }, ref) => jsx4("div", { ref, className: clsx2("Panel", className), children }));
var Shell = React2.forwardRef(({ className, children }, ref) => /* @__PURE__ */ jsx4(Popover3.Portal, { children: jsxs3(Popover3.Content, { ref, className: clsx2("focus-ring-none", className), children: [children, jsx4("span", { className: "shell-tip" })] }) }));
var FontList = () => jsx4(Shell, { className: "font-list", children: jsx4("ul", { className: "dropdown-menu fonts" }) });
var Swatches = () => jsx4(Shell, { children: cond ? jsx4(Grid, {}) : null });
var Grid = ({ size }) => {
  const cell = () => jsx4("i", { className: "not-the-root" });
  return jsx4("div", { role: "dialog", "aria-modal": "true", children: jsxs3("div", { className: \`grid swatches\`, children: [cell()] }) });
};
function Arrowheads({ open }) {
  return jsx4("div", { children: open && jsx4(Popover3.Content, { side: "top", children: jsx4("div", { className: "picker", role: "dialog" }) }) });
}
var Names = () => jsx4(Floating, { children: jsx4(Panel, { children: jsx4("ol", { className: "dropdown-menu names" }) }) });
var Modal = (props) => createPortal2(jsxs3("div", { className: clsx2("Modal", props.className, { quiet: props.quiet }), role: "dialog", children: [jsx4("div", { className: "Modal__background" }), jsx4("div", { className: "Modal__content", children: props.children })] }), document.body);
var Help = () => jsx4(Modal, { className: "HelpDialog" });
var Toolbar = () => jsx4("div", { role: "toolbar", className: "App-toolbar", children: jsx4(Popover3.Trigger, { className: "opens-it" }) });
`

describe("overlayRoots", () => {
  const roots = overlayRoots(BUNDLE)
  const of = (where: string) => roots.filter((r) => r.where === where)

  it("finds each Popover.Content, element with role=dialog and portal, and nothing else", () => {
    expect(roots.map((r) => r.where).sort()).toEqual(
      [
        "Popover.Content in Shell, from FontList",
        "Popover.Content in Shell, from Swatches",
        'role="dialog" in Grid',
        "Popover.Content in Arrowheads",
        'role="dialog" in Arrowheads',
        "Popover.Content in Names",
        'role="dialog", createPortal in Modal, from Help',
      ].sort(),
    )
  })

  it("takes a root's classes from it, or from each caller of one that passes its caller's className on", () => {
    expect(of("Popover.Content in Shell, from FontList")[0].classes).toEqual(["focus-ring-none", "font-list"])
    expect(of('role="dialog", createPortal in Modal, from Help')[0].classes).toEqual(["Modal", "HelpDialog"])
  })

  it("takes the first element inside for one that names none, following a component to what it returns", () => {
    expect(of("Popover.Content in Shell, from Swatches")[0].classes).toEqual(["focus-ring-none", "grid", "swatches"])
    expect(of('role="dialog" in Grid')[0].classes).toEqual(["grid", "swatches"])
    expect(of("Popover.Content in Arrowheads")[0].classes).toEqual(["picker"])
    expect(of("Popover.Content in Names")[0].classes).toEqual(["Panel"])
  })

  it("holds inside only the surface a root draws itself: never what a caller hands it, or what a component it calls draws", () => {
    expect(of('role="dialog", createPortal in Modal, from Help')[0].inside).toEqual(["Modal", "Modal__background", "Modal__content"])
    expect(of("Popover.Content in Shell, from FontList")[0].inside).toEqual(["focus-ring-none", "shell-tip"])
    expect(of("Popover.Content in Names")[0].inside).toEqual([])
  })
})
