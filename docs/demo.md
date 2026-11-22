# PULSE judging and Popular Vote runbook

**Primary track: People First.** Standing and seated dancers can follow the same routine and take part in the same group. Lead with that shared experience. This walkthrough uses the no-watch flow. A paired watch can also measure workout effort. [Product spec and judge Q&A](../Details/Description.md#pitch-and-demo)

Assign one presenter and one laptop operator. Start the timer on the first frame or first word. Blockquotes are spoken copy. The operator cues apply to the live and fallback versions.

## Judging script · 2:30, then Q&A

### 0:00–0:30 · Opening video

Play the 30-second no-watch pitch video locally. Show the catalogue, the coach and the **No watch** badge, then a completed result shared to the group. If the no-watch video is unavailable or fails to start, read this opening over the catalogue. Use the rest of the cue to show the dance cards and line up Tip Toe.

> Dance is already a workout. PULSE gives you a way to see the effort you put in and share the result with friends. Pick a routine, follow a dance coach, and get a score based on how closely you match the moves. Then come back to see how your group did.

### 0:30–0:55 · Pick Tip Toe

On **Dance**, show the catalogue and tap **Play** on **Tip Toe** to open its song page (song leaderboard and estimated calories), then click **Start dance**. Point out the camera preview. Click **I’m ready** early enough for the three-second framing hold and the dance countdown. If camera setup is still blocking you at 0:55, switch to the prepared fallback.

> Pick a dance from the catalogue. I’m choosing Tip Toe, the featured routine in Montreal Dancers. The camera preview lets me check that the app can see me. In seated mode, the same song and coach play while the score uses upper-body movement.

### 0:55–1:20 · Show the live dance

Let the dancer follow a few moves. Point to the coach, the points, the **Moves** meter and the grey heart showing **No watch**. Let the audience hear a few beats. Pause the live excerpt before moving on.

> The coach moves in time with the song. We’re dancing without a watch, so points come from how closely we match the moves. The camera is processed on this laptop.

### 1:20–2:00 · Show the result and group

Switch to the prepared **Results** tab from a completed Tip Toe run. If it has yet to be shared, click **Share to Crew**, select **Montreal Dancers**, leave **Show estimated calories**, **Show average heart rate** and **Include highlight clip** unchecked, then click **Share**. Show the post. From the same tab, open **Feed → Groups → Montreal Dancers** and show its **Weekly leaderboard**. If the post is already there, open **Feed** directly.

> Tip Toe takes just over three minutes, so this is the result from our completed rehearsal run. Here are the points and accuracy. Calories are unavailable for this run because we danced without a watch. I can still share the result to our group. The leaderboard shows each member’s best Tip Toe score this week. That gives the group a reason to come back and dance again.

### 2:00–2:30 · Close and hand off

Show the seated excerpt or the two prepared views of the same routine. Finish on the group leaderboard. Leave the result visible for questions.

> We’re entering People First because we want friends with different ways of moving to share the same workout and group. PULSE runs locally for this demo. Next, we’d test it with student dance groups and seated dancers, then record routines with creators. We’d keep the core experience free and explore optional extras such as silhouette highlights. We’re ready for questions.

## Popular Vote script · 1:45 target, 2:00 hard stop

Start on the **Tip Toe** camera preview. Use the same dancer and prepared result as judging. If starting the dance runs long, show the short fallback excerpt and move on at the next cue.

### 0:00–0:20 · Invite them in

Click **I’m ready** during the opening. Keep the dancer in frame and show **Hold still… starting soon** as you speak.

> Think of the song that gets you moving even when you weren’t planning to work out. That’s what PULSE is built around. Pick a routine like Tip Toe, follow the coach, and see how closely you match the moves.

### 0:20–0:45 · Show the moves

Follow a few beats. Point to the **Moves** meter and **No watch** on the heart. Pause the excerpt at the end of the cue.

> The coach moves with the music. PULSE uses your camera to see how closely you follow the moves. You can score points without a watch. You can dance standing or seated. In seated mode, the app scores upper-body movement.

### 0:45–1:20 · Show the social payoff

Switch to the completed rehearsal result, then **Feed** and the **Montreal Dancers** leaderboard. Use the prepared post so the handoff takes only a few clicks.

> Here’s a completed run from rehearsal. I shared it with Montreal Dancers, so my friends can give it kudos and see their best scores for the same routine on the weekly leaderboard. We can each dance on our own and still have something to do together.

### 1:20–1:45 · Ask for the vote

Show the seated excerpt if it is ready. End on the group leaderboard. If behind at 1:40, go straight to the final sentence. Stop speaking by 2:00.

> We want the friend who dances seated to be part of the same group as the friend who dances standing. If you’d like more ways to move with your friends, vote for PULSE.

## Demo laptop checklist

### Before the room

- [ ] Install dependencies while online with `npm ci`. Build the frozen checkout using `npm run build`. Start it with `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`. Use **http://localhost:4173** in desktop Chrome consistently so sign-in, camera permission and saved results use the same origin.
- [ ] Use a separate Chrome demo profile. Under **Me**, run **Reset demo data** and wait for **Demo data restored.** If saved data still prevents startup, clear site data for the demo origin in that profile, reload and sign in again. Clearing site data removes browser-local accounts and activity. Reset clears the rehearsal run and posts, so reset before preparing them.
- [ ] Sign in as **Théo Nguyen**, `theo-on-beat@pulse.demo`, with the bundled demo password `dance123`. Théo starts in **Montreal Dancers**. If using a new account instead, join **Montreal Dancers** under **Feed → Groups → Discover groups** before dancing. For the seated check, use **Jules Roy**, `jules-grooves@pulse.demo`, with the same demo password.
- [ ] Open **Me → Add your watch** and confirm **Not connected** and **--**. If a watch is live, choose **Disconnect** and confirm **Not connected**. Click **Continue** to open the dance catalogue. The live WHOOP check is tracked in [#90](https://github.com/Zaidmcuni/Pulse/issues/90).
- [ ] In **Get Ready**, grant camera access and check that shoulders, elbows and wrists stay visible. For standing, step back until the full body fits. For seated, use a stable chair with room for arm movement and frame the torso and arms. Put front lighting on the dancer, clear the background and have them raise each arm once to check the overlay. Confirm **No watch connected · points will come from your moves**. Click **I’m ready** and hold in frame until the dance starts.
- [ ] Check the actual projector or speaker output and Chrome volume with Tip Toe and both local videos. Use excerpts with the current no-watch labels. If Chrome asks, click **Tap to start the music**. Disable notifications, connect power, and keep the display awake through both scripts.
- [ ] Turn **Wi-Fi off** on the demo laptop. Reload the localhost URL while the preview server stays running. Confirm the catalogue, camera and music load and both local video files play. Keep the pitch video and full fallback recording from [#77](https://github.com/Zaidmcuni/Pulse/issues/77) on disk and cue a short dance excerpt and a seated excerpt. If either recording is unavailable, use the spoken opening and prepared app tabs.

### Prepare the live handoff

- [ ] Run Tip Toe to the end without a watch. Use Théo for a seeded group account or join **Montreal Dancers** with a fresh account to show a new leaderboard entry. Allow about 3:06 plus setup. Confirm **No watch** and **-- bpm** during play, and check that points increase as the dancer matches the moves. On **Dance complete**, verify **Total points** and the accuracy in **Moves**. Check that **Calories** shows **-- · No watch** and **Effort** shows **No watch: connect one to see your effort**. Dismiss any badge dialog. Keep the completed result in a dedicated tab and the live dance in a separate tab.
- [ ] Put the **Montreal Dancers** group and **Feed** within one click. Confirm the shared result appears in the group feed and check that **Completed dances** and **Total points** under **Me** reflect the run. Under **Settings**, check for **No watch connected. Dances score your moves only.** The group leaderboard shows each member’s best completed Tip Toe score in the local week. Théo’s demo-week best is a fixture at 1,863 points. A perfect no-watch Tip Toe tops out at 1,488, so use a fresh group member to show the rehearsal score on the leaderboard during demo week. For judging, leave one completed result unposted if you plan to post live. For Popular Vote, have the already-shared result visible. Reload any prepared feed or group tab after posting so it shows the new activity.
- [ ] The bundled leaderboard scores are dated November 16–22, 2026. In another local week, complete practice runs under multiple group accounts before the show or use a clearly identified recording from demo week for the comparison. Keep the laptop clock on its real local time.
- [ ] Run the standing primary path and seated fallback twice. Record the browser and laptop, dance mode, points, accuracy, calories label, and whether the result appeared on the group leaderboard. Between shows, stop or pause the live excerpt and restore the prepared tabs. Avoid resetting after staging.

### Recover under the timer

| Situation | Operator cue |
| --- | --- |
| Watch disconnects during the live excerpt | Move to the prepared result or video at the handoff cue. For the next run, return to **Me → Add your watch**, confirm **Not connected**, and click **Continue** to start without a watch. |
| Camera denied, tracking drops or audio is silent | During setup, check site permissions, choose **Retry Camera**, fix framing or select the right audio output. On stage, give the live setup until its next cue, then show the matching fallback excerpt. |
| Video missing or player fails | Read the opening with the catalogue visible. Use the staged result, feed and group tabs. Say which run was completed in rehearsal. |
| Live dance ends early | Use the completed rehearsal result. An early quit shows duration and the calories field. Posting and ranking require a completed run. |
| Group missing from the post dialog or leaderboard empty | Check the signed-in account, Tip Toe, membership and local week. In the room, show the staged feed or the recorded leaderboard and label it as a recording. |
| Result already posted or a new badge covers the screen | Use **Feed** for an existing post. Dismiss any badge dialog before advancing. |

## Judge Q&A

| Question | Answer |
| --- | --- |
| Why PULSE if I already play Just Dance? | PULSE offers seated scoring and gives a group a place to share results and compare weekly scores. A supported watch adds heart-rate effort to scoring. |
| Can you ship these routines? | The current routines are demo placeholders. For a release, we would license the music and commission or license creator-recorded choreography. |
| How do points work? | Without a watch, each tracked second earns up to 8 points in proportion to how closely the dancer matches the moves. With a watch, accuracy weights a TRIMP-based effort score. Estimated calories are separate from points and require a heart-rate reading. |
| How fair is it across bodies and ages? | With a watch, effort is based on the individual’s heart-rate range. Seated scoring compares upper-body segments. We would test perceived fairness with dancers before making broader claims. |
| What happens to camera footage? | Pose tracking runs on-device. The side-by-side highlight can keep webcam video in browser memory for the current tab. Raw video stays off the network, and exporting a clip is a deliberate download. Reopened highlights can fall back to saved pose silhouettes. Posts omit body stats and raw heart rate. Sharing estimated calories or an average heart rate is optional and off by default. |
| What about my watch? | PULSE works with a supported Bluetooth heart-rate broadcast from a WHOOP or Garmin. Apple Watch support would need a native integration. |
| How would you fund it? | Keep core dancing and sharing free. Test repeat use with student groups before exploring optional paid features such as highlight tools. |
