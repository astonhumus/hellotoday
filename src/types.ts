export interface StateInfo {
  id: string;
  name: string; // must match the state's name in public/data/india-states.json
  center: [number, number];
  zoom: number;
}

export interface Category {
  id: string;
  label: string;
  color: string;
  icon: string;
}

export interface Place {
  id: string;
  name: string;
  category: string;
  district?: string;
  lat: number;
  lng: number;
  desc?: string;
  phone?: string;
  website?: string;
  approx?: boolean;
  visited?: string; // YYYY-MM-DD, set when you have been there
  notes?: string;   // personal tips, e.g. what to order, who to ask for
  status?: Status;  // moderation state; only 'approved' rows are public
  reviewNote?: string;
  updatedAt?: string; // lets an edit proposal detect that the item changed meanwhile
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  language?: string;
  credit?: string;
  lyrics: string;
  status?: Status;
  reviewNote?: string;
  updatedAt?: string;
}

export type Status = "pending" | "approved" | "rejected";
