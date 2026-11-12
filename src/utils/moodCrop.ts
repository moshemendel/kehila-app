/**
 * Pan/zoom of the main ("mood") picture inside its frame.
 *
 * A crop is a point of the original image that sits at the CENTRE of the frame
 * (`fx`, `fy` as fractions of the image's width/height) and a zoom relative to
 * "cover" (1 = the picture just fills the frame). It is deliberately not a pixel
 * rectangle: the frame is a fixed 186 high but as wide as the phone, so the same
 * centre and zoom stay sensible on every screen width.
 *
 * The console's editor uses the same maths (kehila-admin `ImageUploadField`);
 * change them together.
 */
import type { ImageCrop } from '../types';

/** Height of the main picture frame on the synagogue and mikveh detail cards. */
export const MOOD_FRAME_H = 186;

export const CROP_ZOOM_MIN = 1;
export const CROP_ZOOM_MAX = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? clamp(zoom, CROP_ZOOM_MIN, CROP_ZOOM_MAX) : CROP_ZOOM_MIN;
}

/** Size the whole image is drawn at, for a frame W x H and an image w x h. */
export function displaySize(W: number, H: number, w: number, h: number, zoom: number) {
  const s = Math.max(W / w, H / h) * clampZoom(zoom);
  return { dw: w * s, dh: h * s };
}

/**
 * Pulls the centre back inside the range where the frame is still completely
 * covered. When the image is exactly as wide as the frame the range collapses to
 * 0.5, so there is nothing to move on that axis.
 */
export function clampCenter(W: number, H: number, dw: number, dh: number, fx: number, fy: number) {
  const mx = W / (2 * dw);
  const my = H / (2 * dh);
  return {
    fx: clamp(Number.isFinite(fx) ? fx : 0.5, mx, 1 - mx),
    fy: clamp(Number.isFinite(fy) ? fy : 0.5, my, 1 - my),
  };
}

/** Where to draw the image, relative to the frame's top-left corner. */
export function layoutFor(W: number, H: number, w: number, h: number, zoom: number, fx: number, fy: number) {
  const { dw, dh } = displaySize(W, H, w, h, zoom);
  const c = clampCenter(W, H, dw, dh, fx, fy);
  return {
    left: W / 2 - c.fx * dw,
    top: H / 2 - c.fy * dh,
    width: dw,
    height: dh,
  };
}

/** True for a crop that only says "centred cover" — nothing to apply. */
export function isDefaultCrop(crop?: Pick<ImageCrop, 'zoom' | 'fx' | 'fy'>): boolean {
  if (!crop) return true;
  return crop.zoom <= 1.001 && Math.abs(crop.fx - 0.5) < 0.001 && Math.abs(crop.fy - 0.5) < 0.001;
}

/**
 * The crop to use for a given primary image, or undefined. A crop made for an
 * earlier picture is ignored, so replacing the picture never inherits it.
 */
export function cropForImage(
  imageUrl: string | undefined,
  crop?: ImageCrop,
  /** Keep a "centred cover" crop instead of treating it as none. Needed where the
   *  picture without a crop is NOT shown as cover (businesses), so that choosing
   *  the default fit is itself a choice. */
  keepDefault = false,
): ImageCrop | undefined {
  if (!imageUrl || !crop || crop.url !== imageUrl) return undefined;
  if (!Number.isFinite(crop.zoom) || !Number.isFinite(crop.fx) || !Number.isFinite(crop.fy)) return undefined;
  return !keepDefault && isDefaultCrop(crop) ? undefined : crop;
}
