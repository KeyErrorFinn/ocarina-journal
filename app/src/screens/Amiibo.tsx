import { Header } from "../components/chrome";

export function Amiibo({ onHome }: { onHome: () => void }) {
  return (
    <>
      <Header title="amiibo" onLeft={onHome} help="amiibo figures are read by the console's NFC reader." />
      <div className="scroll grain">
        <div className="card" style={{ marginTop: "1.6em" }}>
          <h3>Console only</h3>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            Scanning amiibo needs the Switch 2's NFC reader and Nintendo's registration, so this feature cannot work on a PC.
            Longshot has no NFC support. The tile stays here so the layout matches the original.
          </p>
        </div>
      </div>
    </>
  );
}
