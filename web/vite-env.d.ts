/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CORE_ADDRESS: string;
  readonly VITE_SCORE_ADDRESS: string;
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

