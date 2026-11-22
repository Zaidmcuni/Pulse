/**
 * Owner: Ali
 * Purpose: Results screen (/results/:resultId)
 * FRs: FR-35, FR-36, FR-38, FR-46
 * Edited: Mohamed (council redesign: score count-up, level medal, one-line explanation, Share to Crew, Dance again, Next dancer)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ClipReplay } from "../../clip/ClipReplay";
import { HighlightDownload } from "../../clip/HighlightDownload";
import { getResultHighlight, store } from "../../data/store";
import type { AccuracyLevel, EarnedBadge, SessionResult } from "../../types/pulse";
import { formatDanceLength } from "../dance/GetReady";
import { badgeNames } from "./badgeNames";
import "./Results.css";

const COUNT_UP_MS = 900; // display only
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const cheer: Record<AccuracyLevel, string> = {
  bronze: "Every move counts. Nice work!",
  silver: "Nice work. Keep it up!",
  gold: "Great dance!",
  superstar: "Superstar moves!",
};

/** The score counts up once on arrival; server render and reduced motion show the final number. */
function CountUp({ value }: { value: number }): ReactElement {
  const [shown, setShown] = useState(value);
  useIsomorphicLayoutEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let frame = 0;
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    setShown(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

function PostResult({ result, canShareClip }: { result: SessionResult; canShareClip: boolean }): ReactElement {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  if (store.listFeed().some((post) => post.resultId === result.id)) {
    return <p>This result is already posted.</p>;
  }

  const groups = store.listGroups().filter(({ memberIds }) => memberIds.includes(result.playerId));

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (store.listFeed().some((post) => post.resultId === result.id)) {
      setError("This result is already posted.");
      return;
    }

    const values = new FormData(event.currentTarget);
    const selected = new Set(values.getAll("group"));
    try {
      store.createPost({
        authorId: result.playerId,
        resultId: result.id,
        groupIds: groups.filter(({ id }) => selected.has(id)).map(({ id }) => id),
        showCalories: values.has("showCalories"),
        hasClip: canShareClip && values.has("hasClip"),
      });
    } catch {
      setError("Could not post your result. Try again.");
      return;
    }
    void navigate("/feed");
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => dialog.current?.showModal()}>
        Share to Crew
      </button>
      <dialog
        ref={dialog}
        className="card session-post-dialog"
        aria-labelledby="session-post-title"
        onClose={() => { form.current?.reset(); setError(""); }}
      >
        <form ref={form} onSubmit={submit}>
          <h2 id="session-post-title">Share to Crew</h2>
          <p>Your result appears in Crew and on your profile. Your body stats and heart data stay private.</p>
          {groups.length > 0 && (
            <fieldset>
              <legend>Also share with groups</legend>
              {groups.map(({ id, name }) => (
                <label key={id}><input type="checkbox" name="group" value={id} /> {name}</label>
              ))}
            </fieldset>
          )}
          <label><input type="checkbox" name="showCalories" /> Show estimated calories</label>
          <label>
            <input
              type="checkbox"
              name="hasClip"
              disabled={!canShareClip}
              aria-describedby={canShareClip ? undefined : "session-post-clip-note"}
            />
            {" "}Include highlight clip
          </label>
          {!canShareClip && <p id="session-post-clip-note">No highlight clip is available for this result.</p>}
          {error && <p role="alert">{error}</p>}
          <div className="session-post-actions">
            <button className="btn btn-secondary" type="button" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="btn btn-primary" type="submit">Share</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function BadgeUnlock({ badges }: { badges: EarnedBadge[] }): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="card session-post-dialog" aria-labelledby="badge-unlock-title">
      <form method="dialog">
        <h2 id="badge-unlock-title">Badges unlocked</h2>
        <ul>{badges.map(({ badgeId }) => <li key={badgeId}>{badgeNames[badgeId]}</li>)}</ul>
        <button type="submit" className="btn btn-primary">Continue</button>
      </form>
    </dialog>
  );
}

export default function Results(): ReactElement {
  const { resultId } = useParams();
  const result = resultId ? store.getResult(resultId) : undefined;
  const completedByActiveProfile = result?.completed && store.getActiveProfile()?.id === result.playerId ? result : undefined;
  const earned = completedByActiveProfile
    ? store.listBadges(completedByActiveProfile.playerId).filter((badge) => badge.earnedAtIso === completedByActiveProfile.createdAtIso)
    : [];
  const ownedResultId = completedByActiveProfile?.id;
  const highlight = useMemo(() => ownedResultId ? getResultHighlight(ownedResultId) : undefined, [ownedResultId]);
  const dance = highlight && completedByActiveProfile && store.getDance(completedByActiveProfile.danceId);
  const title = result ? (result.completed ? "Dance complete" : "Dance ended early") : "Result not found";

  return (
    <section className="card session-results" aria-labelledby="session-results-title">
      <h1 id="session-results-title">{title}</h1>
      {result ? (
        <dl className="session-results-metrics" aria-label="Session metrics">
          {result.completed && (
            <>
              <div className="session-results-points">
                <dt>Total points</dt>
                <dd><CountUp value={result.totalPoints} /></dd>
              </div>
              <div>
                <dt>Accuracy</dt>
                <dd>{result.accuracyPct}%</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd><span className={`session-results-medal is-${result.level}`}>{result.level}</span></dd>
              </div>
            </>
          )}
          <div>
            <dt>Duration</dt>
            <dd>{formatDanceLength(result.durationSec)}</dd>
          </div>
          <div>
            <dt>Calories</dt>
            <dd>{result.caloriesKcal} kcal</dd>
            <dd className="session-results-privacy">Estimated and private</dd>
          </div>
        </dl>
      ) : (
        <p>This session result is unavailable.</p>
      )}
      {result?.completed && (
        <div className="session-results-cheer">
          <p className="session-results-cheer-line">{cheer[result.level]}</p>
          <p>Points = how hard your heart worked &times; how well you matched.</p>
        </div>
      )}
      {earned.length > 0 && <BadgeUnlock key={resultId} badges={earned} />}
      {highlight && (
        <>
          <h2>Highlight</h2>
          <ClipReplay {...highlight} />
          {dance && <HighlightDownload key={ownedResultId} highlight={highlight} audioUrl={dance.audioUrl} />}
        </>
      )}
      <div className="session-results-actions">
        {completedByActiveProfile && (
          <PostResult key={completedByActiveProfile.id} result={completedByActiveProfile} canShareClip={highlight !== undefined} />
        )}
        {result && (
          <Link className="btn btn-secondary" to={`/dance/${encodeURIComponent(result.danceId)}/ready`}>Dance again</Link>
        )}
        {result && <Link className="btn btn-secondary" to="/who">Next dancer</Link>}
        <Link className="btn btn-secondary session-results-quiet" to="/dances">Back to dances</Link>
      </div>
    </section>
  );
}
