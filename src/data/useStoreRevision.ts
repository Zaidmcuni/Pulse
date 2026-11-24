/**
 * Owner: Ali / Infrastructure
 * Purpose: Lightweight React hook that subscribes to store updates (Supabase hydration & Realtime)
 *          so social and profile screens re-render automatically when remote data arrives.
 */

import { useEffect, useState } from "react";
import { store } from "./store";

export function useStoreRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!store.subscribe) return undefined;
    return store.subscribe(() => {
      setRevision((rev) => rev + 1);
    });
  }, []);
  return revision;
}
