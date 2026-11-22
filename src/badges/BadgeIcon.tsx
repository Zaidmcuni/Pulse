/**
 * Owner: Mohamed
 * Purpose: Medal art for one badge, drawn as inline SVG (ribbon, tier ring, inner disc, symbol, padlock when locked).
 * FRs: FR-46
 */

import { useId, type ReactElement } from "react";
import type { BadgeId } from "../types/pulse";
import { getBadgeDef, type BadgeFamily, type BadgeTier } from "./catalogue";

const TIER_COLOURS: Record<BadgeTier, string> = {
  bronze: "#cd7f32",
  silver: "#c0c7d1",
  gold: "#f5b301",
  platinum: "#7dd3fc",
};

// Badges without a tier take their family colour.
const FAMILY_COLOURS: Record<BadgeFamily, string> = {
  milestones: "#ff5a1f",
  points: "#f5b301",
  social: "#22c55e",
};

const DISC_BASE = "#131924";
const SYMBOL = "#ffffff";

export function badgeColour(id: BadgeId): string {
  const { tier, family } = getBadgeDef(id);
  return tier ? TIER_COLOURS[tier] : FAMILY_COLOURS[family];
}

function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

function Foot({ x, y }: { x: number; y: number }): ReactElement {
  return (
    <g fill={SYMBOL}>
      <ellipse cx={x} cy={y} rx={5.5} ry={8} />
      <ellipse cx={x} cy={y + 12} rx={4} ry={3.5} />
      <circle cx={x - 3.5} cy={y - 10.5} r={1.8} />
      <circle cx={x} cy={y - 12} r={1.8} />
      <circle cx={x + 3.5} cy={y - 10.5} r={1.6} />
    </g>
  );
}

function ClubText({ text }: { text: string }): ReactElement {
  return (
    <text x={50} y={45} textAnchor="middle" dominantBaseline="central" fill={SYMBOL}
      fontWeight={800} fontSize={text.length > 2 ? 18 : 22} style={{ fontFamily: "inherit" }}>
      {text}
    </text>
  );
}

function Symbol({ id }: { id: BadgeId }): ReactElement {
  switch (id) {
    case "first_steps":
      return <g><Foot x={42} y={48} /><Foot x={58} y={40} /></g>;
    case "on_fire":
      return (
        <path fill={SYMBOL} d="M50 22 C58 32 66 38 64 50 C63 60 56 66 50 66 C44 66 37 60 36 50 C35 42 41 38 44 32 C45 38 47 41 50 42 C52 36 52 29 50 22 Z" />
      );
    case "superstar":
      return <polygon fill={SYMBOL} points={starPoints(50, 45, 20, 8)} />;
    case "1k_club":
      return <ClubText text="1K" />;
    case "3k_club":
      return <ClubText text="3K" />;
    case "5k_club":
      return <ClubText text="5K" />;
    case "10k_club":
      return <ClubText text="10K" />;
    case "crew_player":
      return (
        <g fill={SYMBOL}>
          <circle cx={36} cy={39} r={4.2} />
          <path d="M28 57 A8 8 0 0 1 44 57 Z" />
          <circle cx={64} cy={39} r={4.2} />
          <path d="M56 57 A8 8 0 0 1 72 57 Z" />
          <circle cx={50} cy={35} r={5.5} stroke={DISC_BASE} strokeWidth={1.5} />
          <path d="M39 57 A11 11 0 0 1 61 57 Z" stroke={DISC_BASE} strokeWidth={1.5} />
        </g>
      );
    case "podium":
      return (
        <g>
          <rect x={28} y={45} width={14} height={14} fill={SYMBOL} />
          <rect x={42} y={33} width={16} height={26} fill={SYMBOL} />
          <rect x={58} y={49} width={14} height={10} fill={SYMBOL} />
          <text x={50} y={42} textAnchor="middle" dominantBaseline="central" fill={DISC_BASE}
            fontWeight={800} fontSize={12} style={{ fontFamily: "inherit" }}>1</text>
        </g>
      );
  }
}

export function BadgeIcon(props: { id: BadgeId; earned: boolean; size?: number }): ReactElement {
  const { id, earned, size = 88 } = props;
  const { name } = getBadgeDef(id);
  const colour = badgeColour(id);
  // useId gives ":r0:"-style ids; strip the colons so url(#…) references stay valid everywhere.
  const suffix = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const highlightId = `badge-${id}-highlight-${suffix}`;
  const grayId = `badge-${id}-gray-${suffix}`;

  return (
    <svg className="badge-icon" viewBox="0 0 100 100" width={size} height={size} role="img"
      aria-label={`${name} badge, ${earned ? "earned" : "locked"}`}>
      <defs>
        <radialGradient id={highlightId} cx="38%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        {!earned && (
          <filter id={grayId}>
            <feColorMatrix type="saturate" values="0" />
          </filter>
        )}
      </defs>
      {/* Locked: grayscale via an SVG filter (CSS filter on inner SVG elements isn't reliable everywhere). */}
      <g filter={earned ? undefined : `url(#${grayId})`} opacity={earned ? undefined : 0.35}>
        <polygon points="36,62 26,95 35,89 42,96 48,68" fill={colour} opacity={0.85} />
        <polygon points="52,68 58,96 65,89 74,95 64,62" fill={colour} opacity={0.85} />
        <circle cx={50} cy={44} r={31} fill={DISC_BASE} />
        <circle cx={50} cy={44} r={31} fill={colour} opacity={0.25} />
        <circle cx={50} cy={44} r={31} fill={`url(#${highlightId})`} />
        <circle cx={50} cy={44} r={31} fill="none" stroke={colour} strokeWidth={6} />
        <Symbol id={id} />
      </g>
      {!earned && (
        <g className="badge-icon-lock">
          <circle cx={81} cy={82} r={12} fill={DISC_BASE} stroke="#9aa7bd" strokeWidth={1.5} />
          <path d="M76.5 81 v-4 a4.5 4.5 0 0 1 9 0 v4" fill="none" stroke={SYMBOL} strokeWidth={2.2} />
          <rect x={74} y={80} width={14} height={10} rx={2} fill={SYMBOL} />
        </g>
      )}
    </svg>
  );
}
