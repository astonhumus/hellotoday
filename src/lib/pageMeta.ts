import { useEffect } from "react";

const SITE = "Explore India";

const setMeta = (key: "name" | "property", id: string, content: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${id}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute(key, id); document.head.appendChild(el); }
  el.setAttribute("content", content);
};

/**
 * Gives each screen its own tab title and description (also used when someone shares or bookmarks it).
 * Keep titles under about 60 characters and descriptions under about 160.
 */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const full = title.includes(SITE) ? title : `${title} | ${SITE}`;
    document.title = full;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
  }, [title, description]);
}
