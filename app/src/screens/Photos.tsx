import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Header, RefreshBtn, Tabs } from "../components/chrome";
import { Medal, type Tier } from "../components/medals";
import { MEDALS, TIER_NAMES } from "../data/content";
import { useOwned } from "../data/rewards";
import { useLocal } from "../store";
import { cat, totalKills, type Report } from "../report";
import { tiersReached } from "./Journey";
import dayArt from "../assets/scenes/day.webp";

interface Photo { id: string; src: string; edited: boolean; title: string; at: number }
interface Placed { src: string; x: number; y: number; s: number }
const TABS = ["All", "Unedited", "Edited"] as const;
const EDIT_TABS = ["Frames", "Stickers", "Title"] as const;
const MAX = 40; // photos are kept in the webview's storage, which is small

/** Frames and stickers drawn for this app (src/assets/photo). Two frames and two stickers are free; the rest are
 *  Rumor Hunt rewards. */
const ART = import.meta.glob<string>("../assets/photo/*.webp", { eager: true, import: "default" });
const art = (n: string) => ART[`../assets/photo/${n}.webp`];
const FRAMES = [
  { id: "none", name: "None", reward: null },
  { id: "frame_gold", name: "Gold", reward: null },
  { id: "frame_parchment", name: "Parchment", reward: null },
  { id: "frame_vines", name: "Vines", reward: "frame-vines" },
  { id: "frame_ember", name: "Ember", reward: "frame-ember" },
  { id: "frame_tide", name: "Tide", reward: "frame-tide" },
  { id: "frame_night", name: "Night", reward: "frame-night" },
];
const STICKERS = [
  ...["heart", "chest"].map((k) => ({ id: `sticker_forest_${k}`, reward: null })),
  ...["mushroom", "acorn", "leaf", "rupee"].map((k) => ({ id: `sticker_forest_${k}`, reward: "stickers-forest" })),
  ...["star", "note"].map((k) => ({ id: `sticker_sky_${k}`, reward: null })),
  ...["sun", "cloud", "moon", "lantern"].map((k) => ({ id: `sticker_sky_${k}`, reward: "stickers-sky" })),
];

const load = (src: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });

/** Shrinks an imported picture so it fits in local storage. */
async function shrink(src: string): Promise<string> {
  const img = await load(src);
  const k = Math.min(1, 960 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.78);
}

/** The photo with its frame, stickers and title, as one picture. */
async function render(src: string, frame: string, stickers: Placed[], title: string): Promise<string> {
  const img = await load(src);
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  if (frame !== "none" && art(frame)) g.drawImage(await load(art(frame)!), 0, 0, c.width, c.height);
  for (const s of stickers) {
    const pic = await load(s.src);
    const w = s.s * c.width;
    g.drawImage(pic, s.x * c.width - w / 2, s.y * c.height - w / 2, w, w);
  }
  if (title) {
    const size = Math.round(c.height * 0.075);
    g.font = `800 ${size}px "Nunito Sans", sans-serif`;
    g.textAlign = "center";
    g.lineWidth = size * 0.18; g.strokeStyle = "#1c140c"; g.fillStyle = "#fff7e6";
    g.strokeText(title, c.width / 2, c.height * 0.86);
    g.fillText(title, c.width / 2, c.height * 0.86);
  }
  return c.toDataURL("image/jpeg", 0.85);
}

/** Recent Windows screenshots (Win+PrtScn, Game Bar), offered for import. Read-only; see recent_captures. */
function useCaptures(): { path: string; modified_ms: number; url?: string }[] {
  const [list, setList] = useState<{ path: string; modified_ms: number; url?: string }[]>([]);
  useEffect(() => {
    let live = true;
    invoke<{ path: string; modified_ms: number }[]>("recent_captures").then(async (caps) => {
      const out = [];
      for (const c of caps.slice(0, 8)) {
        try {
          const buf = await invoke<ArrayBuffer>("read_capture", { path: c.path });
          out.push({ ...c, url: URL.createObjectURL(new Blob([buf])) });
        } catch { /* unreadable: skip */ }
      }
      if (live) setList(out);
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  return list;
}

export function Photos({ report, onHome }: { report: Report | null; onHome: () => void }) {
  const [photos, setPhotos] = useLocal<Photo[]>("photos", []);
  const [, setAvatar] = useLocal<string | null>("profile.avatar", null);
  const [owned] = useOwned();
  const caps = useCaptures();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [open, setOpen] = useState<Photo | null>(null);
  const [edit, setEdit] = useState(false);
  const [etab, setEtab] = useState<(typeof EDIT_TABS)[number]>("Frames");
  const [frame, setFrame] = useState("frame_gold");
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [pickedSticker, setPickedSticker] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  const value = (c: string) => (c === "kills" ? totalKills(report) : cat(report, c)?.have ?? 0);
  const stones = MEDALS.flatMap((m) => m.tiers.slice(0, tiersReached(value(m.cat), m.tiers)).map((t, i) => ({ id: `${m.id}-${t}`, medal: m.id, glyph: m.glyph, name: m.name, tier: i, n: t })));
  const list = photos.filter((p) => tab === "All" || (tab === "Edited") === p.edited);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 1800); };
  const has = (reward: string | null) => !reward || !!owned[reward];

  const addSrcs = async (srcs: string[]) => {
    const next: Photo[] = [];
    for (const s of srcs.slice(0, MAX - photos.length)) next.push({ id: crypto.randomUUID(), src: await shrink(s), edited: false, title: "", at: Date.now() });
    setPhotos([...next, ...photos]);
    flash(`${next.length} imported`);
  };

  const move = (e: React.PointerEvent) => {
    if (drag.current === null || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const k = drag.current;
    setPlaced((p) => p.map((s, i) => (i === k ? { ...s, x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) } : s)));
  };

  if (open) {
    const download = () => {
      const a = document.createElement("a");
      a.href = open.src; a.download = `ocarina-journal-${open.id.slice(0, 6)}.jpg`; a.click();
      flash("Saved to Downloads");
    };
    const startEdit = () => { setEdit(true); setPlaced([]); setTitle(open.title); setPickedSticker(null); };
    return (
      <>
        <Header title={edit ? "Edit Image" : "Photo"} left="back" onLeft={() => (edit ? setEdit(false) : (setOpen(null), setEdit(false)))} sub="Photo Album"
          right={edit ? <button className="pillbtn" onClick={async () => {
            const src = await render(open.src, frame, placed, title);
            const upd = { ...open, src, edited: true, title };
            setPhotos(photos.map((p) => (p.id === open.id ? upd : p)));
            setOpen(upd); setEdit(false); flash("Edited");
          }}>✓ Complete</button> : undefined} />
        <div className="scroll grain">
          <div className="ph-edit" ref={box} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)}>
            <img src={open.src} alt="" />
            {edit && frame !== "none" && art(frame) && <img className="ph-frame" src={art(frame)} alt="" />}
            {edit && placed.map((s, i) => (
              <img key={i} className={`ph-sticker ${pickedSticker === i ? "on" : ""}`} src={s.src} alt="" style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.s * 100}%` }}
                onPointerDown={(e) => { e.preventDefault(); drag.current = i; setPickedSticker(i); }} />
            ))}
            {edit && title && <span className="ph-title">{title}</span>}
          </div>
          {!edit ? (
            <>
              <p className="small muted" style={{ margin: ".8em 1.2em" }}>Imported {new Date(open.at).toLocaleString()}{open.title ? ` · ${open.title}` : ""}</p>
              <button className="btn block" onClick={startEdit}>✎ Edit</button>
              <div style={{ display: "flex", justifyContent: "space-around", padding: "1em" }}>
                <button className="pillbtn" onClick={download}>⭳ Save as Image</button>
                <button className="pillbtn" onClick={() => { setAvatar(open.src); flash("Profile picture set"); }}>☺ Set as Profile Picture</button>
              </div>
              <button className="btn ghost block" onClick={() => { setPhotos(photos.filter((p) => p.id !== open.id)); setOpen(null); }}>Delete</button>
            </>
          ) : (
            <>
              <Tabs tabs={EDIT_TABS} value={etab} onChange={setEtab} />
              {etab === "Frames" && (
                <div className="ph-pick">
                  {FRAMES.map((f) => (
                    <button key={f.id} className={`${frame === f.id ? "on" : ""}`} disabled={!has(f.reward)} onClick={() => setFrame(f.id)}>
                      {f.id !== "none" && art(f.id) ? <img src={art(f.id)} alt="" /> : <span className="glyph">∅</span>}
                      <small>{has(f.reward) ? f.name : "Reward"}</small>
                    </button>
                  ))}
                </div>
              )}
              {etab === "Stickers" && (
                <>
                  <div className="ph-pick stickers">
                    {STICKERS.filter((s) => art(s.id)).map((s) => (
                      <button key={s.id} disabled={!has(s.reward)} onClick={() => { setPlaced([...placed, { src: art(s.id)!, x: 0.5, y: 0.5, s: 0.18 }]); setPickedSticker(placed.length); }}>
                        <img src={art(s.id)} alt="" />
                      </button>
                    ))}
                  </div>
                  {pickedSticker !== null && placed[pickedSticker] && (
                    <div className="oc-actions">
                      <button className="pillbtn" onClick={() => setPlaced(placed.map((s, i) => (i === pickedSticker ? { ...s, s: Math.max(0.06, s.s - 0.04) } : s)))}>− Smaller</button>
                      <button className="pillbtn" onClick={() => setPlaced(placed.map((s, i) => (i === pickedSticker ? { ...s, s: Math.min(0.5, s.s + 0.04) } : s)))}>+ Bigger</button>
                      <button className="pillbtn" onClick={() => { setPlaced(placed.filter((_, i) => i !== pickedSticker)); setPickedSticker(null); }}>✕ Remove</button>
                    </div>
                  )}
                  <p className="note">Drag stickers on the picture. More sets come from Rumor Hunt rewards.</p>
                </>
              )}
              {etab === "Title" && (
                <div style={{ padding: "1em 1.2em" }}>
                  <input type="text" value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} placeholder="A title for this picture (optional)" />
                </div>
              )}
            </>
          )}
        </div>
        {msg && <div className="toast">{msg}</div>}
      </>
    );
  }

  return (
    <>
      <Header title="Photo Album" onLeft={onHome} right={<RefreshBtn />}
        help="Milestone cards appear as you earn medal tiers. Import your screenshots (Win+PrtScn or Game Bar captures are offered here) and decorate them with frames, stickers and a title. Pictures stay on this PC." />
      <div className="scroll grain">
        <h2 className="h2" style={{ display: "flex", justifyContent: "space-between" }}>Milestone Cards <span className="muted small">{stones.length}</span></h2>
        <div className="ph-strip">
          {stones.length === 0 && <p className="empty" style={{ margin: 0 }}>No milestones yet.</p>}
          {stones.map((s) => (
            <div key={s.id} className="ph-stone">
              <div className="shot" style={{ backgroundImage: `linear-gradient(#0006, #000a), url(${dayArt})` }}>
                <span className="ph-medal"><Medal id={s.medal} tier={(["bronze", "silver", "gold", "master"] as Tier[])[s.tier]} glyph={s.glyph} /></span>
                <b className="ph-n">{s.n}</b>
              </div>
              <div className="small" style={{ marginTop: ".4em" }}>{s.name}: {TIER_NAMES[s.tier]}</div>
            </div>
          ))}
        </div>
        {caps.length > 0 && (
          <>
            <h2 className="h2" style={{ fontSize: "1.05em" }}>From your screenshots</h2>
            <div className="ph-strip">
              {caps.map((c) => (
                <button key={c.path} className="ph-cap" onClick={() => c.url && addSrcs([c.url])} title={new Date(c.modified_ms).toLocaleString()}>
                  <span className="shot" style={{ backgroundImage: `url(${c.url})` }} />
                  <small>{new Date(c.modified_ms).toLocaleDateString()} · Import</small>
                </button>
              ))}
            </div>
          </>
        )}
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <div className="rowline" style={{ margin: ".6em 1.1em" }}><span className="muted">{photos.length}/{MAX} Images</span></div>
        <div className="pgrid">
          {list.map((p) => <button key={p.id} style={{ backgroundImage: `url(${p.src})` }} onClick={() => setOpen(p)} aria-label="Open photo" />)}
        </div>
        <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; addSrcs(fs.map((f) => URL.createObjectURL(f))); }} />
        <button className="btn ghost block" disabled={photos.length >= MAX} onClick={() => pick.current?.click()}>⇪ Import Images</button>
        <p className="note">The original app receives the game's screenshots automatically. Longshot has no screenshot folder of its own, so this app offers your recent Windows screenshots instead; it only reads them.</p>
      </div>
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
