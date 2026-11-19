import { useMemo, useState } from "react";
import { Header, RefreshBtn, Seg, Tabs } from "../components/chrome";
import { Marker } from "../components/art";
import { SONGS } from "../data/content";
import { useLocal } from "../store";
import { cat, coords, KIND_NAME, MAP_KINDS, prettyArea, type Report } from "../report";
import type { Game } from "../model";

const TABS = ["Quests", "Rewards"] as const;
const SORTS = ["By area", "Nearest", "Found"] as const;

const WHAT: Record<string, string> = {
  chests: "a treasure chest", skulltulas: "a Gold Skulltula", "heart-pieces": "a Piece of Heart", "heart-containers": "a Heart Container",
};

export function Rumors({ report, game, onHome, openSong }: { report: Report | null; game: Game | null; onHome: () => void; openSong: (s: string) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Quests");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("By area");
  const [shown, setShown] = useLocal<Record<string, number>>("rumors.hints", {});

  const items = useMemo(() => {
    const out: { id: string; kind: (typeof MAP_KINDS)[number]; area: string; found: boolean; pos: [number, number, number] | null }[] = [];
    for (const k of MAP_KINDS) for (const e of cat(report, k)?.entries ?? []) out.push({ id: e.id, kind: k, area: e.area, found: e.have >= e.of, pos: coords(e) });
    return out;
  }, [report]);
  const found = items.filter((i) => i.found).length;
  const songs = cat(report, "songs")?.entries ?? [];

  let list = [...items];
  if (sort === "Found") list = list.filter((i) => i.found);
  else if (sort === "Nearest" && game?.pos) {
    const [x, , z] = game.pos;
    list = list.filter((i) => !i.found && i.pos).sort((a, b) => Math.hypot(a.pos![0] - x, a.pos![2] - z) - Math.hypot(b.pos![0] - x, b.pos![2] - z));
  } else list = list.filter((i) => !i.found).sort((a, b) => a.area.localeCompare(b.area));

  return (
    <>
      <Header title="Rumor Hunt" onLeft={onHome} right={<RefreshBtn />}
        help="Every chest, Gold Skulltula and Heart piece still missing in your save becomes a rumour. Reveal the area hint, then the exact spot. Points are this app's own count of what you have found." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="scroll grain">
        {!report ? (
          <p className="empty">No save report yet, so there is nothing to hunt for.</p>
        ) : tab === "Quests" ? (
          <>
            <div className="rowline" style={{ margin: ".8em 1.1em 0" }}>
              <span className="small muted">{found}/{items.length} completed</span>
              <div style={{ width: "62%" }}><Seg items={SORTS} value={sort} onChange={setSort} /></div>
            </div>
            {sort === "Nearest" && !game?.pos && <p className="empty">Nearest needs the live game. Start Longshot with the bridge on.</p>}
            {list.slice(0, 60).map((i, n) => {
              const lvl = shown[i.id] ?? 0;
              return (
                <div key={i.id} className="card" style={{ margin: ".8em 1em" }}>
                  <div style={{ display: "flex", gap: ".8em", alignItems: "center" }}>
                    <span style={{ width: "2.4em", height: "2.4em", flex: "none" }}><Marker kind={i.kind} done={i.found} /></span>
                    <div style={{ flex: 1 }}>
                      <b>Rumor #{n + 1}</b>
                      <div className="small muted">
                        {i.found ? "Found" : lvl === 0 ? "Hint hidden" : `It is said ${WHAT[i.kind]} lies in ${prettyArea(i.area)}.`}
                      </div>
                    </div>
                    {i.found ? <b className="num">✓</b> : <span className="num">+{i.kind === "heart-containers" ? 100 : i.kind === "skulltulas" ? 50 : 20}</span>}
                  </div>
                  {!i.found && lvl >= 1 && i.pos && lvl === 2 && (
                    <div className="small" style={{ marginTop: ".6em" }}>Exact spot: {i.pos.map((v) => Math.round(v)).join(", ")}</div>
                  )}
                  {!i.found && (
                    <div style={{ marginTop: ".7em", display: "flex", gap: ".6em" }}>
                      {lvl === 0 && <button className="pillbtn" onClick={() => setShown({ ...shown, [i.id]: 1 })}>Get an area hint</button>}
                      {lvl === 1 && <button className="pillbtn" onClick={() => setShown({ ...shown, [i.id]: 2 })}>Show exact spot</button>}
                    </div>
                  )}
                </div>
              );
            })}
            {list.length > 60 && <p className="note">Showing the first 60 of {list.length}.</p>}
            {list.length === 0 && <p className="empty">Nothing here. Try another sort.</p>}
          </>
        ) : (
          <>
            <p className="note" style={{ marginBottom: 0 }}>Songs you know are playable on the Ocarina screen. Rumor points: <b className="num">{items.filter((i) => i.found).reduce((a, i) => a + (i.kind === "heart-containers" ? 100 : i.kind === "skulltulas" ? 50 : 20), 0)}</b> (this app's own scale).</p>
            <div className="pgrid" style={{ gridTemplateColumns: "1fr 1fr 1fr", paddingTop: "1em" }}>
              {songs.map((s) => (
                <button key={s.id} className="card" style={{ margin: 0, padding: ".9em .4em", textAlign: "center", opacity: s.have ? 1 : 0.45 }} disabled={!s.have || !SONGS[s.label]} onClick={() => openSong(s.label)}>
                  <div style={{ fontSize: "1.8em" }}>𝄞</div>
                  <div className="small" style={{ fontWeight: 800 }}>{s.have ? s.label : "???"}</div>
                </button>
              ))}
            </div>
            <p className="note">{KIND_NAME.chests} and the rest are counted from your save, not from Nintendo's servers.</p>
          </>
        )}
      </div>
    </>
  );
}
