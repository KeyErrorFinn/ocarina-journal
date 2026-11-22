import { useState } from "react";
import { Header, RefreshBtn, Tabs } from "../components/chrome";
import { Crest } from "../components/art";
import { Rosette } from "../components/medals";
import { cat, hallTime, prettyArea, type RepEntry, type RepHall, type Report } from "../report";
import type { Entry } from "../model";
import { useMapImage } from "../maps";
import hallBg from "../assets/bg/hall.webp";

const TABS = ["Records", "Rankings"] as const;

export function Hall({ report, entries, onHome }: { report: Report | null; entries: Entry[]; onHome: () => void }) {
  const [open, setOpen] = useState<(RepEntry & { boss: boolean }) | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Records");
  // (in the order Link meets them, not the report's alphabetical one)
  const STORY = ["Gohma", "Dodongo", "Barinade", "PhantomGanon", "Volvagia", "Morpha", "BongoBongo", "Twinrova", "Ganondorf", "Ganon"];
  const story = (id: string) => {
    const i = STORY.indexOf(id.split("/").pop() ?? "");
    return i < 0 ? 99 : i;
  };
  const bosses = (cat(report, "bosses")?.entries ?? []).map((e) => ({ ...e, boss: true })).sort((a, b) => story(a.id) - story(b.id));
  const foes = (cat(report, "enemies")?.entries ?? []).map((e) => ({ ...e, boss: false }));
  const done = (l: { have: number }[]) => l.filter((e) => e.have).length;
  const hall = report?.hall ?? [];
  const recordOf = (e: RepEntry & { boss: boolean }): RepHall | undefined => {
    const last = e.id.split("/").pop() ?? "";
    return hall.find((h) => h.id === (e.boss ? `Enemy_DungeonBoss_${last}` : last));
  };
  const trials = hall.filter((h) => h.id.startsWith("trial/"));

  // A defeated boss's title card, from the player's own game files (see `bossname/` in oj-gamedata's maps.rs).
  const card = useMapImage(open?.boss && open.have ? `bossname/${open.id.split("/").pop()}` : null);

  if (open) {
    const fights = entries.filter((e) => e.type === "battle_ended") as Extract<Entry, { type: "battle_ended" }>[];
    return (
      <>
        <Header title={open.label} left="back" onLeft={() => setOpen(null)} right={<RefreshBtn />} sub={open.boss ? "Boss" : "Enemy"} />
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        <div className="scroll grain">
          {tab === "Records" ? (
            <>
              {open.boss ? (
                <div className="hall-hero" style={{ backgroundImage: `url(${hallBg})` }}>
                  {card ? <img src={card.url} alt={open.label} /> : <span className="hall-name">{open.have ? open.label : "???"}</span>}
                </div>
              ) : (
                <div style={{ width: "5em", margin: "1.4em auto 0" }}>
                  <Crest name={open.label} />
                </div>
              )}
              <div style={{ textAlign: "center", padding: ".6em 0 .4em" }}>
                <div className="small muted">Status</div>
                <div className="big" style={{ fontSize: "1.8em" }}>
                  {open.have ? (open.count ? `Defeated ×${open.count}` : "Defeated") : "Not yet"}
                </div>
                {open.area && <div className="small muted">{prettyArea(open.area)}</div>}
              </div>
              <div className="card">
                <h3>Best time</h3>
                {hallTime(recordOf(open)) ? (
                  <>
                    <div className="big" style={{ fontSize: "2em" }}>
                      {hallTime(recordOf(open))}
                    </div>
                    <p className="small muted">
                      From the game's rematch record. The time unit is assumed (60 frames a second) and not yet confirmed against a real rematch.
                    </p>
                  </>
                ) : (
                  <p className="small muted">
                    {recordOf(open) ? "No rematch time recorded yet in this save." : "This one has no timed rematch."} Medal tiers (Bronze to Master) belong to
                    the original phone app and are not in the game's files, so none are shown.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="note">Global rankings come from Nintendo's servers and are not available on PC. Your own battle lengths from this session:</p>
              {fights.length === 0 && <p className="empty">No battles recorded yet. Fight something with the bridge on.</p>}
              {fights.map((f, i) => (
                <div key={i} className="rank">
                  <b className="n">{i + 1}</b>
                  <span>Battle</span>
                  <span className="num">{Math.round(f.secs)} s</span>
                </div>
              ))}
            </>
          )}
        </div>
      </>
    );
  }

  const Row = (e: RepEntry & { boss: boolean }) => (
    <button key={e.id} className={`listcard foe ${e.have ? "" : "locked"}`} onClick={() => setOpen(e)}>
      <Rosette tier={e.have ? (e.boss ? 3 : 1) : 0} />
      <span className="mid">
        {e.have ? e.label : "???"}
        <div className="time">{hallTime(recordOf(e)) ?? (e.have ? (e.count ? `Defeated ×${e.count}` : "Defeated") : "Not yet")}</div>
      </span>
      <span className="chev" aria-hidden>
        ›
      </span>
    </button>
  );

  return (
    <>
      <Header
        title="Hall of Foes"
        onLeft={onHome}
        right={<RefreshBtn />}
        help="Every enemy kind and boss the game tracks, with whether you have defeated it. Defeat counts and rematch times are read from your save. The time unit is assumed and not yet confirmed."
      />
      <div className="scroll grain">
        {!report ? (
          <p className="empty">No save report yet.</p>
        ) : (
          <>
            {trials.length > 0 && (
              <>
                <div className="rowline" style={{ margin: "1em 1.2em 0" }}>
                  <b>Trials</b>
                  <span className="num">
                    {trials.filter((t) => t.recorded).length}/{trials.length}
                  </span>
                </div>
                {trials.map((t) => (
                  <div key={t.id} className={`listcard ${t.recorded ? "" : "locked"}`}>
                    <span className="mid" style={{ textAlign: "left" }}>
                      {t.label}
                      <div className="time">{hallTime(t) ?? "Not yet"}</div>
                    </span>
                  </div>
                ))}
              </>
            )}
            <div className="rowline" style={{ margin: "1em 1.2em 0" }}>
              <b>Bosses</b>
              <span className="num">
                {done(bosses)}/{bosses.length}
              </span>
            </div>
            {bosses.map(Row)}
            <div className="rowline" style={{ margin: "1.2em 1.2em 0" }}>
              <b>Enemies</b>
              <span className="num">
                {done(foes)}/{foes.length}
              </span>
            </div>
            {foes.map(Row)}
          </>
        )}
      </div>
    </>
  );
}
