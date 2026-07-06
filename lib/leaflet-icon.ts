import type * as LeafletNS from "leaflet";
// Leaflet's default marker icon references image files by a relative path that
// bundlers rewrite incorrectly. Import the assets so the bundler emits real
// URLs, then point Leaflet's default icon at them. Call once after importing L.
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

let applied = false;

export function ensureDefaultIcon(L: typeof LeafletNS) {
  if (applied) return;
  applied = true;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: (markerIcon2x as { src: string }).src ?? markerIcon2x,
    iconUrl: (markerIcon as { src: string }).src ?? markerIcon,
    shadowUrl: (markerShadow as { src: string }).src ?? markerShadow,
  });
}
