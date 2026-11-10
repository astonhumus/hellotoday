export interface StateInfo {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  country?: string;                         // country code (Natural Earth adm0_a3, e.g. "IND"); the file public/data/regions/<code>.json holds its borders
  bbox?: [number, number, number, number];  // south, west, north, east of the region's main landmass
}

export interface CountryInfo {
  id: string;     // e.g. "IND"
  name: string;
  kind: string;   // what its subdivisions are called: State, Province, Region...
  center: [number, number];
  zoom: number;
  regions: number;
}

export interface Category {
  sort?: number;
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
  closure?: "temporary" | "permanent" | null; // temporarily closed (still listed) or permanently closed = archived (hidden from the public)
  closureNote?: string;                // the reason
  closedOn?: string;                   // YYYY-MM-DD, when it was closed
  regionId?: string; // the state/province it belongs to (from the database)
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
