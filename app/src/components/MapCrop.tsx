import { useMapImage, type MapIndex } from "../maps";

const ZOOM = 3;

/** The game's world map, from the player's own files, zoomed in on where `place` is drawn. */
export function MapCrop({ idx, place, zoom = ZOOM }: { idx: MapIndex; place: string; zoom?: number }) {
  const img = useMapImage(idx.world.image);
  const l = idx.world.labels[place];
  if (!img || !l) return null;
  const ar = img.h / img.w;
  const hx = 0.5 / zoom, hy = 9 / 16 / 2 / (zoom * ar); // half the visible part, as a fraction of the picture
  const x = Math.min(1 - hx, Math.max(hx, 0.5 + l[0] / idx.world.width));
  const y = Math.min(1 - hy, Math.max(hy, 0.5 - l[1] / idx.world.height));
  return <img className="crop" src={img.url} alt="" style={{ width: `${zoom * 100}%`, left: `calc(50% - ${x * zoom * 100}%)`, top: `calc(50% - ${y * zoom * ar * 100}cqw)` }} />;
}

