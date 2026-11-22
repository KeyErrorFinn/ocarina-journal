import { placeAt, project, useMapImage, type MapIndex } from "../maps";

const ZOOM = 3;

/** A picture zoomed in on a point (`fx`, `fy`: 0..1 of it), filling a `.shot` box whose height is `box` times its
 *  width (16:9 unless said) without showing past its edges; `marker` draws a pin on the point. */
function CropAt({
  url,
  w,
  h,
  fx,
  fy,
  zoom,
  marker,
  box = 9 / 16,
}: {
  url: string;
  w: number;
  h: number;
  fx: number;
  fy: number;
  zoom: number;
  marker?: boolean;
  box?: number;
}) {
  const ar = h / w;
  zoom = Math.max(zoom, box / ar); // never narrower than the box is tall
  const hx = 0.5 / zoom,
    hy = box / 2 / (zoom * ar); // half the visible part, as a fraction of the picture
  const x = Math.min(1 - hx, Math.max(hx, fx));
  const y = Math.min(1 - hy, Math.max(hy, fy));
  return (
    <>
      <img
        className="crop"
        src={url}
        alt=""
        draggable={false}
        style={{ width: `${zoom * 100}%`, left: `calc(50% - ${x * zoom * 100}%)`, top: `calc(50% - ${y * zoom * ar * 100}cqw)` }}
      />
      {marker && <i className="crop-pin" style={{ left: `calc(50% + ${(fx - x) * zoom * 100}%)`, top: `calc(50% + ${(fy - y) * zoom * ar * 100}cqw)` }} />}
    </>
  );
}

/** The game's world map, from the player's own files, zoomed in on where `place` is drawn. */
export function MapCrop({ idx, place, zoom = ZOOM, box }: { idx: MapIndex; place: string; zoom?: number; box?: number }) {
  const img = useMapImage(idx.world.image);
  const l = idx.world.labels[place];
  if (!img || !l) return null;
  return <CropAt {...img} fx={0.5 + l[0] / idx.world.width} fy={0.5 - l[1] / idx.world.height} zoom={zoom} box={box} />;
}

/** An area's own map (the era's picture), from the player's files, zoomed in on a position in it. */
export function SpotCrop({
  idx,
  area,
  pos,
  era,
  zoom = 5,
  marker,
  box,
}: {
  idx: MapIndex;
  area: string;
  pos: [number, number, number];
  era: "child" | "adult";
  zoom?: number;
  marker?: boolean;
  box?: number;
}) {
  const id = placeAt(idx, area, pos[0], pos[2]);
  const place = idx.places[id] ?? idx.places[area];
  const pic = place?.[era] ?? place?.child ?? place?.adult;
  const img = useMapImage(pic?.image);
  if (!place || !img) return null;
  const at = project(place, pos[0], pos[2], img.h / img.w);
  return <CropAt {...img} fx={at.left / 100} fy={at.top / 100} zoom={zoom} marker={marker} box={box} />;
}
