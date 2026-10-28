/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_ADMIN_ROUTE?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_TILE_URL?: string;
  readonly VITE_CONTACT_EMAIL?: string;
}
