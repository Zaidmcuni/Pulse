/**
 * Owner: Ali
 * Added by: Toufic (song page, part of #144)
 * Purpose: Song page (/dances/:id): song details, Start, a rough calorie range and this song's leaderboard.
 *          Play on a catalogue card opens this page; only Start goes to Get Ready.
 * FRs: FR-09, FR-44
 */

import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import { DanceCover } from "../../components/DanceCover";
import { danceIntensity, estimatedKcalRange, formatKcalRange, INTENSITY_LABELS } from "../../data/danceWorkoutMeta";
import { songLeaderboard, splitForViewer } from "../../data/globalLeaderboard";
import { store } from "../../data/store";
import { danceArtist, formatDanceLength } from "../dance/GetReady";
import { RankingTable } from "./RankingTable";
import "./Social.css";
import "./Groups.css";
import "./SongPage.css";

const MODE_LINES = {
  standing: "You'll dance standing. Change it on the song list.",
  seated: "You'll dance seated, upper body only. Change it on the song list.",
} as const;

export default function SongPage(): ReactElement {
  const { id } = useParams();
  const dance = id === undefined ? undefined : store.getDance(id);

  if (!dance) {
    return (
      <section className="social-page" aria-labelledby="song-title">
        <Link className="group-back" to="/dances">← All songs</Link>
        <h1 id="song-title">Song not found</h1>
        <p>This song isn't in the list. <Link to="/dances">Pick another song</Link>.</p>
      </section>
    );
  }

  const artist = danceArtist(dance);
  const profile = store.getActiveProfile();
  const profiles = store.listProfiles();
  const results = profiles.flatMap((p) => store.listResults(p.id));
  const { top, you } = splitForViewer(songLeaderboard(results, profiles, dance.id), profile?.id);
  const kcal = estimatedKcalRange(dance);

  return (
    <section className="social-page song-page" aria-labelledby="song-title">
      <Link className="group-back" to="/dances">← All songs</Link>
      <header className="song-head">
        <DanceCover title={dance.title} artist={artist} coverUrl={dance.coverUrl} size="lg" />
        <div className="song-head-text">
          <h1 id="song-title">{dance.title}</h1>
          {artist && <p className="song-artist">{artist}</p>}
          <p className="song-meta">
            <span>{dance.genre} · {formatDanceLength(dance.lengthSec)} · {dance.bpm} BPM</span>
            <span className="badge">{INTENSITY_LABELS[danceIntensity(dance)]}</span>
          </p>
        </div>
      </header>

      <section className="card social-panel" aria-labelledby="song-start">
        <h2 id="song-start">Start</h2>
        <Link className="btn btn-primary song-start" to={`/dance/${encodeURIComponent(dance.id)}/ready`}>Start dance</Link>
        {profile && <p className="social-meta">{MODE_LINES[profile.mode]}</p>}
      </section>

      {kcal && (
        <section className="card social-panel" aria-labelledby="song-kcal">
          <h2 id="song-kcal">Estimated calories</h2>
          <p className="song-kcal">{formatKcalRange(kcal)}</p>
          <p className="social-meta">A rough guide for this song. Your real estimate uses your watch and profile.</p>
        </section>
      )}

      <section className="card social-panel" aria-labelledby="song-board">
        <h2 id="song-board">Leaderboard</h2>
        <p className="social-meta">Best finished run per dancer, all-time.</p>
        {top.length === 0 ? <p>No scores yet. Be the first!</p> : (
          <RankingTable
            label={`${dance.title} leaderboard`}
            valueHeading="Points"
            top={top}
            you={you}
            profiles={profiles}
            formatValue={(points) => points.toLocaleString()}
          />
        )}
      </section>
    </section>
  );
}
