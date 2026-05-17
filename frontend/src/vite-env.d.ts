// Source - https://stackoverflow.com/a/78760013
// Posted by Sayvai
// Retrieved 2026-03-26, License - CC BY-SA 4.0

/// <reference types="vite/client" />
/// <reference types="vite/types/importMeta.d.ts" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
    readonly VITE_STUDENT_CODE: string;
    readonly VITE_ADMIN_CODE: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
