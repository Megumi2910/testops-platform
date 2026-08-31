/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_REVISION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
