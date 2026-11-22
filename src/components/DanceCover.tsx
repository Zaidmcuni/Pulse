/**
 * Owner: Shared
 * Purpose: Square cover art thumbnail with accessible alt text and offline-safe gradient fallback.
 */

import { useEffect, useState, type ReactElement } from "react";
import "./DanceCover.css";

export type DanceCoverSize = "sm" | "md" | "lg";

export interface DanceCoverProps {
  title: string;
  artist?: string;
  coverUrl?: string;
  size?: DanceCoverSize;
  className?: string;
}

/** Accessible alt description for song cover artwork. */
export function formatDanceCoverAlt(title: string, artist?: string): string {
  const cleanArtist = artist?.trim();
  return cleanArtist ? `${title} by ${cleanArtist} cover art` : `${title} cover art`;
}

export function DanceCover({
  title,
  artist,
  coverUrl,
  size = "md",
  className,
}: DanceCoverProps): ReactElement {
  const normalizedUrl = coverUrl?.trim() || undefined;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [normalizedUrl]);

  const showImg = Boolean(normalizedUrl) && !failed;
  const classes = [`dance-cover`, `dance-cover--${size}`, className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      {showImg ? (
        <img
          src={normalizedUrl}
          alt={formatDanceCoverAlt(title, artist)}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">♪</span>
      )}
    </div>
  );
}
