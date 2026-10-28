// A handful of simple line icons, so the UI doesn't depend on emoji rendering or an icon library.
const PATHS = {
  search: "M11 19a8 8 0 1 1 5.3-14 8 8 0 0 1-5.3 14zm9 2-4.3-4.3",
  x: "M6 6l12 12M18 6 6 18",
  "chevron-up": "m6 15 6-6 6 6",
  "chevron-down": "m6 9 6 6 6-6",
  check: "m5 12.5 4.5 4.5L19 7.5",
  directions: "M12 3 4 11l8 8 8-8-8-8zM9 12h5m0 0-2-2m2 2-2 2",
  copy: "M9 9h10v10H9zM5 15V5h10",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  trash: "M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13",
  plus: "M12 5v14M5 12h14",
  filter: "M4 6h16M7 12h10M10 18h4",
  back: "M15 5l-7 7 7 7",
  layers: "m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  play: "M8 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  minus: "M5 12h14",
  music: "M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  share: "M12 3v12M8 7l4-4 4 4M5 12v8h14v-8",
  print: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  undo: "M4 9h11a5 5 0 1 1 0 10H8M4 9l4-4M4 9l4 4",
  chevron: "m9 6 6 6-6 6",
  download: "M12 4v12M8 12l4 4 4-4M5 20h14",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  pin: "M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
