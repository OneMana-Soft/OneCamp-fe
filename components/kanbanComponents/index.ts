// The board's two components, and only those.
//
// This directory arrived as dnd-kit's example set: Button, ConfirmModal,
// Draggable, Droppable, FloatingControls, Grid, GridContainer, List,
// OverflowWrapper and Wrapper, each with its own CSS module and its own idea of
// what a button, a modal and a list look like. Nothing in the product ever
// imported one. They were a second visual dialect the UI critique could see in
// the repository and nobody could see in the app, and a barrel that re-exported
// them kept them alive to every reader and every bundler.
//
// Container and Item are what the two board screens use. Keep it that way: a
// control that belongs on a board belongs in components/ui with everything else.
export { Container } from "./Container"
export type { ContainerProps } from "./Container"
export { Item, Action, Handle, Remove } from "./Item"
