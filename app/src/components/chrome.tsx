import { useState, type ReactNode } from "react";
import { Back, Close, Gear, Home, Refresh } from "./icons";

/** A ragged lower edge spanning the full 360-unit width. */
const TORN = (() => {
  let d = "M0 20V10";
  for (let x = 9, i = 0; x <= 369; x += 9, i++) d += `L${Math.min(x, 360)} ${5 + ((i * 7 + (i % 3) * 5) % 9)}`;
  return d + "V20z";
})();

export function Header({
  title,
  sub = "Ocarina Journal",
  left = "home",
  onLeft,
  right,
  help,
}: {
  title: string;
  sub?: string;
  left?: "home" | "back";
  onLeft: () => void;
  right?: ReactNode;
  help?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="band">
        <div className="tools">
          <div className="l">
            <button className="icon-btn" onClick={onLeft} aria-label={left === "home" ? "Home" : "Back"}>
              {left === "home" ? <Home /> : <Back />}
            </button>
          </div>
          <div className="r">{right}</div>
        </div>
        <div className="sub">{sub}</div>
        <h1>
          {title}
          {help && (
            <button className="help" onClick={() => setOpen(true)} aria-label="Help">
              {/* (drawn, so the mark sits in the middle of the ring whatever the font) */}
              <svg viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.8" opacity=".75" />
                <path d="M9.2 9.3a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.1-1.5 2.1v.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="17.4" r="1.25" fill="currentColor" />
              </svg>
            </button>
          )}
        </h1>
        <svg className="torn" viewBox="0 0 360 20" preserveAspectRatio="none" aria-hidden>
          <path d={TORN} fill="#0f0b08" />
        </svg>
      </header>
      {open && help && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          <p style={{ padding: "0 1.2em", lineHeight: 1.6 }}>{help}</p>
        </Sheet>
      )}
    </>
  );
}

export const RefreshBtn = ({ onClick }: { onClick?: () => void }) => (
  <button className="icon-btn" onClick={onClick} aria-label="Refresh">
    <Refresh />
  </button>
);
export const GearBtn = ({ onClick }: { onClick?: () => void }) => (
  <button className="icon-btn" onClick={onClick} aria-label="Settings">
    <Gear />
  </button>
);

export function Sync({ on }: { on: boolean }) {
  return (
    <span className={`sync ${on ? "" : "off"}`} title={on ? "Linked to the game" : "Not linked"}>
      <svg viewBox="0 0 36 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7h9M9 3l4 4-4 4M13 15H4M7 11l-4 4 4 4" transform="translate(0 -1)" />
        <rect x="18" y="4" width="16" height="13" rx="3" />
        <path d="M23 4v13" />
      </svg>
    </span>
  );
}

/** Tabs; with `icons`, each tab shows its picture above the name (no ornaments), as the original's Play Ocarina does. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  icons,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
  icons?: Partial<Record<T, string>>;
}) {
  return (
    <div className={`tabs ${icons ? "icons" : ""}`} role="tablist">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={t === value} className={`tab ${t === value ? "on" : ""}`} onClick={() => onChange(t)}>
          {icons?.[t] ? <img className="tab-ic" src={icons[t]} alt="" /> : t === value && <span className="orn">❖</span>}
          {t}
          {!icons?.[t] && t === value && <span className="orn">❖</span>}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ items, value, onChange }: { items: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="seg">
      {items.map((t) => (
        <button key={t} className={t === value ? "on" : ""} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet" role="dialog" aria-label={title}>
        <div className="grab" />
        <header>
          <span>{title}</span>
          <button className="x" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </header>
        <div className="body">{children}</div>
      </section>
    </>
  );
}

export function Bar({ value }: { value: number }) {
  return (
    <div className="bar">
      <i style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }} />
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}
