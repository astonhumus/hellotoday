import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/** True while someone is signed in, false when nobody is (also when the site has no Supabase),
 *  and null for the moment before the saved session has been read, so nothing flashes the signed-out view. */
export function useHasSession() {
  const [has, setHas] = useState<boolean | null>(supabase ? null : false);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setHas(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setHas(!!session));
    return () => data.subscription.unsubscribe();
  }, []);
  return has;
}
