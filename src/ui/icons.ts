// The one icon set (Lucide). Only the icons the app uses are imported, so the bundle stays small.
// Data files (categories.json, checklist.json) name their icons with these keys.
import {
  Apple, ArrowLeft, Backpack, Bandage, BedDouble, Car, CarFront, Carrot, Check, ChevronDown, ChevronRight, ChevronUp, CircleX,
  Clock, ClipboardCheck, Coffee, CookingPot, Copy, Dices, Download, Droplets, Drumstick, Flashlight, Footprints, Globe, House, IdCard,
  Landmark, Layers, LocateFixed, ListFilter, Map as MapIcon, MapPin, Minus, Music, Navigation, Pause, Pencil, Phone, PartyPopper, Play, Plus,
  Printer, Search, Settings, Share2, Shirt, ShoppingBasket, SquareCheck, Sunrise, Tent, Trash2, TreePalm, TreePine, Undo2, User, Utensils,
  UtensilsCrossed, Wheat, Wrench, X, type IconNode
} from "lucide";

export const ICONS = {
  // interface
  search: Search, x: X, "chevron-up": ChevronUp, "chevron-down": ChevronDown, chevron: ChevronRight, check: Check,
  directions: Navigation, copy: Copy, phone: Phone, globe: Globe, edit: Pencil, trash: Trash2, plus: Plus, filter: ListFilter,
  locate: LocateFixed, settings: Settings, back: ArrowLeft, layers: Layers, play: Play, pause: Pause, minus: Minus, share: Share2, print: Printer, undo: Undo2,
  download: Download, user: User, pin: MapPin, clock: Clock, "circle-x": CircleX, "square-check": SquareCheck, "party-popper": PartyPopper,
  // navigation and features
  home: House, map: MapIcon, music: Music, checklist: ClipboardCheck, backpack: Backpack,
  // place categories
  coffee: Coffee, landmark: Landmark, "tree-pine": TreePine, utensils: Utensils, "bed-double": BedDouble, "tree-palm": TreePalm,
  // trip types
  "shopping-basket": ShoppingBasket, tent: Tent, footprints: Footprints, car: Car, sunrise: Sunrise,
  // checklist categories
  carrot: Carrot, drumstick: Drumstick, apple: Apple, wheat: Wheat, droplets: Droplets, "cooking-pot": CookingPot,
  "utensils-crossed": UtensilsCrossed, flashlight: Flashlight, shirt: Shirt, bandage: Bandage, dices: Dices, wrench: Wrench,
  "id-card": IdCard, "car-front": CarFront
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/** The nodes for an icon name; an unknown name (for example from edited data) falls back to a map pin. */
export const iconNode = (name: string): IconNode => (ICONS as Record<string, IconNode>)[name] ?? ICONS.pin;

/** The same icon as a plain SVG string, for places React doesn't render (map markers). */
export function iconSvg(name: string, size = 16): string {
  const parts = iconNode(name).map(([tag, attrs]) =>
    `<${tag} ${Object.entries(attrs).filter(([k, v]) => k !== "key" && v !== undefined).map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${parts}</svg>`;
}
