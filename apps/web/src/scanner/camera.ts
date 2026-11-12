import type { DecodeHintType } from "@zxing/library";

/**
 * Reads 1D barcodes from the phone camera, in the browser (no app to install).
 *
 * The Digital ID is Code 128 (ADR 0004) and Copy barcodes are numeric 1D codes
 * too, so the reader looks for Code 128 first among the common 1D symbologies
 * a library label may use. Where the browser has the built-in `BarcodeDetector`
 * (Chrome on Android) that is used, because it is fast and tuned for phone
 * cameras. Everywhere else (Safari on iPhone, desktop browsers) ZXing, a
 * JavaScript reader, decodes the same frames. Both only see the text of the
 * barcode; what to do with it is decided by the desk page.
 *
 * The camera needs a secure context: HTTPS, or the phone's own `localhost`.
 */

/** Code 128 first: it is what every Digital ID uses. The others are what library labels commonly are. */
export const BARCODE_FORMATS = ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e"] as const;

export type CameraProblem = "insecure" | "unsupported" | "denied" | "no_camera" | "busy" | "failed";

export class CameraError extends Error {
  readonly problem: CameraProblem;
  constructor(problem: CameraProblem, message: string) {
    super(message);
    this.name = "CameraError";
    this.problem = problem;
  }
}

export const CAMERA_MESSAGES: Record<CameraProblem, string> = {
  insecure:
    "The camera only works on a secure (https) page. Open the scanner page from its https address, or type the code below.",
  unsupported: "This browser cannot use the camera. Try Chrome or Safari, or type the code below.",
  denied: "Camera access was blocked. Allow the camera for this page in the browser settings, then reload. You can type the code below meanwhile.",
  no_camera: "No camera was found on this device. Type the code below.",
  busy: "The camera is being used by another app. Close it, then reload this page.",
  failed: "The camera could not be started. Reload the page, or type the code below.",
};

export interface CameraSession {
  /** Which decoder is reading frames. */
  engine: "native" | "zxing";
  stop(): void;
}

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
interface NativeDetectorConstructor {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const FRAME_INTERVAL_MS = 90;
/** Frames are scaled down to this width before ZXing looks at them: a phone sends 1920 or more, which is slow and no better for a barcode held close. */
const ZXING_MAX_WIDTH = 960;

async function openCamera(): Promise<MediaStream> {
  if (!window.isSecureContext) throw new CameraError("insecure", CAMERA_MESSAGES.insecure);
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("unsupported", CAMERA_MESSAGES.unsupported);
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new CameraError("denied", CAMERA_MESSAGES.denied);
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new CameraError("no_camera", CAMERA_MESSAGES.no_camera);
    if (name === "NotReadableError") throw new CameraError("busy", CAMERA_MESSAGES.busy);
    throw new CameraError("failed", CAMERA_MESSAGES.failed);
  }
}

/** A decoder: the text of the first barcode in the current video frame, or undefined. */
type Decode = (video: HTMLVideoElement) => Promise<string | undefined>;

async function nativeDecoder(): Promise<Decode | undefined> {
  const Detector = (window as unknown as { BarcodeDetector?: NativeDetectorConstructor }).BarcodeDetector;
  if (!Detector) return undefined;
  try {
    const supported = await Detector.getSupportedFormats();
    // Without Code 128 the built-in detector cannot read a Digital ID: use ZXing instead.
    if (!supported.includes("code_128")) return undefined;
    const detector = new Detector({ formats: BARCODE_FORMATS.filter((format) => supported.includes(format)) });
    return async (video) => (await detector.detect(video))[0]?.rawValue;
  } catch {
    return undefined;
  }
}

async function zxingDecoder(): Promise<Decode> {
  const zxing = await import("@zxing/library");
  const formats = [
    zxing.BarcodeFormat.CODE_128,
    zxing.BarcodeFormat.CODE_39,
    zxing.BarcodeFormat.EAN_13,
    zxing.BarcodeFormat.EAN_8,
    zxing.BarcodeFormat.UPC_A,
    zxing.BarcodeFormat.UPC_E,
  ];
  const hints = new Map<DecodeHintType, unknown>([
    [zxing.DecodeHintType.POSSIBLE_FORMATS, formats],
    [zxing.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new zxing.MultiFormatOneDReader(hints);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!context || video.videoWidth === 0) return undefined;
    const scale = Math.min(1, ZXING_MAX_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.HTMLCanvasElementLuminanceSource(canvas)));
    try {
      return reader.decode(bitmap, hints).getText();
    } catch {
      // NotFoundException: no barcode in this frame, which is the usual case.
      return undefined;
    }
  };
}

/**
 * Starts the camera in `video` and calls `onRead` with the text of each barcode
 * it reads (the same barcode is reported again while it stays in view: the
 * caller decides what to ignore). Throws CameraError with a message to show.
 */
export async function startCamera(video: HTMLVideoElement, onRead: (text: string) => void): Promise<CameraSession> {
  const stream = await openCamera();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopStream = () => stream.getTracks().forEach((track) => track.stop());
  try {
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    const native = await nativeDecoder();
    const decode = native ?? (await zxingDecoder());

    const tick = async () => {
      if (stopped) return;
      try {
        const text = await decode(video);
        if (text && !stopped) onRead(text);
      } catch {
        // A frame that could not be read is skipped.
      }
      if (!stopped) timer = setTimeout(() => void tick(), FRAME_INTERVAL_MS);
    };
    void tick();
    return {
      engine: native ? "native" : "zxing",
      stop() {
        stopped = true;
        if (timer !== undefined) clearTimeout(timer);
        stopStream();
        video.srcObject = null;
      },
    };
  } catch (error) {
    stopped = true;
    stopStream();
    throw error instanceof CameraError ? error : new CameraError("failed", CAMERA_MESSAGES.failed);
  }
}
