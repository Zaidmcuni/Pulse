/**
 * Owner: Ali
 * Purpose: "Share to Crew" dialog on Results: choose groups and what to show, with a live preview of the post card.
 * FRs: FR-38, FR-39
 * Edited: Toufic (#154, moved from Results.tsx; live preview; opt-in average heart rate)
 */

import { useRef, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { postChoicesFromForm, type PostChoices } from "../../data/postComposer";
import { computeAvgBpm } from "../../data/postStats";
import { store } from "../../data/store";
import type { FeedPost, SessionResult } from "../../types/pulse";
import { PostCard } from "./SocialPosts";
import "./Social.css";
import "./PostComposer.css";

export function PostComposer({ result, canShareClip }: { result: SessionResult; canShareClip: boolean }): ReactElement {
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const groups = store.listGroups().filter(({ memberIds }) => memberIds.includes(result.playerId));
  const avgBpm = computeAvgBpm(result);
  const ctx = { groupIds: groups.map(({ id }) => id), canShareClip, avgBpm };
  // The preview reads the same form values as Share, so it shows exactly what will be posted.
  const [choices, setChoices] = useState<PostChoices>(() => postChoicesFromForm(new FormData(), ctx));
  const [previewTime] = useState(() => new Date());
  if (store.listFeed().some((post) => post.resultId === result.id)) {
    return <p>This result is already posted.</p>;
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (store.listFeed().some((post) => post.resultId === result.id)) {
      setError("This result is already posted.");
      return;
    }

    let postId: string;
    try {
      postId = store.createPost({
        authorId: result.playerId,
        resultId: result.id,
        ...postChoicesFromForm(new FormData(event.currentTarget), ctx),
      }).id;
    } catch {
      setError("Could not post your result. Try again.");
      return;
    }
    void navigate("/feed", { state: { justPosted: postId } }); // the feed highlights and scrolls to it
  }

  const preview: FeedPost = {
    id: "preview",
    authorId: result.playerId,
    resultId: result.id,
    ...choices,
    kudosBy: [],
    createdAtIso: previewTime.toISOString(),
  };
  const author = store.listProfiles().find(({ id }) => id === result.playerId);

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => dialog.current?.showModal()}>
        Share to Crew
      </button>
      <dialog
        ref={dialog}
        className="card session-post-dialog post-composer"
        aria-labelledby="session-post-title"
        onClose={() => { form.current?.reset(); setError(""); setChoices(postChoicesFromForm(new FormData(), ctx)); }}
      >
        <form ref={form} onSubmit={submit} onChange={(event) => setChoices(postChoicesFromForm(new FormData(event.currentTarget), ctx))}>
          <h2 id="session-post-title">Share to Crew</h2>
          <p>Your result appears in Crew and on your profile. Body stats always stay private; calories and average heart rate show only if you turn them on.</p>
          <section className="post-composer-preview" aria-label="Post preview">
            <p className="social-meta">Preview: what your crew will see</p>
            <PostCard post={preview} author={author} sharedResult={result} now={previewTime} TitleTag="h3" linkAuthor={false}>
              {preview.hasClip && <p className="social-meta post-composer-clip">Includes your highlight clip</p>}
            </PostCard>
          </section>
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
              name="showHeartRate"
              disabled={avgBpm === null}
              aria-describedby={avgBpm === null ? "session-post-hr-note" : undefined}
            />
            {" "}Show average heart rate{avgBpm !== null && ` · ${avgBpm} bpm`}
          </label>
          {avgBpm === null && <p id="session-post-hr-note">Average heart rate needs a watch connected during the dance.</p>}
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
