# PULSE judging and Popular Vote runbook

**Primary track: People First.** Standing and seated dancers can follow the same routine and take part in the same group. Lead with that shared experience. Use heart rate to explain how PULSE measures effort during a workout. [Product spec and judge Q&A](../Details/Description.md#pitch-and-demo)

Assign one presenter and one laptop operator. Start the timer on the first frame or first word. Blockquotes are spoken copy. The operator cues apply to the live and fallback versions.

## Judging script · 2:30, then Q&A

### 0:00–0:30 · Opening video

Play the 30-second pitch video locally. Show the catalogue, the coach and heart-rate label, then a completed result shared to the group. If the video fails to start, read this opening over the catalogue. Use the rest of the cue to show the dance cards and line up Tip Toe.

> Dance is already a workout. PULSE gives you a way to see the effort you put in and share the result with friends. Pick a routine, follow a silhouette coach, and get a score that reflects movement and heart rate. Then come back to see how your group did.

### 0:30–0:55 · Pick Tip Toe

On **Dances**, show the catalogue and open **Tip Toe**. Point out the camera preview. Click **Start Dance** early enough for the countdown to finish. If camera setup is still blocking you at 0:55, switch to the prepared fallback.

> Pick a dance from the catalogue. I’m choosing Tip Toe, the featured routine in Montreal Dancers. The camera preview lets me check that the app can see me. In seated mode, the same song and coach play while the score uses upper-body movement.

### 0:55–1:20 · Show the live dance

Let the dancer follow a few moves. Point to the coach, accuracy and heart-rate label. If the label says **Simulated**, use the second sentence in brackets. Let the audience hear a few beats. Pause the live excerpt before moving on.

> The silhouette moves in time with the song. This reading is coming from the watch. [Without a watch: This reading is simulated, and the app labels it.] Heart-rate effort and movement accuracy contribute to points. The camera is processed on this laptop.

### 1:20–2:00 · Show the result and group

Switch to the prepared **Results** tab from a completed Tip Toe run. If it has yet to be shared, click **Post result**, select **Montreal Dancers**, leave **Show estimated calories** and **Include highlight clip** unchecked, then click **Post to feed**. Show the post. From the same tab, open **Groups → Montreal Dancers** and show its **Weekly leaderboard**. If the post is already there, open **Feed** directly.

> Tip Toe takes just over three minutes, so this is the result from our completed rehearsal run. Here are the points and accuracy. I can share the result to our group and keep estimated calories private. The leaderboard shows each member’s best Tip Toe score this week. That gives the group a reason to come back and dance again.

### 2:00–2:30 · Close and hand off

Show the seated excerpt or the two prepared views of the same routine. Finish on the group leaderboard. Leave the result visible for questions.

> We’re entering People First because we want friends with different ways of moving to share the same workout and group. PULSE runs locally for this demo. Next, we’d test it with student dance groups and seated dancers, then record routines with creators. We’d keep the core experience free and explore optional extras such as silhouette highlights. We’re ready for questions.

## Popular Vote script · 1:45 target, 2:00 hard stop

Start on the **Tip Toe** camera preview. Use the same dancer and prepared result as judging. If starting the dance runs long, show the short fallback excerpt and move on at the next cue.

### 0:00–0:20 · Invite them in

Click **Start Dance** during the opening. Show the countdown as you speak.

> Think of the song that gets you moving even when you weren’t planning to work out. That’s what PULSE is built around. Pick a routine like Tip Toe, follow the silhouette, and see the effort you put in.

### 0:20–0:45 · Show the moves

Follow a few beats. Point to accuracy and the heart-rate label. Pause the excerpt at the end of the cue.

> The coach moves with the music. PULSE uses your camera to see how closely you follow the moves and heart rate to measure effort. You can dance standing or seated. In seated mode, the app scores upper-body movement.

### 0:45–1:20 · Show the social payoff

Switch to the completed rehearsal result, then **Feed** and the **Montreal Dancers** leaderboard. Use the prepared post so the handoff takes only a few clicks.

> Here’s a completed run from rehearsal. I shared it with Montreal Dancers, so my friends can give it kudos and see their best scores for the same routine on the weekly leaderboard. We can each dance on our own and still have something to do together.

### 1:20–1:45 · Ask for the vote

Show the seated excerpt if it is ready. End on the group leaderboard. If behind at 1:40, go straight to the final sentence. Stop speaking by 2:00.

> We want the friend who dances seated to be part of the same group as the friend who dances standing. If you’d like more ways to move with your friends, vote for PULSE.

## Demo laptop checklist

### Before the room

- [ ] Install dependencies while online with `npm ci`. Build the frozen checkout using `npm run build`. Start it with `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`. Use **http://localhost:4173** in desktop Chrome consistently so sign-in, camera permission and saved results use the same origin.
- [ ] Use a separate Chrome demo profile. In **Profile**, run **Reset demo data** and wait for **Demo data restored.** If saved data still prevents startup, clear site data for the demo origin in that profile, reload and sign in again. Clearing site data removes browser-local accounts and activity. Reset clears the rehearsal run and posts, so reset before preparing them.
- [ ] Sign in as **Théo Nguyen**, `theo-on-beat@pulse.demo`, with the bundled demo password `dance123`. Théo starts in **Montreal Dancers**. If using a new account instead, join **Montreal Dancers** under **Groups → Discover** before dancing. For the seated check, use **Jules Roy**, `jules-grooves@pulse.demo`, with the same demo password.
- [ ] Under **Watch**, enable heart-rate broadcast on the WHOOP or Garmin, choose **Connect watch**, select the device in Chrome and wait for a live BPM reading. Warm up the dancer. If pairing is slow, the chooser is cancelled or BPM is missing, choose **Use simulated heart rate**, confirm the **Simulated** label and continue. Keep Bluetooth on when switching off Wi-Fi.
- [ ] In **Get Ready**, grant camera access and check that shoulders, elbows and wrists stay visible. For standing, step back until the full body fits. For seated, use a stable chair with room for arm movement and frame the torso and arms. Put front lighting on the dancer, clear the background and have them raise each arm once to check the overlay.
- [ ] Check the actual projector or speaker output and Chrome volume with Tip Toe and both local videos. If Chrome asks, click **Tap to start the music**. Disable notifications, connect power, and keep the display awake through both scripts.
- [ ] Turn **Wi-Fi off** on the demo laptop. Reload the localhost URL while the preview server stays running. Confirm the catalogue, camera and music load and both local video files play. Keep the pitch video and full fallback recording from [#77](https://github.com/Zaidmcuni/Pulse/issues/77) on disk and cue a short dance excerpt and a seated excerpt. If either recording is unavailable, use the spoken opening and prepared app tabs.

### Prepare the live handoff

- [ ] Run Tip Toe to the end as Théo. Allow about 3:06 plus setup. Dismiss any badge dialog. Keep the completed result in a dedicated tab and an existing group post ready. Keep the live dance in a separate tab so leaving the excerpt never costs the rehearsal result.
- [ ] Put the **Montreal Dancers** group and **Feed** within one click. Confirm the completed run appears on the group’s Tip Toe leaderboard and the shared result appears in the group feed. For judging, leave one completed result unposted if you plan to post live. For Popular Vote, have the already-shared result visible. Reload any prepared feed or group tab after posting so it shows the new activity.
- [ ] The bundled leaderboard scores are dated November 16–22, 2026. In another local week, complete practice runs under multiple group accounts before the show or use a clearly identified recording from demo week for the comparison. Keep the laptop clock on its real local time.
- [ ] Run the standing primary path and seated fallback twice. Between shows, stop or pause the live excerpt and restore the prepared tabs. Avoid resetting after staging.

### Recover under the timer

| Situation | Operator cue |
| --- | --- |
| Watch disconnects during the live excerpt | Move to the prepared result or video at the handoff cue. For the next run, return to **Watch** and select **Use simulated heart rate** before starting. |
| Camera denied, tracking drops or audio is silent | During setup, check site permissions, choose **Retry Camera**, fix framing or select the right audio output. On stage, give the live setup until its next cue, then show the matching fallback excerpt. |
| Video missing or player fails | Read the opening with the catalogue visible. Use the staged result, feed and group tabs. Say which run was completed in rehearsal. |
| Live dance ends early | Use the completed rehearsal result. An early quit shows time and estimated calories and cannot be posted or ranked. |
| Group missing from the post dialog or leaderboard empty | Check the signed-in account, Tip Toe, membership and local week. In the room, show the staged feed or the recorded leaderboard and label it as a recording. |
| Result already posted or a new badge covers the screen | Use **Feed** for an existing post. Dismiss any badge dialog before advancing. |

## Judge Q&A

| Question | Answer |
| --- | --- |
| Why PULSE if I already play Just Dance? | PULSE measures heart-rate effort alongside accuracy, offers seated scoring, and gives a group a place to share results and compare weekly scores. |
| Can you ship these routines? | The current routines are demo placeholders. For a release, we would license the music and commission or license creator-recorded choreography. |
| How do points work? | A TRIMP-based effort score uses heart rate relative to the dancer’s range. Accuracy weights those effort points. Weight affects estimated calories and has no effect on points. |
| How fair is it across bodies and ages? | Effort is based on the individual’s heart-rate range. Seated scoring compares upper-body segments. We would test perceived fairness with dancers before making broader claims. |
| What leaves the camera? | Camera frames are processed on-device and discarded. A highlight saves pose samples and draws a silhouette. The demo stores profiles and activity in this browser. Posts omit body stats and heart rate, and sharing estimated calories is optional. |
| What about my watch? | The browser can read a supported Bluetooth heart-rate broadcast from a WHOOP or Garmin. Apple Watch support would need a native integration. The browser demo labels simulated heart rate. |
| How would you fund it? | Keep core dancing and sharing free. Test repeat use with student groups before exploring optional paid features such as highlight tools. |
