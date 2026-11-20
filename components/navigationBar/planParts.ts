// The shell's plan parts (SHELL-15), for admins: the workspace menu's plan
// row, the phone sheet's row and the 80 % seats notice. All three read the
// plan, and Turbopack copies a shared module into every lazy chunk that reads
// it, so they load from this one module: one chunk, one copy of the plan
// reader and its words. The parts stay in their own files.
export { PlanRow, PlanSheetRow } from "@/components/navigationBar/desktop/PlanRow"
export { SeatsNotice } from "@/components/banner/SeatsNotice"
