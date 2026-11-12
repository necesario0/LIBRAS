import { useEffect, useRef, useState } from "react";
import { CAMERA_MESSAGES, CameraError, startCamera } from "./camera.ts";

interface Props {
  /** Text of a barcode in view. Repeats while the barcode stays in view. */
  onRead: (text: string) => void;
  /** The camera could not start; the page keeps working with typed codes. */
  onProblem: (message: string) => void;
}

/** The phone camera with a viewfinder. It starts when it appears and stops when it goes away. */
export function CameraView({ onRead, onProblem }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ onRead, onProblem });
  useEffect(() => {
    latest.current = { onRead, onProblem };
  });

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let session: Awaited<ReturnType<typeof startCamera>> | undefined;
    let gone = false;
    startCamera(element, (text) => latest.current.onRead(text)).then(
      (started) => {
        if (gone) started.stop();
        else {
          session = started;
          setReady(true);
        }
      },
      (error: unknown) => {
        if (!gone) latest.current.onProblem(error instanceof CameraError ? error.message : CAMERA_MESSAGES.failed);
      },
    );
    return () => {
      gone = true;
      session?.stop();
    };
  }, []);

  return (
    <div className={`camera${ready ? " camera--ready" : ""}`}>
      <video ref={video} className="camera__video" playsInline muted aria-label="Camera view" />
      <div className="camera__frame" aria-hidden="true">
        <span className="camera__line" />
      </div>
      {!ready && <p className="camera__starting">Starting the camera...</p>}
    </div>
  );
}
