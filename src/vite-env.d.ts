/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_ADMIN_ROUTE?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_MAP_STYLE?: string;
  readonly VITE_MAP_STYLE_DARK?: string;
  readonly VITE_ROUTING_URL?: string;
  readonly VITE_GEOCODER_URL?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_GSC_VERIFICATION?: string;
}


