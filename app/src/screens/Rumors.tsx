import { useMemo, useState } from "react";
import { Bar, Header, RefreshBtn, Tabs } from "../components/chrome";
import { SpotCrop } from "../components/MapCrop";
import { useShared } from "../store";
import { prettyArea, type Report } from "../report";
import { useMapIndex } from "../maps";
import { useLore } from "../lore";
import { REWARDS, rewardArt, useOwned } from "../data/rewards";
import type { Game } from "../model";
import { distance, LANDMARK, useLandmarks, type Landmark } from "../landmarks";

const TABS = ["Quests", "Rewards"] as const;
const SORTS = ["Number", "Nearest", "Not found", "Found"] as const;
const NEAR = 10; // metres: close enough to count as found
const WARM = 30; // metres: "nearby"
const PAGE = 24; // cards drawn at a time: each is a crop of a large map picture
const KINDS = LANDMARK;
type Rumor = Landmark;

/** A painting of each kind of place, drawn for this app (src/assets/rumors); the map is the fallback. */
const CARDS = import.meta.glob<string>("../assets/rumors/*.webp", { eager: true, import: "default" });
const cardArt = (kind: string): string | undefined => CARDS[`../assets/rumors/card_${kind}.webp`];

export function Rumors({ game, onHome }: { report: Report | null; game: Game | null; onHome: () => void; openSong?: (s: string) => void }) {
  const rumors = useLandmarks();
  const idx = useMapIndex();
  const lore = useLore();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Quests");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("Number");
  const [found, setFound] = useShared<Record<string, number>>("gossip.found", {});
  const [helped, setHelped] = useShared<Record<string, true>>("gossip.helped", {});
  const [owned, buy, spent] = useOwned();
  const [open, setOpen] = useState<string | null>(null);
  const [cheer, setCheer] = useState<Rumor | null>(null);
  const [more, setMore] = useState(PAGE);

  // Numbered taking each kind in turn (a stone, a grotto, a cow, ...), so the list mixes them rather than opening on
  // one kind's dozens of places.
  const list = useMemo(() => {
    const byKind = new Map<string, Rumor[]>();
    for (const r of rumors ?? []) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
    const out: Rumor[] = [],
      runs = [...byKind.values()];
    for (let i = 0; out.length < (rumors?.length ?? 0); i++) for (const run of runs) if (run[i]) out.push(run[i]);
    return out;
  }, [rumors]);
  const number = useMemo(() => new Map(list.map((r, i) => [r.id, i + 1])), [list]);
  const points = list.filter((r) => found[r.id]).reduce((a, r) => a + KINDS[r.kind].points, 0);
  const bank = points - spent;
  const nextReward = 300 - (bank % 300);
  const place = (a: string) => lore?.places[a] ?? prettyArea(a);
  const era = (r: Rumor): "child" | "adult" => (game?.age === "adult" && r.eras.includes("adult") ? "adult" : (r.eras[0] ?? "child"));

  let shown = [...list];
  if (sort === "Found") shown = shown.filter((r) => found[r.id]);
  else if (sort === "Not found") shown = shown.filter((r) => !found[r.id]);
  else if (sort === "Nearest") shown = shown.filter((r) => !found[r.id] && distance(game, r) !== null).sort((a, b) => distance(game, a)! - distance(game, b)!);

  const markFound = (r: Rumor) => {
    setFound({ ...found, [r.id]: Date.now() });
    setOpen(null);
    setCheer(r);
  };

  // ---------- one rumour ----------
  const r = list.find((x) => x.id === open);
  if (r && idx) {
    const k = KINDS[r.kind];
    const d = distance(game, r);
    const status = found[r.id]
      ? `Found on ${new Date(found[r.id]).toLocaleDateString()}.`
      : !game
        ? "Start the game with the bridge on to search for it."
        : d === null
          ? "Find the quest target in the game!"
          : d <= NEAR
            ? "You're here! Tap Found!"
            : d <= WARM
              ? "The quest target is nearby."
              : "Get closer.";
    return (
      <>
        <Header title={k.name} left="back" onLeft={() => setOpen(null)} sub={`Rumor ${String(number.get(r.id)).padStart(3, "0")}`} />
        <div className="scroll grain gq-detail">
          <div className="gq-points">
            +{k.points}
            <small>P</small>
          </div>
          <div className="shot gq-snap">
            {cardArt(r.kind) ? <img src={cardArt(r.kind)} alt="" /> : <SpotCrop idx={idx} area={r.area} pos={r.pos} era={era(r)} zoom={2} box={2 / 3} />}
          </div>
          <p className="gq-said">
            It is said that {k.said} {place(r.area)}...
          </p>
          <details className="gq-help" key={r.id} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && setHelped({ ...helped, [r.id]: true })}>
            <summary>If you can't find it...</summary>
            <div className="shot gq-map">
              <SpotCrop idx={idx} area={r.area} pos={r.pos} era={era(r)} zoom={1.4} marker box={1} />
            </div>
            <p className="small muted">
              The pin marks the spot on the {era(r)} map of {place(r.area)}.{r.eras.length === 1 ? ` It is only there as ${r.eras[0]} Link.` : ""}
            </p>
          </details>
          <p className={`gq-status ${d !== null && d <= WARM ? "warm" : ""}`}>{status}</p>
          {!found[r.id] && (
            <>
              <button className="reveal-btn gq-found" disabled={d === null || d > NEAR} onClick={() => markFound(r)}>
                📷 Found!
              </button>
              <button className="pillbtn gq-manual" onClick={() => markFound(r)}>
                I found it without the live game
              </button>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Rumor Hunt"
        onLeft={onHome}
        right={<RefreshBtn />}
        help="Rumours about places in your own game: gossip stones, hidden grottos, cows, the owl's perches and more, read from your game's maps. Go there with the bridge on and tap Found! to earn points, then spend them on rewards. The places come from the game files; the rumours, points and rewards are this app's own."
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="scroll grain rumor-bg" style={{ paddingBottom: "5.4em" }}>
        {rumors === undefined ? (
          <p className="empty">Reading rumours from your game...</p>
        ) : rumors === null || !idx ? (
          <p className="empty">The rumours come from your game's maps, and the game folder could not be read.</p>
        ) : tab === "Quests" ? (
          <>
            <div className="rowline" style={{ margin: ".9em 1.1em .2em" }}>
              <span className="small muted">
                {Object.keys(found).filter((id) => number.has(id)).length}/{list.length} Completed
              </span>
              <select className="gq-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
                {SORTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            {sort === "Nearest" && shown.length === 0 && <p className="empty">Nearest lists rumours in the area Link is in, with the live game.</p>}
            <div className="gq-grid">
              {shown.slice(0, more).map((x) => (
                <button key={x.id} className={`gq-card ${found[x.id] ? "done" : ""}`} onClick={() => setOpen(x.id)}>
                  <span className="shot">
                    {cardArt(x.kind) ? (
                      <img src={cardArt(x.kind)} alt="" loading="lazy" />
                    ) : (
                      <SpotCrop idx={idx} area={x.area} pos={x.pos} era={era(x)} zoom={2} box={3 / 4} />
                    )}
                  </span>
                  <span className="gq-where">{place(x.area)}</span>
                  <span className="gq-p">
                    {found[x.id] ? (
                      "✓ Found"
                    ) : (
                      <>
                        +{KINDS[x.kind].points}
                        <small>P</small>
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
            {shown.length > more && (
              <button className="btn ghost block" onClick={() => setMore(more + PAGE)}>
                Show more ({shown.length - more} left)
              </button>
            )}
          </>
        ) : (
          <div className="gq-rewards">
            {REWARDS.map((w) => (
              <button key={w.id} className={`gq-reward ${owned[w.id] ? "own" : ""}`} disabled={!!owned[w.id] || bank < w.cost} onClick={() => buy(w.id)}>
                <span className="pic">{rewardArt(w.art) ? <img src={rewardArt(w.art)} alt="" /> : <span className="glyph">♪</span>}</span>
                <span className="cost">
                  {owned[w.id] ? (
                    "Owned"
                  ) : (
                    <>
                      {w.cost}
                      <small>P</small>
                    </>
                  )}
                </span>
                <span className="nm">{w.name}</span>
              </button>
            ))}
            <p className="note" style={{ gridColumn: "1 / -1" }}>
              Ocarinas you buy appear under Change Ocarina on the Ocarina page.
            </p>
          </div>
        )}
      </div>
      {rumors && (
        <div className="pinned gq-bank">
          <div className="rowline">
            <span>Gossip Points</span>
            <span className="num" style={{ fontSize: "1.4em" }}>
              {bank}
              <small>P</small>
            </span>
          </div>
          <div className="rowline small muted">
            <span>Reward Redemption</span>
            <span>{nextReward}P to go</span>
          </div>
          <Bar value={(bank % 300) / 300} />
        </div>
      )}
      {cheer && (
        <div className="reveal">
          <button className="reveal-x" aria-label="Close" onClick={() => setCheer(null)}>
            ✕
          </button>
          <div className="reveal-k">Quest complete!</div>
          <div className="reveal-p">
            +{KINDS[cheer.kind].points}
            <small>P</small>
          </div>
          {idx && (
            <div className="shot reveal-img">
              {cardArt(cheer.kind) ? (
                <img src={cardArt(cheer.kind)} alt="" />
              ) : (
                <SpotCrop idx={idx} area={cheer.area} pos={cheer.pos} era={era(cheer)} zoom={2} box={2 / 3} />
              )}
            </div>
          )}
          <p>
            You found the {KINDS[cheer.kind].name.toLowerCase()} in {place(cheer.area)}.
          </p>
          <button className="reveal-btn" onClick={() => setCheer(null)}>
            OK
          </button>
        </div>
      )}
    </>
  );
}
