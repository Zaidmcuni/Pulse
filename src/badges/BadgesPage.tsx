/**
 * Owner: Mohamed
 * Purpose: Badges page (/badges for you, /u/:playerId/badges for another dancer): every badge as a medal,
 *          earned in colour with the date, locked greyed out with progress, grouped by family.
 *          Shows only name, handle and badges (no body stats, email, heart rate or calories).
 * FRs: FR-46, FR-02, NFR-10
 */

import { useMemo, type CSSProperties, type ReactElement } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { store } from "../data/store";
import { displayHandle } from "../screens/setup/switcherHelpers";
import { BadgeDetail, ProgressBar } from "./BadgeDetail";
import { BadgeIcon, badgeColour } from "./BadgeIcon";
import { BADGE_CATALOGUE, FAMILY_LABELS, FAMILY_ORDER, getBadgeDef } from "./catalogue";
import { badgeProgress, type BadgeProgress } from "./progress";
import "./badges.css";

function BadgeTile({ progress, onOpen }: { progress: BadgeProgress; onOpen: () => void }): ReactElement {
  const { name } = getBadgeDef(progress.id);
  const glow = { "--badge-glow": badgeColour(progress.id) } as CSSProperties;
  return (
    <button type="button" className={`badges-tile ${progress.earned ? "is-earned" : "is-locked"}`} style={glow} onClick={onOpen}>
      <BadgeIcon id={progress.id} earned={progress.earned} />
      <strong>{name}</strong>
      {progress.earned && progress.earnedAtIso ? (
        <span className="badges-muted">
          Earned {new Date(progress.earnedAtIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      ) : (
        <>
          <span className="badges-muted">{progress.label}</span>
          {progress.target > 1 && <ProgressBar current={progress.current} target={progress.target} />}
        </>
      )}
    </button>
  );
}

export default function BadgesPage(): ReactElement {
  const { playerId: routeId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Opened from another page (e.g. Results after a workout): Back returns there, not to the grid.
  const backLabel = (useLocation().state as { backLabel?: string } | null)?.backLabel;
  const isOwn = routeId === undefined;
  const id = routeId ?? store.getActiveProfile()?.id;
  const profile = id === undefined ? undefined : store.listProfiles().find((p) => p.id === id);

  const profileId = profile?.id;
  const progress = useMemo(
    () => (profileId ? badgeProgress(profileId, store.listResults(profileId), store.listGroups(), store.listBadges(profileId)) : []),
    [profileId],
  );

  if (!profile) {
    return (
      <section className="badges-page">
        <div className="card badges-header">
          <h1>Dancer not found</h1>
          <Link className="btn btn-secondary" to="/feed">Back to feed</Link>
        </div>
      </section>
    );
  }

  const selected = progress.find((p) => p.id === searchParams.get("badge"));
  if (selected) {
    return (
      <section className="badges-page">
        <BadgeDetail
          progress={selected}
          backLabel={backLabel}
          onBack={() => (backLabel ? navigate(-1) : setSearchParams({}))}
        />
      </section>
    );
  }

  const earnedCount = progress.filter((p) => p.earned).length;
  return (
    <section className="badges-page" aria-labelledby="badges-title">
      <header className="card badges-header">
        {isOwn && <Link className="badges-back" to="/me">← Profile</Link>}
        <h1 id="badges-title">{isOwn ? "Your badges" : `${profile.displayName}'s badges`}</h1>
        <p className="badges-muted">{displayHandle(profile.handle)}</p>
        <p>{earnedCount} of {BADGE_CATALOGUE.length} earned</p>
        <ProgressBar current={earnedCount} target={BADGE_CATALOGUE.length} />
      </header>
      {FAMILY_ORDER.map((family) => {
        const items = progress.filter((p) => getBadgeDef(p.id).family === family);
        return (
          <section key={family} className="badges-family" aria-labelledby={`badges-${family}`}>
            <h2 id={`badges-${family}`}>
              {FAMILY_LABELS[family]} <span className="badges-muted">· {items.filter((p) => p.earned).length} / {items.length}</span>
            </h2>
            <div className="badges-grid">
              {items.map((p) => <BadgeTile key={p.id} progress={p} onOpen={() => setSearchParams({ badge: p.id })} />)}
            </div>
          </section>
        );
      })}
    </section>
  );
}
