/// <reference types="vite/client" />

// Asset module declarations for Vite bundled imports
declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

// Raw markdown imports — used for LLM prompts so they're bundled into the
// JS at build time and survive the Tauri packaged runtime (where there's
// no dev server to serve project-root files).
declare module '*.md?raw' {
  const src: string
  export default src
}
