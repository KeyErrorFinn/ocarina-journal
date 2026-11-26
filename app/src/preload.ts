import { isRemote } from "./ipc";
import { loadBeans } from "./beans";
import { loadLandmarks } from "./landmarks";
import { loadLore } from "./lore";
import { loadIndex, preloadMapImages } from "./maps";
import { loadTapestry } from "./screens/Tapestry";

/** On a second screen every read crosses the network, so the screens that read the game's files (maps, tapestry, lore,
 *  rumors) would open blank for a moment. This starts those reads as soon as the page is up; the screens find the
 *  answers waiting. In the app's own window reads are instant and nothing is started early. */
export function warmUp() {
  if (!isRemote) return;
  loadIndex();
  // The tapestry is three big pictures: without these it opens on a blank for as long as they take to arrive.
  loadTapestry().then((idx) => idx && preloadMapImages(["tapestry/base", "tapestry/shadow", "tapestry/woven"]));
  loadLore();
  loadLandmarks();
  loadBeans();
  preloadMapImages(["world"]);
}
