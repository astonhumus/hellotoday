import { supabase } from "../lib/supabase";
import { useHasSession } from "../lib/auth";

const CONTACT = import.meta.env.VITE_CONTACT_EMAIL;

export const reportLink = (subject: string) =>
  CONTACT ? `mailto:${CONTACT}?subject=${encodeURIComponent(subject)}` : "";

export function FooterLinks({ report }: { report?: { subject: string } }) {
  const href = report ? reportLink(report.subject) : "";
  const signedIn = useHasSession();
  return (
    <div className="footer-links">
      <a href="#/about">About &amp; privacy</a>
      {href && <a href={href}>Report a problem</a>}
      {/* Deliberately quiet: small, grey, last. Only shown when the site has an admin backend and nobody is signed in. */}
      {supabase && !signedIn && <a href="#/admin" className="admin-link">Admin sign in</a>}
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="page about">
      <h2>About Explore India</h2>
      <p>A free guide to places to visit, eat and stay, a library of song lyrics, and a trip packing checklist. It works offline once you have opened it.</p>

      <h3>Where the information comes from</h3>
      <p>
        Places and songs are added by the site's admin and approved contributors. The map is © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors.
        District outlines are from <a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a> (open licence) and are simplified,
        so please don't use them for legal or survey purposes. Locations and details can be wrong or out of date. Check before you travel.
      </p>

      <h3>Song lyrics and copyright</h3>
      <p>
        Only lyrics that the contributor wrote, that are in the public domain, or that the contributor has permission to share should be added.
        If you are a rights holder and want a song removed, {CONTACT ? <>email <a href={reportLink("Song takedown request")}>{CONTACT}</a></> : "contact the site owner"} with the song title
        and we will remove it promptly.
      </p>

      <h3>Privacy</h3>
      <p>
        There are no advertisements or tracking cookies. Your checklist, map choices and app settings are saved only on your own device.
        The site loads map pictures from OpenStreetMap, which sees your device's address like any website would.
        Signed-in contributors have an email address and password stored with our data provider (Supabase) so they can sign in.
      </p>

      <p><a href="#/places">← Back to the app</a></p>
    </div>
  );
}
