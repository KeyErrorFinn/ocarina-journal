//! Magic bean soft soil and the rides that grow from it, read from the maps of the player's game (`Banc`).
//!
//! Each area's `<Area>_Adult_Static` file holds both halves of a spot: the soil (`Obj_SmallFarm_A_01` or `_A_02`, shown
//! while Link is a child, whose `DiveInsectGameData` names the game's flag `Gimmick_MagicBeanSoil_<Spot>`) and the ride
//! (`Obj_SmallFarm_A_03`, shown while Link is an adult), which links back to the soil with a `Plant` link, follows a
//! closed `Guide` rail from the file's `Rails`, and links to the `DestinationAnchor`s where Link can get off. A soil actor
//! with no flag and no rail (a second one stands in Kokiri Forest) is not a spot and is left out.

use serde::Serialize;

use crate::files::{GameFiles, Val};
use crate::{area_of, Error};

const FLAG_PREFIX: &str = "Gimmick_MagicBeanSoil_";

#[derive(Debug, Clone, Serialize)]
pub struct BeanSpot {
    /// The spot's name in the game's flag (`ZoraRiver02`, `LakeHylia`, `LostWood01`).
    pub id: String,
    /// The area folder the soil is placed in (`HyruleField` for Lake Hylia's, which is found on its own picture by position).
    pub area: String,
    /// Where the soil is, in metres.
    pub pos: [f64; 3],
    /// The ride's route as a line of points in metres, sampled from the rail's curve. Closed: the last point meets the first.
    pub path: Vec<[f64; 3]>,
    /// Where the ride lets Link off.
    pub stops: Vec<[f64; 3]>,
    /// The route's length in metres.
    pub length: f64,
}

type P = [f64; 3];

fn num(v: &Val) -> Option<f64> {
    Some(match v {
        Val::F32(f) => *f as f64,
        Val::F64(f) => *f,
        Val::I32(i) => *i as f64,
        Val::U32(i) => *i as f64,
        Val::I64(i) => *i as f64,
        Val::U64(i) => *i as f64,
        _ => return None,
    })
}

fn point(v: Option<&Val>) -> Option<P> {
    let a = v?.as_arr();
    Some([num(a.first()?)?, num(a.get(1)?)?, num(a.get(2)?)?])
}

/// One rail point: where it is and its bezier handles (`before` arrives, `after` leaves; a missing one is the point itself).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RailPoint {
    pub at: P,
    pub before: P,
    pub after: P,
}

fn lerp(a: P, b: P, t: f64) -> P {
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/// The route through `points` as a line: every segment is a cubic bezier from a point (leaving by its `after` handle)
/// to the next (arriving by its `before` handle), cut into `steps` pieces. A closed rail's last segment returns to the first.
pub fn sample(points: &[RailPoint], closed: bool, steps: usize) -> Vec<P> {
    let n = points.len();
    if n < 2 {
        return points.iter().map(|p| p.at).collect();
    }
    let segments = if closed { n } else { n - 1 };
    let mut out = Vec::with_capacity(segments * steps + 1);
    for i in 0..segments {
        let (a, b) = (points[i], points[(i + 1) % n]);
        for s in 0..steps {
            let t = s as f64 / steps as f64;
            let (p01, p12, p23) = (lerp(a.at, a.after, t), lerp(a.after, b.before, t), lerp(b.before, b.at, t));
            out.push(lerp(lerp(p01, p12, t), lerp(p12, p23, t), t));
        }
    }
    out.push(points[if closed { 0 } else { n - 1 }].at);
    out
}

fn length(path: &[P]) -> f64 {
    path.windows(2)
        .map(|w| ((w[1][0] - w[0][0]).powi(2) + (w[1][1] - w[0][1]).powi(2) + (w[1][2] - w[0][2]).powi(2)).sqrt())
        .sum()
}

fn hash_of(v: &Val) -> Option<i128> {
    v.get("Hash").and_then(Val::int)
}

pub fn bean_spots(files: &GameFiles) -> Result<Vec<BeanSpot>, Error> {
    let mut out = Vec::new();
    for dir in files.list("Banc") {
        for file in files.list(&format!("Banc/{dir}")) {
            let Some(banc) = file.strip_suffix("_Static.bcett.byml.zs") else { continue };
            if !banc.contains("_Adult") || area_of(banc) != dir {
                continue;
            }
            let Ok(doc) = files.byml(&format!("Banc/{dir}/{file}")) else { continue };
            let actors = doc.get("Actors").map(Val::as_arr).unwrap_or(&[]);
            let rails = doc.get("Rails").map(Val::as_arr).unwrap_or(&[]);
            let find = |h: i128| actors.iter().find(|a| hash_of(a) == Some(h));
            for soil in actors.iter().filter(|a| {
                matches!(a.get("Gyaml").and_then(Val::as_str), Some("Obj_SmallFarm_A_01" | "Obj_SmallFarm_A_02"))
            }) {
                let Some(id) = soil
                    .get("Dynamic")
                    .and_then(|d| d.get("DiveInsectGameData"))
                    .and_then(Val::as_str)
                    .and_then(|f| f.strip_prefix(FLAG_PREFIX))
                else {
                    continue;
                };
                let (Some(h), Some(pos)) = (hash_of(soil), point(soil.get("Translate"))) else { continue };
                // the ride that plants into this soil
                let Some(ride) = actors.iter().find(|a| {
                    a.get("Gyaml").and_then(Val::as_str) == Some("Obj_SmallFarm_A_03")
                        && a.get("Links").map(Val::as_arr).unwrap_or(&[]).iter().any(|l| {
                            l.get("Name").and_then(Val::as_str) == Some("Plant")
                                && l.get("Dst").and_then(Val::int) == Some(h)
                        })
                }) else {
                    continue;
                };
                let rail = ride
                    .get("Rails")
                    .map(Val::as_arr)
                    .unwrap_or(&[])
                    .first()
                    .and_then(|r| r.get("Dst").and_then(Val::int))
                    .and_then(|rh| rails.iter().find(|r| hash_of(r) == Some(rh)));
                let Some(rail) = rail else { continue };
                let points: Vec<RailPoint> = rail
                    .get("Points")
                    .map(Val::as_arr)
                    .unwrap_or(&[])
                    .iter()
                    .filter_map(|p| {
                        let at = point(p.get("Translate"))?;
                        Some(RailPoint {
                            at,
                            before: point(p.get("Control0")).unwrap_or(at),
                            after: point(p.get("Control1")).unwrap_or(at),
                        })
                    })
                    .collect();
                if points.len() < 2 {
                    continue;
                }
                let closed = rail.get("IsClosed").is_none_or(Val::truthy);
                let path = sample(&points, closed, 12);
                let stops: Vec<P> = ride
                    .get("Links")
                    .map(Val::as_arr)
                    .unwrap_or(&[])
                    .iter()
                    .filter(|l| l.get("Name").and_then(Val::as_str) == Some("Reference"))
                    .filter_map(|l| find(l.get("Dst")?.int()?))
                    .filter(|a| a.get("Gyaml").and_then(Val::as_str) == Some("DestinationAnchor"))
                    .filter_map(|a| point(a.get("Translate")))
                    .collect();
                out.push(BeanSpot { id: id.to_string(), area: dir.clone(), pos, length: length(&path), path, stops });
            }
        }
    }
    if out.is_empty() {
        return Err(Error::Game("no magic bean soil found in the game's maps".into()));
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rp(at: P) -> RailPoint {
        RailPoint { at, before: at, after: at }
    }

    #[test]
    fn a_rail_without_handles_is_straight_lines() {
        let line = sample(&[rp([0.0, 0.0, 0.0]), rp([10.0, 0.0, 0.0])], false, 5);
        assert_eq!(line.len(), 6);
        assert_eq!(line[0], [0.0, 0.0, 0.0]);
        assert_eq!(*line.last().unwrap(), [10.0, 0.0, 0.0]);
        assert!((length(&line) - 10.0).abs() < 1e-9);
    }

    #[test]
    fn a_closed_rail_returns_to_where_it_started() {
        let tri = [rp([0.0, 0.0, 0.0]), rp([10.0, 0.0, 0.0]), rp([10.0, 0.0, 10.0])];
        let line = sample(&tri, true, 4);
        assert_eq!(line.first(), line.last());
        assert_eq!(line.len(), 3 * 4 + 1);
    }

    #[test]
    fn handles_bend_the_route_between_the_points() {
        let a = RailPoint { at: [0.0, 0.0, 0.0], before: [0.0, 0.0, 0.0], after: [0.0, 0.0, 10.0] };
        let b = RailPoint { at: [10.0, 0.0, 0.0], before: [10.0, 0.0, 10.0], after: [10.0, 0.0, 0.0] };
        let line = sample(&[a, b], false, 10);
        let mid = line[5];
        assert!(mid[2] > 5.0, "the curve should bow out towards the handles: {mid:?}");
        assert!(length(&line) > 10.0);
    }
}
