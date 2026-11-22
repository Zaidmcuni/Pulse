/**
 * Owner: Ali
 * Added by: Toufic (song page, #141)
 * Purpose: Ranked dancer table shared by the song page and the community leaderboard: top rows,
 *          then the viewer's own row pinned underneath when they rank lower
 * FRs: FR-44
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import type { RankedRow } from "../../data/globalLeaderboard";
import type { PlayerProfile } from "../../types/pulse";
import { profilePath } from "../profile/dancerSummary";
import { displayHandle } from "../setup/switcherHelpers";
import "./Groups.css";
import "./RankingTable.css";

const PODIUM = 3;

interface RankingTableProps {
  label: string;           // accessible table name
  valueHeading: string;    // last column heading
  top: RankedRow[];
  you?: RankedRow;
  profiles: Pick<PlayerProfile, "id" | "handle">[];
  formatValue: (value: number) => string;
}

export function RankingTable({ label, valueHeading, top, you, profiles, formatValue }: RankingTableProps): ReactElement {
  const handles = new Map(profiles.map((p) => [p.id, p.handle]));
  const dancer = (playerId: string): ReactElement | string => {
    const handle = handles.get(playerId);
    return handle ? <Link to={profilePath(playerId)}>{displayHandle(handle)}</Link> : "PULSE dancer";
  };
  return (
    <table className="group-ranking-table ranking-table" aria-label={label}>
      <thead><tr><th scope="col">Rank</th><th scope="col">Dancer</th><th scope="col">{valueHeading}</th></tr></thead>
      <tbody>
        {top.map((row) => (
          <tr key={row.playerId}>
            <td><span className={`ranking-rank${row.rank <= PODIUM ? " is-podium" : ""}`}>{row.rank}</span></td>
            <td>{dancer(row.playerId)}</td>
            <td>{formatValue(row.value)}</td>
          </tr>
        ))}
      </tbody>
      {you && (
        <tfoot>
          <tr className="ranking-you">
            <td><span className="ranking-rank">{you.rank}</span></td>
            <td>Your rank · {dancer(you.playerId)}</td>
            <td>{formatValue(you.value)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
