import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL, key = import.meta.env.VITE_SUPABASE_KEY;

// null until .env holds a real project URL; the app then falls back to browser-only storage.
export const supabase = url && key && !url.includes("YOUR-PROJECT-REF") ? createClient(url, key) : null;
