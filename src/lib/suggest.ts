import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

// "Suggest a place / report a problem" can be opened from anywhere (footer, a place, an empty region). The dialog itself lives in App.
export interface SuggestRequest { kind: "place" | "problem" | "other"; about?: string; link?: string }

let current: SuggestRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const openSuggest = (req: SuggestRequest = { kind: "place" }) => { current = req; emit(); };
export const closeSuggest = () => { current = null; emit(); };
export const useSuggest = () => useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current);

export const contactEmail = import.meta.env.VITE_CONTACT_EMAIL as string | undefined;
/** Suggestions go to the database when there is one, otherwise to the contact email; with neither the links are hidden. */
export const canSuggest = !!supabase || !!contactEmail;
