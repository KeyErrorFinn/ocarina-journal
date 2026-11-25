import { invoke } from "../ipc";
import { CHROMATIC, NOTE_PITCH, NOTE_SOUND, type Note } from "./content";

/** The game's own ocarina sounds, decoded from the player's game files by the app's backend (get_sound) and played
 *  with Web Audio. Nothing of the game is shipped: without a readable game folder a plain tone stands in. */

let ctx: AudioContext | null = null;
export const audio = () => (ctx ??= new AudioContext());

const cache = new Map<string, Promise<AudioBuffer | null>>();
/** A sound by its file name (`Ocarina_A`, `Piccolo_HighD`, `Ocarina_ZeldaLullaby`). Null when it cannot be read. */
export function gameSound(name: string, whole = false): Promise<AudioBuffer | null> {
  let p = cache.get(name);
  if (!p) {
    p = invoke<ArrayBuffer>("get_sound", { name, whole })
      .then((b) => audio().decodeAudioData(b))
      .catch(() => null);
    cache.set(name, p);
  }
  return p;
}

/** Which of the game's sound sets an ocarina uses: `Ocarina_*` or `Piccolo_*` (the smaller ocarina's set [I]). */
export type Voice = "Ocarina" | "Piccolo";

/** The sound file for a note, raised or lowered by `bend` semitones. */
export const noteFile = (voice: Voice, n: Note, bend = 0) => {
  const i = CHROMATIC.indexOf(NOTE_SOUND[n]) + bend;
  return `${voice}_${CHROMATIC[Math.max(0, Math.min(CHROMATIC.length - 1, i))]}`;
};

/** Decoded notes, ready to start without waiting. */
const ready = new Map<string, AudioBuffer | null>();

/** Loads a voice's notes (and their neighbours for ♭ and ♯) ahead of time so the first press sounds at once. */
export function preload(voice: Voice) {
  for (const n of Object.keys(NOTE_SOUND) as Note[])
    for (const b of [-1, 0, 1]) {
      const f = noteFile(voice, n, b);
      void gameSound(f).then((x) => ready.set(f, x));
    }
}

/** A sounding note; `stop` lets it fade out like a released button, `bend` slides it to another semitone offset. */
export interface Held {
  stop: () => void;
  bend: (b: number) => void;
}

/** Starts a note now. Holding it sustains the game's recording (up to four seconds); `stop` releases it. */
export function startNote(voice: Voice, n: Note, bend = 0): Held {
  const a = audio();
  if (a.state === "suspended") void a.resume();
  const t = a.currentTime;
  const g = a.createGain();
  g.connect(a.destination);
  const file = noteFile(voice, n, bend);
  let src: AudioScheduledSourceNode | null = null;
  const buf = ready.get(file);
  if (buf) {
    const s = a.createBufferSource();
    s.buffer = buf;
    s.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.015);
    s.start(t);
    src = s;
  } else {
    // The game's sound is not loaded (yet): a soft tone at the note's pitch.
    void gameSound(file).then((x) => ready.set(file, x));
    const o = a.createOscillator();
    o.type = "sine";
    o.frequency.value = NOTE_PITCH[n] * 2 ** (bend / 12);
    o.connect(g);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.03);
    o.start(t);
    src = o;
  }
  const began = t;
  let done = false;
  return {
    bend: (b: number) => {
      if (done || !src) return;
      const now = a.currentTime;
      if (src instanceof AudioBufferSourceNode) src.playbackRate.setTargetAtTime(2 ** ((b - bend) / 12), now, 0.03);
      else if (src instanceof OscillatorNode) src.frequency.setTargetAtTime(NOTE_PITCH[n] * 2 ** (b / 12), now, 0.03);
    },
    stop: () => {
      if (done) return;
      done = true;
      // Short taps still sound for a moment, as the game's notes do.
      const at = Math.max(a.currentTime, began + 0.22);
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(g.gain.value || 0.9, at);
      g.gain.linearRampToValueAtTime(0, at + 0.14);
      src?.stop(at + 0.16);
    },
  };
}

/** Plays a note for `ms` milliseconds. */
export function playNote(voice: Voice, n: Note, ms = 380, bend = 0) {
  const h = startNote(voice, n, bend);
  setTimeout(h.stop, ms);
}

/** Plays one of the game's own song recordings (`Ocarina_ZeldaLullaby`, ...). Resolves to a stop function and the
 *  length in seconds, or null when the game folder cannot be read. */
export async function playRecording(name: string): Promise<{ stop: () => void; secs: number } | null> {
  const buf = await gameSound(name, true);
  if (!buf) return null;
  const a = audio();
  if (a.state === "suspended") await a.resume();
  const s = a.createBufferSource();
  s.buffer = buf;
  s.connect(a.destination);
  s.start();
  return {
    stop: () => {
      try {
        s.stop();
      } catch {
        /* already ended */
      }
    },
    secs: buf.duration,
  };
}
