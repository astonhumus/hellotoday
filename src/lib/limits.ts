// Maximum lengths. Keep in sync with the CHECK constraints in supabase/hardening.sql.
export const LIMITS = {
  name: 120, district: 60, desc: 1000, notes: 2000, phone: 40, website: 300,
  title: 120, artist: 80, language: 40, lyrics: 20000, credit: 300
} as const;
