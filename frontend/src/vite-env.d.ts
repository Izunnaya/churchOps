/// <reference types="vite/client" />

interface ImportMetaEnv {
  /// Where the church records are served from, e.g. http://localhost:4000.
  /// Set per environment in .env; see .env.example.
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
