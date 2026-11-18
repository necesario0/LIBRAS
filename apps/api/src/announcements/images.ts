import sharp from "sharp";
import type { OutputInfo } from "sharp";
import { ANNOUNCEMENT_BANNER_MIN_WIDTH, ANNOUNCEMENT_IMAGE_MAX_BYTES, ANNOUNCEMENT_MESSAGES } from "@libras/shared";
import { AppError } from "../errors.ts";

/**
 * The poster image of an Announcement: what the API makes of an upload. The
 * upload itself is never stored. The API reads its real type from its content,
 * then writes two new JPEGs with no metadata at all (no location, no camera,
 * no thumbnail): sharp drops every metadata block unless asked to keep it.
 */

/** The poster is resized to fit a phone screen at this size, never enlarged. */
const POSTER_MAX_WIDTH = 1200;
const POSTER_MAX_HEIGHT = 2400;
/** The banner is at most this wide (and half as high). */
const BANNER_MAX_WIDTH = 1200;
const JPEG = { quality: 84, mozjpeg: true } as const;
/** Refuses a decompression bomb: a small file that would open as a gigantic picture. */
const MAX_INPUT_PIXELS = 50_000_000;

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

export const imageRefusals = {
  required: () => new AppError(400, "announcement_image_required", ANNOUNCEMENT_MESSAGES.imageRequired),
  type: () => new AppError(400, "announcement_image_type", ANNOUNCEMENT_MESSAGES.imageType),
  tooLarge: () => new AppError(413, "announcement_image_too_large", ANNOUNCEMENT_MESSAGES.imageTooLarge),
  tooSmall: () => new AppError(400, "announcement_image_too_small", ANNOUNCEMENT_MESSAGES.imageTooSmall),
  unreadable: () => new AppError(400, "announcement_image_unreadable", ANNOUNCEMENT_MESSAGES.imageUnreadable),
};

/** The two stored versions of a poster. */
export interface PreparedPoster {
  poster: Buffer;
  posterWidth: number;
  posterHeight: number;
  banner: Buffer;
}

/** What the first bytes of a file say it is. Only these three are accepted; a name or a declared type counts for nothing. */
function sniffedFormat(bytes: Uint8Array): "jpeg" | "png" | "webp" | undefined {
  const starts = (offset: number, ...expected: number[]) => expected.every((byte, index) => bytes[offset + index] === byte);
  if (starts(0, 0xff, 0xd8, 0xff)) return "jpeg";
  if (starts(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  return undefined;
}

/**
 * The 2:1 region of a `width` x `height` image at `position` (0 to 1): the full
 * width of a poster taller than 2:1, moved down; the full height of a wider
 * one, moved right. The desk page's crop frame works the same way.
 */
export function bannerRegion(width: number, height: number, position: number): { left: number; top: number; width: number; height: number } {
  if (width / height <= 2) {
    const bannerHeight = Math.min(height, Math.round(width / 2));
    return { left: 0, top: Math.round(position * (height - bannerHeight)), width: Math.min(width, bannerHeight * 2), height: bannerHeight };
  }
  const bannerWidth = Math.min(width, height * 2);
  return { left: Math.round(position * (width - bannerWidth)), top: 0, width: bannerWidth, height };
}

/** Cuts the 2:1 banner from a stored poster (already upright and free of metadata). */
export async function cutBanner(poster: Buffer, width: number, height: number, cropPosition: number): Promise<Buffer> {
  const region = bannerRegion(width, height, cropPosition);
  const bannerWidth = Math.min(BANNER_MAX_WIDTH, region.width);
  return sharp(poster)
    .extract(region)
    .resize({ width: bannerWidth, height: Math.round(bannerWidth / 2), fit: "fill" })
    .jpeg(JPEG)
    .toBuffer();
}

/**
 * Checks an upload and makes its two stored versions. Throws an AppError the
 * Librarian can act on: no file, over 5 MB, not really a JPG, PNG or WebP,
 * unreadable, or too small to give a sharp banner.
 */
export async function preparePoster(upload: Uint8Array | undefined, cropPosition: number): Promise<PreparedPoster> {
  if (upload === undefined || upload.byteLength === 0) throw imageRefusals.required();
  if (upload.byteLength > ANNOUNCEMENT_IMAGE_MAX_BYTES) throw imageRefusals.tooLarge();
  const sniffed = sniffedFormat(upload);
  if (sniffed === undefined) throw imageRefusals.type();

  let poster: { data: Buffer; info: OutputInfo };
  try {
    const image = sharp(upload, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const { format } = await image.metadata();
    if (format === undefined || !ACCEPTED_FORMATS.has(format)) throw imageRefusals.type();
    poster = await image
      // Turns the picture upright by its EXIF orientation before the EXIF is dropped.
      .autoOrient()
      .resize({ width: POSTER_MAX_WIDTH, height: POSTER_MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
      // JPEG has no transparency: a transparent PNG or WebP goes onto white.
      .flatten({ background: "#ffffff" })
      .jpeg(JPEG)
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw imageRefusals.unreadable();
  }

  const { width, height } = poster.info;
  const region = bannerRegion(width, height, cropPosition);
  if (region.width < ANNOUNCEMENT_BANNER_MIN_WIDTH) throw imageRefusals.tooSmall();
  return { poster: poster.data, posterWidth: width, posterHeight: height, banner: await cutBanner(poster.data, width, height, cropPosition) };
}
