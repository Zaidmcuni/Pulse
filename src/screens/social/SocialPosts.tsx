/**
 * Owner: Ali
 * Purpose: Show result posts and persist kudos on feed and profile.
 * FRs: FR-39, FR-40, FR-41, FR-43
 * Edited: Mohamed (task 18, profile links; council redesign: avatar, tinted result block, kudos footer, just-shared highlight)
 * Edited: Toufic (#140, PostCard for the share preview; opt-in average heart rate)
 */

import { useEffect, useRef, useState, type ReactElement, type ReactNode, type Ref } from "react";
import { Link, useLocation } from "react-router-dom";
import { DanceCover } from "../../components/DanceCover";
import { ClipReplay } from "../../clip/ClipReplay";
import { getHighlightClip } from "../../clip/highlightStore";
import { CONFIG } from "../../config";
import { computeAvgBpm } from "../../data/postStats";
import { getResultHighlight, store } from "../../data/store";
import { workoutIntensity, ZONE_LABELS } from "../../health/intensity";
import { maxHeartRate } from "../../scoring/effort";
import { resultHasHeartRate } from "../../scoring/session";
import type { Dance, FeedPost, PlayerProfile, SessionResult } from "../../types/pulse";
import { danceArtist } from "../dance/GetReady";
import { profilePath } from "../profile/dancerSummary";
import { displayHandle, initialOf } from "../setup/switcherHelpers";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const postDateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

// Compare calendar days in the viewer's timezone, including across clock changes.
function localDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function PostTime({ iso, now }: { iso: string; now: Date }): ReactElement {
  const posted = new Date(Date.parse(iso));
  if (!Number.isFinite(posted.getTime())) return <span className="social-meta">Time unavailable</span>;

  const absolute = postDateFormat.format(posted);
  const elapsedMinutes = Math.floor((now.getTime() - posted.getTime()) / MINUTE_MS);
  const days = localDay(now) - localDay(posted);
  let relative = absolute;
  if (elapsedMinutes >= 0) {
    if (elapsedMinutes === 0) relative = "Just now";
    else if (elapsedMinutes < 60) relative = `${elapsedMinutes} min ago`;
    else if (days === 1) relative = "Yesterday";
    else if (days > 1) relative = `${days} d ago`;
    else relative = `${Math.floor(elapsedMinutes / 60)} h ago`;
  }

  return <time className="social-meta" dateTime={posted.toISOString()} title={absolute}>{relative}</time>;
}

/** Decorative heartbeat line behind the stats; the same on every card. */
function PulseLine(): ReactElement {
  return (
    <svg className="social-post-pulse" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 20H60L66 8L72 32L78 2L86 38L92 20H120L128 14L136 20H200" />
    </svg>
  );
}

function PostedHighlight({ result, dance }: { result: SessionResult; dance?: Dance }): ReactElement | null {
  const [open, setOpen] = useState(false);
  const highlightClip = getHighlightClip(result.id);
  const [savedHighlight] = useState(() => getResultHighlight(result.id));
  if (!highlightClip && !savedHighlight && !dance) return null;

  const maxDuration = dance ? Math.min(CONFIG.clipLengthSec, dance.lengthSec) : CONFIG.clipLengthSec;
  const durationSec = savedHighlight?.durationSec ?? (maxDuration > 0 ? maxDuration : CONFIG.clipLengthSec);
  const maxStart = dance ? Math.max(0, dance.lengthSec - durationSec) : Number.POSITIVE_INFINITY;
  const startSec = savedHighlight?.startSec ?? Math.max(0, Math.min(result.bestWindowStartSec, maxStart));
  const samples = highlightClip?.poseSamples.length
    ? highlightClip.poseSamples
    : (savedHighlight?.samples ?? []);

  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Watch highlight</summary>
      {open && (
        <ClipReplay
          samples={samples}
          startSec={startSec}
          durationSec={durationSec}
          dance={dance}
          userVideoBlob={highlightClip?.videoBlob}
          videoStartSongMs={highlightClip?.videoStartSongMs}
          overlaySamples={highlightClip?.overlaySamples}
          showLandmarks={highlightClip?.showLandmarks ?? false}
          audioUrl={dance?.audioUrl}
        />
      )}
    </details>
  );
}

/**
 * One post card: header, tinted result block and whatever the caller adds below (highlight, footer).
 * Shared by the feed and the Share dialog's preview so both look the same.
 * sharedResult is the completed result of the post's author, or undefined when it can't be shown.
 */
export function PostCard({ post, author, sharedResult, now, TitleTag, linkAuthor = true, isJustPosted = false, cardRef, children }: {
  post: FeedPost;
  author?: PlayerProfile;
  sharedResult?: SessionResult;
  now: Date;
  TitleTag: "h2" | "h3";
  linkAuthor?: boolean;
  isJustPosted?: boolean;
  cardRef?: Ref<HTMLElement>;
  children?: ReactNode;
}): ReactElement {
  const dance = sharedResult && store.getDance(sharedResult.danceId);
  const artist = dance && danceArtist(dance);
  // Same zones as the Effort card on Results, but posts also count simulated
  // heart rate (workoutIntensity only reads "ble" samples, so relabel them here).
  const intensity = sharedResult && author
    ? workoutIntensity(
      sharedResult.samples.map((s) => (s.hrSource === "simulated" ? { ...s, hrSource: "ble" as const } : s)),
      maxHeartRate(author),
    )
    : null;
  // #140: only when the dancer opted in and a watch measured the run (never "0 bpm").
  const avgBpm = sharedResult && post.showHeartRate === true ? computeAvgBpm(sharedResult) : null;
  const who = author && (
    <>
      <span className="social-avatar" aria-hidden="true">{initialOf(author.displayName)}</span>
      <span>
        <p className="social-author">{author.displayName}</p>
        <p className="social-meta">{displayHandle(author.handle)}</p>
      </span>
    </>
  );
  return (
    <article
      className={`card social-panel social-post${isJustPosted ? " is-just-posted" : ""}`}
      ref={cardRef}
    >
      <header className="social-post-header">
        {author && linkAuthor ? (
          <Link className="social-author-link social-post-who" to={profilePath(post.authorId)}>{who}</Link>
        ) : author ? (
          <span className="social-post-who">{who}</span>
        ) : (
          <span className="social-post-who">
            <span className="social-avatar" aria-hidden="true">P</span>
            <p className="social-author">PULSE dancer</p>
          </span>
        )}
        <PostTime iso={post.createdAtIso} now={now} />
      </header>
      <div className="social-post-result">
        <PulseLine />
        <div className="social-post-dance">
          <DanceCover
            title={dance ? dance.title : "Dance session"}
            artist={artist}
            coverUrl={dance?.coverUrl}
            size="sm"
          />
          <TitleTag className="social-post-title">
            {dance ? dance.title : "Dance session"}
            {artist && <span className="social-meta social-post-artist"> — {artist}</span>}
          </TitleTag>
        </div>
        {sharedResult && (
          <ul className="social-post-metrics">
            <li className="social-post-points"><strong>{sharedResult.totalPoints.toLocaleString()}</strong> points</li>
            <li className={`level-medal is-${sharedResult.level}`}>{sharedResult.level}</li>
            {intensity
              ? <li className={`social-effort-chip is-${intensity.level}`}><span className="social-effort-heart" aria-hidden="true">♥</span>{ZONE_LABELS[intensity.level]}</li>
              : <li className="social-effort-chip is-none" aria-label="Effort not measured"><span className="social-effort-heart" aria-hidden="true">♥</span>--</li>}
            {post.showCalories && <li className="social-post-stat">{resultHasHeartRate(sharedResult) ? <>{sharedResult.caloriesKcal} kcal <span className="social-post-estimate">estimated</span></> : "-- kcal · No watch"}</li>}
            {avgBpm !== null && <li className="social-post-stat social-post-bpm"><strong>{avgBpm}</strong> <span className="social-post-estimate">avg bpm</span></li>}
          </ul>
        )}
      </div>
      {children}
    </article>
  );
}

export function SocialPosts({ viewerId, authorId, groupId, emptyMessage }: {
  viewerId?: string;
  authorId?: string;
  groupId?: string;
  emptyMessage: string;
}): ReactElement {
  const [posts, setPosts] = useState(() => store.listFeed(groupId));
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (posts.length === 0) return;
    const clock = window.setInterval(() => setNow(new Date()), MINUTE_MS);
    return () => window.clearInterval(clock);
  }, [posts.length]);
  const visible = authorId === undefined ? posts : posts.filter((post) => post.authorId === authorId);
  const PostTitle = authorId === undefined && groupId === undefined ? "h2" : "h3";
  const authors = new Map(store.listProfiles().map((profile) => [profile.id, profile]));
  // Results sends the id of the post just shared, so it can land with a highlight and come into view.
  const justPosted = (useLocation().state as { justPosted?: string } | null)?.justPosted;
  const justPostedRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    justPostedRef.current?.scrollIntoView?.({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [justPosted]);

  function toggleKudos(postId: string, playerId: string): void {
    try {
      store.toggleKudos(postId, playerId);
      setPosts(store.listFeed(groupId));
      setError("");
    } catch {
      setError("Could not update kudos. Try again.");
    }
  }

  if (visible.length === 0) return <p className="card social-panel social-meta">{emptyMessage}</p>;

  return (
    <div className="social-posts">
      {error && <p role="alert">{error}</p>}
      {visible.map((post) => {
        const author = authors.get(post.authorId);
        const result = store.getResult(post.resultId);
        const sharedResult = result?.completed && result.playerId === post.authorId ? result : undefined;
        const dance = sharedResult && store.getDance(sharedResult.danceId);
        const pressed = viewerId !== undefined && post.kudosBy.includes(viewerId);
        return (
          <PostCard
            key={post.id}
            post={post}
            author={author}
            sharedResult={sharedResult}
            now={now}
            TitleTag={PostTitle}
            isJustPosted={post.id === justPosted}
            cardRef={post.id === justPosted ? justPostedRef : undefined}
          >
            {sharedResult && post.hasClip && (
              <PostedHighlight key={sharedResult.id} result={sharedResult} dance={dance} />
            )}
            <footer className="social-post-foot">
              {viewerId === undefined ? (
                <p className="social-meta">Kudos {post.kudosBy.length}</p>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary social-kudos"
                  aria-pressed={pressed}
                  onClick={() => toggleKudos(post.id, viewerId)}
                >
                  Kudos {post.kudosBy.length}
                </button>
              )}
            </footer>
          </PostCard>
        );
      })}
    </div>
  );
}
