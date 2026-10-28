import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/** True while someone is signed in (also false when the site has no Supabase). */
export function useHasSession() {
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setHas(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setHas(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  return has;
}
