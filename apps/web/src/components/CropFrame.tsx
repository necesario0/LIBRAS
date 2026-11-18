import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { bannerFrame } from "../announcements/draft.ts";
import type { DraftImage } from "../announcements/draft.ts";

interface Props {
  image: DraftImage;
  position: number;
  onChange: (position: number) => void;
}

/** One arrow key press moves the frame this far (of the room it has). */
const KEY_STEP = 0.05;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The poster with the fixed 2:1 frame of what Home shows. The frame spans the
 * poster's full width (or full height for a poster wider than 2:1) and is
 * dragged along the other side, with the pointer or the arrow keys.
 */
export function CropFrame({ image, position, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; position: number; room: number } | undefined>(undefined);
  const tall = image.width / image.height <= 2;
  const frame = bannerFrame(image.width, image.height, position);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    // The pixels the frame can travel: the poster's length on the free side minus the frame's.
    const room = tall ? rect.height * (1 - frame.height / 100) : rect.width * (1 - frame.width / 100);
    drag.current = { start: tall ? event.clientY : event.clientX, position, room };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.room <= 0) return;
    const moved = (tall ? event.clientY : event.clientX) - current.start;
    onChange(clamp(current.position + moved / current.room));
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowUp: -KEY_STEP, ArrowLeft: -KEY_STEP, ArrowDown: KEY_STEP, ArrowRight: KEY_STEP, Home: -1, End: 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onChange(clamp(position + step));
  }

  return (
    <div className="crop" ref={box} style={{ aspectRatio: `${image.width} / ${image.height}` }}>
      <img className="crop__image" src={image.src} alt="" draggable={false} />
      <div
        className="crop__frame"
        style={{ left: `${frame.left}%`, top: `${frame.top}%`, width: `${frame.width}%`, height: `${frame.height}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Part shown on Home"
        aria-orientation={tall ? "vertical" : "horizontal"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position * 100)}
        aria-valuetext={`${Math.round(position * 100)}% from the ${tall ? "top" : "left"}`}
        data-testid="crop-frame"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => (drag.current = undefined)}
        onPointerCancel={() => (drag.current = undefined)}
        onKeyDown={nudge}
      >
        <span className="crop__tag">Shown on Home</span>
      </div>
    </div>
  );
}
