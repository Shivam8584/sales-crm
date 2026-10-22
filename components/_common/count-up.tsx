"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/** A figure that counts up from zero the first time it shows; reduced motion shows the final value. */
export default function CountUp({
  value,
  format = String,
}: {
  value: number;
  format?: (value: number) => string;
}) {
  const reduce = useReducedMotion();
  const played = useRef(false);
  const [running, setRunning] = useState<number | null>(null);

  useEffect(() => {
    if (played.current || reduce || value === 0) return;
    played.current = true;
    let finished = false;
    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.33, 1, 0.68, 1],
      onUpdate: (latest) => setRunning(Math.round(latest)),
      onComplete: () => {
        finished = true;
        setRunning(null);
      },
    });
    return () => {
      controls.stop();
      if (!finished) played.current = false;
      setRunning(null);
    };
  }, [value, reduce]);

  return <span className="tabular-nums">{format(running ?? value)}</span>;
}
