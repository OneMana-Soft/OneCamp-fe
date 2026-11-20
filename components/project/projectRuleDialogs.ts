// A project's rules and its SLA settings (linear-24 W2), the tools' two
// rule dialogs, in one lazy group: ProjectToolButtons loads both, and warms
// them, through this module alone. The SLA dialog's week editor reaches
// TimeField and date-fns' parse, which the rules dialog's group already does;
// as a group root of its own it gave those a new signature, and the task
// page's editor chunks re-paired around them (tiptap's EditorContent and
// y-prosemirror in three and four copies, w2/SIZE-L24W2H.txt). In the rules
// dialog's group no shared module's signature changes (app/slaLazy.test).
export { default as ProjectRulesDialog } from "@/components/work/rules/ProjectRulesDialog"
export { ProjectSlaDialog } from "@/components/project/ProjectSlaDialog"
// Triage's settings (linear-21 H3) write through the same policies call as the SLAs: the tools and the Triage tab
// open them through ProjectToolButtons' loader, never an import() of their own. The group draws them as
// TriageSheet (linear-21 H4): the settings with the project's people and the rules on arriving work beside them.
export { TriageSheet as TriageSettings } from "@/components/work/triage/TriageSheet"
