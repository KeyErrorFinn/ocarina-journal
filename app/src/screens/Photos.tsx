import { useRef, useState } from "react";
import { Header, RefreshBtn, Seg, Sheet, Tabs } from "../components/chrome";
import { MEDALS, TIER_NAMES } from "../data/content";
import { useLocal } from "../store";
import { cat, type Report } from "../report";
import { tiersReached } from "./Journey";

interface Photo { id: string; src: string; edited: boolean; title: string; at: number }
const TABS = ["All", "Unedited", "Edited"] as const;
const FRAMES = ["None", "Gold", "Parchment", "Vine"] as const;
const MAX = 40; // photos are kept in the webview's storage, which is small

/** Shrinks an imported picture so it fits in local storage. */
function shrink(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 720 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

function render(src: string, frame: (typeof FRAMES)[number], title: string): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const pad = frame === "None" ? 0 : Math.round(img.width * 0.04);
      const bar = title ? Math.round(img.height * 0.12) : 0;
      const c = document.createElement("canvas");
      c.width = img.width + pad * 2;
      c.height = img.height + pad * 2 + bar;
      const g = c.getContext("2d")!;
      g.fillStyle = frame === "Gold" ? "#b8893a" : frame === "Parchment" ? "#e3cc94" : frame === "Vine" ? "#2f4d2a" : "#000";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, pad, pad);
      if (frame === "Gold") { g.strokeStyle = "#f6d56a"; g.lineWidth = 3; g.strokeRect(pad / 2, pad / 2, c.width - pad, c.height - pad - bar / 2); }
      if (title) {
        g.fillStyle = frame === "Parchment" ? "#3b2815" : "#fff7e6";
        g.font = `700 ${Math.round(bar * 0.55)}px serif`;
        g.textAlign = "center";
        g.fillText(title, c.width / 2, img.height + pad * 2 + bar * 0.68);
      }
      res(c.toDataURL("image/jpeg", 0.8));
    };
    img.src = src;
  });
}

export function Photos({ report, onHome }: { report: Report | null; onHome: () => void }) {
  const [photos, setPhotos] = useLocal<Photo[]>("photos", []);
  const [, setAvatar] = useLocal<string | null>("profile.avatar", null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [open, setOpen] = useState<Photo | null>(null);
  const [edit, setEdit] = useState(false);
  const [frame, setFrame] = useState<(typeof FRAMES)[number]>("Gold");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  const pick = useRef<HTMLInputElement>(null);

  const stones = MEDALS.flatMap((m) => {
    const v = cat(report, m.cat)?.have ?? 0;
    return m.tiers.slice(0, tiersReached(v, m.tiers)).map((t, i) => ({ id: `${m.id}-${t}`, name: m.name, tier: TIER_NAMES[i], n: t }));
  });
  const list = photos.filter((p) => tab === "All" || (tab === "Edited") === p.edited);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 1800); };

  const add = async (files: FileList | null) => {
    if (!files) return;
    const next: Photo[] = [];
    for (const f of [...files].slice(0, MAX - photos.length)) next.push({ id: crypto.randomUUID(), src: await shrink(f), edited: false, title: "", at: Date.now() });
    setPhotos([...next, ...photos]);
    flash(`${next.length} imported`);
  };

  if (open) {
    const download = () => {
      const a = document.createElement("a");
      a.href = open.src; a.download = `ocarina-journal-${open.id.slice(0, 6)}.jpg`; a.click();
      flash("Saved to Downloads");
    };
    return (
      <>
        <Header title="Photo" left="back" onLeft={() => { setOpen(null); setEdit(false); }} sub="Photo Album" />
        <div className="scroll grain">
          <img src={open.src} alt="" style={{ width: "100%", display: "block", background: "#000" }} />
          <p className="small muted" style={{ margin: ".8em 1.2em" }}>Imported {new Date(open.at).toLocaleString()}{open.title ? ` · ${open.title}` : ""}</p>
          <button className="btn block" onClick={() => setEdit(true)}>✎ Edit</button>
          <div style={{ display: "flex", justifyContent: "space-around", padding: "1em" }}>
            <button className="pillbtn" onClick={download}>⭳ Save as Image</button>
            <button className="pillbtn" onClick={() => { setAvatar(open.src); flash("Profile picture set"); }}>☺ Set as Profile Picture</button>
          </div>
          <button className="btn ghost block" onClick={() => { setPhotos(photos.filter((p) => p.id !== open.id)); setOpen(null); }}>Delete</button>
        </div>
        {edit && (
          <Sheet title="Edit" onClose={() => setEdit(false)}>
            <div style={{ padding: "0 1.2em" }}>
              <div className="small muted" style={{ margin: ".4em 0" }}>Frame</div>
              <Seg items={FRAMES} value={frame} onChange={setFrame} />
              <div className="small muted" style={{ margin: "1em 0 .4em" }}>Title</div>
              <input type="text" value={title} maxLength={30} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
              <button className="btn block" style={{ width: "100%", margin: "1em 0" }} onClick={async () => {
                const src = await render(open.src, frame, title);
                const upd = { ...open, src, edited: true, title };
                setPhotos(photos.map((p) => (p.id === open.id ? upd : p)));
                setOpen(upd); setEdit(false); flash("Edited");
              }}>Apply</button>
            </div>
          </Sheet>
        )}
        {msg && <div className="toast">{msg}</div>}
      </>
    );
  }

  return (
    <>
      <Header title="Photo Album" onLeft={onHome} right={<RefreshBtn />} help="Milestone cards appear as you earn medal tiers. Import your own screenshots to frame and title them. Pictures stay on this PC." />
      <div className="scroll grain">
        <h2 className="h2" style={{ display: "flex", justifyContent: "space-between" }}>Milestone Cards <span className="muted small">{stones.length}</span></h2>
        <div style={{ display: "flex", gap: ".7em", overflowX: "auto", padding: "0 1em .8em", scrollbarWidth: "none" }}>
          {stones.length === 0 && <p className="empty" style={{ margin: 0 }}>No milestones yet.</p>}
          {stones.map((s) => (
            <div key={s.id} style={{ flex: "none", width: "62%" }}>
              <div className="shot" style={{ background: "linear-gradient(135deg,#3b2c1a,#16100a)", display: "grid", placeItems: "center" }}>
                <div className="coin" style={{ position: "static", width: "4.6em", height: "4.6em", fontSize: "1.3em" }}>{s.n}</div>
              </div>
              <div className="small" style={{ marginTop: ".4em" }}>{s.name}: {s.tier}</div>
            </div>
          ))}
        </div>
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <div className="rowline" style={{ margin: ".6em 1.1em" }}><span className="muted">{photos.length}/{MAX} Images</span></div>
        <div className="pgrid">
          {list.map((p) => <button key={p.id} style={{ backgroundImage: `url(${p.src})` }} onClick={() => setOpen(p)} aria-label="Open photo" />)}
        </div>
        <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
        <button className="btn ghost block" disabled={photos.length >= MAX} onClick={() => pick.current?.click()}>⇪ Import Images</button>
        <p className="note">The original app imports the game's own screenshots. Capturing from the game needs a write-capable bridge command, which is off until you consent.</p>
      </div>
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
