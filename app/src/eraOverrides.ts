import { ERAS } from "./data/eras";
import type { ReportFile } from "./report";

/** A report whose entries without an age from the game's files get the one written in data/eras.ts. Entries that already
 *  have an age from the game are never changed. */
export function withEras(file: ReportFile): ReportFile {
  return {
    ...file,
    report: {
      ...file.report,
      categories: file.report.categories.map((c) => ({
        ...c,
        entries: c.entries.map((e) => (e.eras?.length || !ERAS[e.id] ? e : { ...e, eras: ERAS[e.id] })),
      })),
    },
  };
}
