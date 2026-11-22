/**
 * Owner: Ali
 * Purpose: Results screen (/results/:resultId)
 * FRs: FR-35, FR-36, FR-38, FR-46
 * Edited: Mohamed (council redesign: score count-up, level medal, one-line explanation, Share to Crew, Dance again, Next dancer)
 * Edited: Mohamed (task 21, Moves and Effort cards)
 * Edited: Mohamed (task 22, back arrow top right)
 * Edited: Toufic (UI sprint, #157: Workout summary heading, run-specific scoring caption; #142: heart-rate / accuracy chart)
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactElement } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { BadgeIcon } from "../../badges/BadgeIcon";
import "../../badges/badges.css";
import { DanceCover } from "../../components/DanceCover";
import { ClipReplay, type ClipReplayHandle } from "../../clip/ClipReplay";
import { HighlightDownload } from "../../clip/HighlightDownload";
import { getHighlightClip, setHighlightShowLandmarks } from "../../clip/highlightStore";
import { CONFIG } from "../../config";
import { getResultHighlight, store, type ResultHighlight } from "../../data/store";
import { EffortCard } from "../../health/EffortCard";
import { MovesCard } from "../../health/MovesCard";
import { maxHeartRate } from "../../scoring/effort";
import { resultHasHeartRate } from "../../scoring/session";
import type { AccuracyLevel, EarnedBadge, SessionResult } from "../../types/pulse";
import { formatDanceLabel, formatDanceLength } from "../dance/GetReady";
import { badgeNames } from "./badgeNames";
import { ResultsChart } from "./ResultsChart";
import "./Results.css";

const COUNT_UP_MS = 900; // display only
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const cheer: Record<AccuracyLevel, string> = {
  bronze: "Every move counts. Nice work!",
  silver: "Nice work. Keep it up!",
  gold: "Great dance!",
  superstar: "Superstar moves!",
};

/** How this run's points were earned (#157): watch, simulated heart rate, or moves only. */
function scoringCaption(result: SessionResult): string {
  if (result.samples.some((s) => s.hrSource === "ble")) {
    return "Points come from your heart-rate effort and how closely you matched the moves.";
  }
  if (resultHasHeartRate(result)) {
    return "Points come from simulated heart-rate effort and how closely you matched the moves.";
  }
  return "Points come from how closely you matched the moves.";
}

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
    let postId: string;
    try {
      postId = store.createPost({
        authorId: result.playerId,
        resultId: result.id,
        groupIds: groups.filter(({ id }) => selected.has(id)).map(({ id }) => id),
        showCalories: values.has("showCalories"),
        hasClip: canShareClip && values.has("hasClip"),
      }).id;
    } catch {
      setError("Could not post your result. Try again.");
      return;
    }
    void navigate("/feed", { state: { justPosted: postId } }); // the feed highlights and scrolls to it
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

/** Badges won in this workout; each opens its detail on the Badges page. */
function BadgeLinks({ badges }: { badges: EarnedBadge[] }): ReactElement {
  return (
    <ul className="badge-unlock-list">
      {badges.map(({ badgeId }) => (
        <li key={badgeId}>
          <Link to={`/badges?badge=${encodeURIComponent(badgeId)}`} state={{ backLabel: "Back to results" }}>
            <span aria-hidden="true"><BadgeIcon id={badgeId} earned size={64} /></span>
            {badgeNames[badgeId]}
          </Link>
        </li>
      ))}
    </ul>
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
        <BadgeLinks badges={badges} />
        <button type="submit" className="btn btn-primary">Continue</button>
      </form>
    </dialog>
  );
}

export default function Results(): ReactElement {
  const { resultId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // The pop-up only shows when DancePlay just finished this workout; reopening the result never repeats it.
  const [justFinished] = useState(() => (location.state as { justFinished?: boolean } | null)?.justFinished === true);
  useEffect(() => {
    if (justFinished) navigate(location.pathname, { replace: true, state: null });
  }, [justFinished, navigate, location.pathname]);
  const result = resultId ? store.getResult(resultId) : undefined;
  const completedByActiveProfile = result?.completed && store.getActiveProfile()?.id === result.playerId ? result : undefined;
  const earned = completedByActiveProfile
    ? store.listBadges(completedByActiveProfile.playerId).filter((badge) => badge.earnedAtIso === completedByActiveProfile.createdAtIso)
    : [];
  const ownedResultId = completedByActiveProfile?.id;
  const highlightClip = ownedResultId ? getHighlightClip(ownedResultId) : undefined;
  const savedHighlight = useMemo(() => ownedResultId ? getResultHighlight(ownedResultId) : undefined, [ownedResultId]);
  const dance = result ? store.getDance(result.danceId) : undefined;
  const replayControlRef = useRef<ClipReplayHandle | null>(null);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(() => highlightClip?.showLandmarks ?? false);

  useEffect(() => {
    setShowLandmarks(highlightClip?.showLandmarks ?? false);
  }, [ownedResultId, highlightClip?.showLandmarks]);

  const replayHighlight: ResultHighlight | undefined = useMemo(() => {
    if (savedHighlight) {
      return {
        ...savedHighlight,
        samples: highlightClip?.poseSamples.length ? highlightClip.poseSamples : savedHighlight.samples,
      };
    }
    if (!highlightClip || !completedByActiveProfile) return undefined;
    const maxDuration = dance ? Math.min(CONFIG.clipLengthSec, dance.lengthSec) : CONFIG.clipLengthSec;
    const durationSec = maxDuration > 0 ? maxDuration : CONFIG.clipLengthSec;
    const maxStart = dance ? Math.max(0, dance.lengthSec - durationSec) : Number.POSITIVE_INFINITY;
    const startSec = Math.max(0, Math.min(completedByActiveProfile.bestWindowStartSec, maxStart));
    return {
      startSec,
      durationSec,
      samples: highlightClip.poseSamples,
    };
  }, [savedHighlight, highlightClip, completedByActiveProfile, dance]);

  function handleToggleLandmarks(checked: boolean): void {
    setShowLandmarks(checked);
    if (ownedResultId) {
      setHighlightShowLandmarks(ownedResultId, checked);
    }
  }

  const profile = result ? store.listProfiles().find((p) => p.id === result.playerId) : undefined;
  const hrMax = profile ? maxHeartRate(profile) : null;

  const title = result ? (result.completed ? "Dance complete" : "Dance ended early") : "Result not found";

  // Back to where the dancer came from (e.g. Me); the href is the fallback when the page was opened directly.
  function handleBack(event: MouseEvent<HTMLAnchorElement>): void {
    const historyIdx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (historyIdx > 0) {
      event.preventDefault();
      void navigate(-1);
    }
  }

  return (
    <section className="card session-results" aria-labelledby="session-results-title">
      <Link to="/dances" className="session-results-back" onClick={handleBack} aria-label="Go back">←</Link>
      <h1 id="session-results-title">{title}</h1>
      {dance && (
        <div className="session-results-dance-row">
          <DanceCover title={dance.title} artist={dance.artist} coverUrl={dance.coverUrl} size="md" />
          <p className="session-results-dance">{formatDanceLabel(dance)}</p>
        </div>
      )}
      {result ? (
        <section className="session-results-summary" aria-labelledby="results-summary-title">
        <h2 id="results-summary-title">Workout summary</h2>
        <dl className="session-results-metrics" aria-label="Session metrics">
          {result.completed && (
            <>
              <div className="session-results-points">
                <dt>Total points</dt>
                <dd><CountUp value={result.totalPoints} /></dd>
              </div>
            </>
          )}
          <div>
            <dt>Duration</dt>
            <dd>{formatDanceLength(result.durationSec)}</dd>
          </div>
          <div>
            <dt>Calories</dt>
            <dd>{resultHasHeartRate(result) ? `${result.caloriesKcal} kcal` : "-- · No watch"}</dd>
            <dd className="session-results-privacy">Estimated and private</dd>
          </div>
        </dl>
        <div className="health-cards">
          {result.completed && <MovesCard level={result.level} accuracyPct={result.accuracyPct} />}
          <EffortCard result={result} hrMax={hrMax} />
          {result.completed && <ResultsChart result={result} hrMax={hrMax} />}
        </div>
        </section>
      ) : (
        <p>This session result is unavailable.</p>
      )}
      {result?.completed && (
        <div className="session-results-cheer">
          <p className="session-results-cheer-line">{cheer[result.level]}</p>
          <p>{scoringCaption(result)}</p>
        </div>
      )}
      {earned.length > 0 && (
        <section className="session-results-badges" aria-labelledby="results-badges-title">
          <h2 id="results-badges-title">Badges won</h2>
          <BadgeLinks badges={earned} />
        </section>
      )}
      {justFinished && earned.length > 0 && <BadgeUnlock key={resultId} badges={earned} />}
      {replayHighlight && (
        <div className="session-results-highlight">
          <h2>Highlight</h2>
          <ClipReplay
            samples={replayHighlight.samples}
            startSec={replayHighlight.startSec}
            durationSec={replayHighlight.durationSec}
            dance={dance}
            userVideoBlob={highlightClip?.videoBlob}
            videoStartSongMs={highlightClip?.videoStartSongMs}
            overlaySamples={highlightClip?.overlaySamples}
            showLandmarks={showLandmarks}
            audioUrl={dance?.audioUrl}
            controlRef={replayControlRef}
          />
          {highlightClip && (
            <div className="session-results-highlight-options">
              <label className="session-results-landmarks-toggle">
                <input
                  type="checkbox"
                  checked={showLandmarks}
                  onChange={(event) => handleToggleLandmarks(event.currentTarget.checked)}
                />
                {" "}Show body landmarks on my video
              </label>
              <p className="session-results-privacy">
                Video stays in your browser memory only — never uploaded or stored to disk.
              </p>
            </div>
          )}
          {dance && (
            <HighlightDownload
              key={ownedResultId}
              highlight={replayHighlight}
              audioUrl={dance.audioUrl}
              getCanvas={() => replayControlRef.current?.getCanvas() ?? null}
              onRecordingStart={() => replayControlRef.current?.restartFromStart()}
            />
          )}
        </div>
      )}
      <div className="session-results-actions">
        {completedByActiveProfile && (
          <PostResult key={completedByActiveProfile.id} result={completedByActiveProfile} canShareClip={replayHighlight !== undefined} />
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
