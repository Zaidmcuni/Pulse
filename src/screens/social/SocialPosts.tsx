/**
 * Owner: Ali
 * Purpose: Show result posts and persist kudos on feed and profile.
 * FRs: FR-39, FR-40, FR-41, FR-43
 */

import { useState, type ReactElement } from "react";
import { store } from "../../data/store";
import { displayHandle } from "../setup/switcherHelpers";

export function SocialPosts({ viewerId, authorId, groupId, emptyMessage }: {
  viewerId?: string;
  authorId?: string;
  groupId?: string;
  emptyMessage: string;
}): ReactElement {
  const [posts, setPosts] = useState(() => store.listFeed(groupId));
  const [error, setError] = useState("");
  const visible = authorId === undefined ? posts : posts.filter((post) => post.authorId === authorId);
  const PostTitle = authorId === undefined && groupId === undefined ? "h2" : "h3";
  const authors = new Map(store.listProfiles().map((profile) => [profile.id, profile]));

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
          <article className="card social-panel" key={post.id}>
            <header>
              <p className="social-author">{author?.displayName ?? "PULSE dancer"}</p>
              {author && <p className="social-meta">{displayHandle(author.handle)}</p>}
            </header>
            <PostTitle className="social-post-title">{dance?.title ?? "Dance session"}</PostTitle>
            {sharedResult && (
              <ul className="social-post-metrics">
                <li>{sharedResult.totalPoints.toLocaleString()} points</li>
                <li className="badge social-level">{sharedResult.level}</li>
                {post.showCalories && <li>{sharedResult.caloriesKcal} kcal estimated</li>}
              </ul>
            )}
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
          </article>
        );
      })}
    </div>
  );
}
