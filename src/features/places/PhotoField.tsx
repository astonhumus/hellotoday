import { useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { explainError, notify } from "../../lib/ui";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";

const BUCKET = "place-photos"; // see supabase/photos.sql: anyone can look, only admins and contributors can upload
const MAX_SIDE = 1600;          // px, longest side
const MAX_BYTES = 900 * 1024;   // the bucket refuses more than 1 MB

/** Shrinks a photo from the phone's camera or gallery to a web-sized JPEG. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // honours the photo's rotation in current browsers
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("That photo is too large even after shrinking. Try a smaller one.");
}

interface Props { value: string; onChange: (url: string) => void }

/** Admins and contributors add one photo to a place. The picture is uploaded to this site's own storage, so no outside address is needed. */
export function PhotoField({ value, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file || !supabase) return;
    if (!file.type.startsWith("image/")) return void notify("Please choose a picture.", "error");
    setBusy(true);
    try {
      const blob = await shrink(file);
      const path = `${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (error) throw new Error(explainError(error.message));
      onChange(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    } catch (e) {
      void notify(e instanceof Error ? e.message : "Couldn't upload that photo.", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="photo-field">
      <span className="photo-label">Photo (shown publicly)</span>
      {value && <img className="photo-preview" src={value} alt="Chosen photo of this place" referrerPolicy="no-referrer" />}
      <div className="photo-actions">
        <Button icon="camera" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : value ? "Replace photo" : "Add a photo"}</Button>
        {value && !busy && <Button icon="trash" onClick={() => onChange("")}>Remove</Button>}
        <input ref={input} type="file" accept="image/*" hidden onChange={e => void pick(e.target.files?.[0])} />
      </div>
      <p className="hint"><Icon name="camera" size={14} /> Use a photo you took or one you have permission to share. It is shrunk before it is uploaded. Replacing a photo leaves the old file in storage; only the admin can delete it there.</p>
    </div>
  );
}
