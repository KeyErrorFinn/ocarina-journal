import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import { NOTE_PITCH, type Note } from "./content";

/** A recorded score: notes with the milliseconds since the previous one. */
export interface Score { name: string; notes: { n: Note; dt: number }[] }

/** A score as short text: `OJ1;<name>;<note><ms in base 36>,...`. Fits a QR code for a few hundred notes. */
export function encodeScore(s: Score): string {
  return `OJ1;${s.name.replace(/;/g, ",")};${s.notes.map((x) => x.n + Math.round(x.dt).toString(36)).join(",")}`;
}

/** Reads a score code: this app's `OJ1;` text, or the base64 JSON codes of earlier versions. */
export function decodeScore(code: string): Score | null {
  const t = code.trim();
  try {
    if (t.startsWith("OJ1;")) {
      const [, name, body] = t.split(";");
      const notes = (body ?? "").split(",").filter(Boolean).map((p) => ({ n: p[0] as Note, dt: parseInt(p.slice(1), 36) }));
      if (!name || notes.some((x) => !(x.n in NOTE_PITCH) || !Number.isFinite(x.dt))) return null;
      return { name: name.slice(0, 20), notes: notes.slice(0, 400) };
    }
    const d = JSON.parse(atob(t));
    if (!Array.isArray(d.notes) || typeof d.name !== "string") return null;
    return { name: d.name.slice(0, 20), notes: d.notes.filter((x: { n: string }) => x.n in NOTE_PITCH).slice(0, 400) };
  } catch {
    return null;
  }
}

/** A QR code of the score's text as an SVG path (dark modules), in a square of `size` modules. */
export function qrPath(text: string): { d: string; size: number } {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return { d, size: n };
}

/** Finds a score code in a picture (a saved share card or a screenshot of one). */
export async function scanScore(file: Blob): Promise<Score | null> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0);
  const found = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  return found ? decodeScore(found.data) : null;
}
