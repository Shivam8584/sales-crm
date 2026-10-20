"use client";

import { useEffect } from "react";

export const EMBED_HEIGHT_MESSAGE = "hypedrive:demo-height";

/** Tells the host page how tall the embedded form is, so its iframe never scrolls. */
export default function EmbedResizer() {
  useEffect(() => {
    if (window.parent === window) return;
    const post = () =>
      window.parent.postMessage(
        {
          type: EMBED_HEIGHT_MESSAGE,
          height: Math.ceil(document.documentElement.scrollHeight),
        },
        "*",
      );
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    post();
    return () => observer.disconnect();
  }, []);
  return null;
}
