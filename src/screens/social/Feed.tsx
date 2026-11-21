/**
 * Owner: Ali
 * Purpose: Feed screen (/feed)
 * FRs: FR-39, FR-40
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import type { ReactElement } from "react";
import { store } from "../../data/store";
import { SocialPosts } from "./SocialPosts";
import "./Social.css";

export default function Feed(): ReactElement {
  return (
    <section className="social-page" aria-labelledby="feed-title">
      <h1 id="feed-title">Feed</h1>
      <SocialPosts viewerId={store.getActiveProfile()?.id} emptyMessage="Your feed is empty. Finish a dance and share your result to get started." />
    </section>
  );
}
