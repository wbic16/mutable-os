// Shared src modules are type-checked by two projects: the client project,
// which gets Vite's asset-module declarations from "vite/client", and this
// server project, which does not. Declare the ?url asset module here so
// imports such as pdf.js worker URLs type-check identically in both.
declare module '*?url' {
  const src: string;
  export default src;
}
