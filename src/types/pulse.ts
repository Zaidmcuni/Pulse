/**
 * Owner: Shared (change = team ping + every affected owner agrees)
 * Purpose: the single source of truth for every type that crosses a module boundary.
 * Never redefine these types elsewhere. Import them from here.
 */

// ---------- Time domains (branded so they can never be mixed up) ----------
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** performance.now() / requestVideoFrameCallback clock, in ms. Camera frames and heart-rate readings. */
export type PerfTimeMs = Brand<number, "PerfTimeMs">;
/** Milliseconds from the start of the song audio file. Templates, beats, scoring. */
export type SongTimeMs = Brand<number, "SongTimeMs">;

export const perfMs = (n: number): PerfTimeMs => n as PerfTimeMs;
export const songMs = (n: number): SongTimeMs => n as SongTimeMs;

// ---------- Enums ----------
export type PosturalMode = "standing" | "seated";
export type Sex = "male" | "female" | "other";
export type Difficulty = "easy" | "medium" | "hard";
export type MoveRating = "perfect" | "good" | "ok" | "miss";
export type AccuracyLevel = "bronze" | "silver" | "gold" | "superstar";
export type HeartRateSource = "ble" | "simulated";
export type HeartRateStatus = "live" | "disconnected" | "simulated";
export type GroupKind = "friends" | "city" | "dance_type";
export type BadgeId = "first_steps" | "on_fire" | "superstar" | "1k_club" | "crew_player" | "podium";
export type Tracking = "ok" | "uncertain";

export type SegmentId =
  | "l_upper_arm" | "r_upper_arm" | "l_forearm" | "r_forearm" | "torso"
  | "l_thigh" | "r_thigh" | "l_shin" | "r_shin";

/** Unit vector in PIXEL space (x right, y DOWN). Length is always 1 (validators check |len - 1| < 1e-6). */
export type Vec2 = readonly [number, number];
/** Only usable segments are present. A missing key = not usable. Never null, never [0, 0]. */
export type SegmentMap = Partial<Record<SegmentId, Vec2>>;

// ---------- Vision pipeline ----------
/** One MediaPipe landmark. x, y normalized 0..1 to the video frame (may go slightly outside when off-screen). */
export interface LandmarkPoint {
  x: number;
  y: number;
  v: number; // visibility 0..1 (@mediapipe/tasks-vision >= 0.10.11)
}

/**
 * Zaid's poseEngine output -> Toufic's segments.ts input.
 * - landmarks: EXACTLY 12 points in the order of SCORED_LANDMARK_INDICES (config.ts).
 * - Smoothed (One Euro) and background-locked. NOT mirrored. Labels are the dancer's own left/right (MediaPipe convention).
 * - Emitted once per new video frame. No person detected, or frame rejected by the background lock:
 *   still emitted, with every point { x: 0, y: 0, v: 0 }.
 */
export interface RawPoseLandmarks {
  tFrameMs: PerfTimeMs;    // requestVideoFrameCallback `now`
  mediaTimeSec: number;    // requestVideoFrameCallback metadata.mediaTime (video file time; used by the extract tool)
  width: number;           // video.videoWidth, > 0
  height: number;          // video.videoHeight, > 0
  landmarks: LandmarkPoint[];
}

/** Toufic's computePoseFrame output -> Mohamed's scoring, Zaid's overlay and recorder. */
export interface PoseFrame {
  tFrameMs: PerfTimeMs;
  segments: SegmentMap;    // MIRRORED; only segments of the given mode; only usable ones
  usableRatio: number;     // usable segments / segments of the mode, 0..1
  tracking: Tracking;      // "uncertain" exactly when usableRatio < CONFIG.uncertainUsableRatio
  points: LandmarkPoint[]; // the 12 landmarks, MIRRORED (x -> 1 - x, left/right swapped), same order
}

/** Highlight clip sample (Zaid's recorder -> Toufic's replay). Points torso-centered, divided by shoulder width. */
export interface RecordedPoseSample {
  tSongMs: SongTimeMs;
  points: LandmarkPoint[];
}

// ---------- Dances ----------
/** One template frame. NOT mirrored. */
export interface TemplateFrame {
  tMs: SongTimeMs;         // strictly increasing across frames
  segments: SegmentMap;    // all 9 standing segments when usable
}

export interface Dance {
  id: string;              // equals the file name: public/dances/<id>.json
  title: string;
  genre: string;
  difficulty: Difficulty;
  lengthSec: number;
  bpm: number;
  beatsMs: SongTimeMs[];   // strictly increasing
  popularity: number;
  audioUrl: string;        // e.g. "/dances/<id>.m4a"; t = 0 of the audio = tMs 0
  frames: TemplateFrame[];
}

// ---------- Heart rate ----------
export interface HrReading {
  bpm: number;             // integer
  source: HeartRateSource;
  atMs: PerfTimeMs;
}

export interface HeartRateMonitor {
  connect(): Promise<void>;          // must be called from a user click (BLE)
  disconnect(): void;
  subscribe(cb: (r: HrReading) => void): () => void; // returns unsubscribe
  status(): HeartRateStatus;
}

// ---------- People and results ----------
export interface PlayerProfile {
  id: string;
  handle: string;
  displayName: string;
  age: number;
  sex: Sex;
  weightKg: number;        // private; calories only
  heightCm: number;        // private
  restingHr: number;       // default CONFIG.restingHrDefault
  hrMaxOverride?: number;
  mode: PosturalMode;
  groupIds: string[];
}

export interface ScoreSample {
  tSec: number;            // whole seconds of song time since start
  heartRate: number;
  hrSource: HeartRateSource;
  effort: number;
  accuracy: number;        // 0..1, rolling
  points: number;          // earned this second
}

export interface SessionResult {
  id: string;
  playerId: string;
  danceId: string;
  completed: boolean;      // false = quit early: only durationSec + caloriesKcal are meaningful; totalPoints = 0
  totalPoints: number;
  accuracyPct: number;     // 0..100
  level: AccuracyLevel;
  durationSec: number;
  caloriesKcal: number;    // private unless posted
  bestWindowStartSec: number;
  samples: ScoreSample[];  // one per second
  createdAtIso: string;
}

// ---------- Social ----------
/** A post never contains body stats or heart rate (validators enforce the allowed keys). */
export interface FeedPost {
  id: string;
  authorId: string;
  resultId: string;
  showCalories: boolean;
  hasClip: boolean;
  groupIds: string[];
  kudosBy: string[];       // player ids; kudos count = kudosBy.length
  createdAtIso: string;
}

export interface Group {
  id: string;
  name: string;
  kind: GroupKind;
  memberIds: string[];
  groupDanceIds: string[];
}

export interface EarnedBadge {
  badgeId: BadgeId;
  playerId: string;
  earnedAtIso: string;
}

export interface Meetup {
  id: string;
  groupId: string;
  title: string;
  place: string;
  startsAtIso: string;
  rsvpIds: string[];
}

export interface LeaderboardRow {
  playerId: string;
  points: number;
}

// ---------- Module interfaces (implemented by the owner, mocked in src/mocks/) ----------
export interface LandmarkSmoother {
  smooth(points: LandmarkPoint[], tMs: PerfTimeMs): LandmarkPoint[];
  reset(): void;
}

export interface BackgroundLock {
  /** false = reject this frame (someone else jumped in). */
  accept(points: LandmarkPoint[]): boolean;
  reset(): void;
}

export interface PoseRecorder {
  push(frame: PoseFrame, tSongMs: SongTimeMs): void;
  getSamples(): RecordedPoseSample[];
  clear(): void;
}

export interface SongPlayer {
  load(dance: Dance): Promise<void>;
  start(): void;                                  // from a user click
  pause(): void;
  resume(): void;
  songTimeMs(): SongTimeMs;                       // what is playing now
  heardSongTimeMs(tFrameMs: PerfTimeMs): SongTimeMs; // FR-25
  onEnd(cb: () => void): void;
}

/** The only code that touches localStorage. Dances are loaded from public/dances/ and kept in memory. */
export interface Store {
  init(): Promise<void>;   // loads seed (first run) + every dance listed in /dances/index.json; call once at app start

  listProfiles(): PlayerProfile[];
  getActiveProfile(): PlayerProfile | null;
  saveProfile(p: PlayerProfile): void;
  setActiveProfile(id: string): void;

  listDances(): Dance[];
  getDance(id: string): Dance | undefined;

  saveResult(r: SessionResult): void;
  getResult(id: string): SessionResult | undefined;
  listResults(playerId: string): SessionResult[];

  createPost(p: Omit<FeedPost, "id" | "kudosBy" | "createdAtIso">): FeedPost;
  listFeed(groupId?: string): FeedPost[];         // newest first
  toggleKudos(postId: string, playerId: string): void;

  listGroups(): Group[];
  joinGroup(groupId: string, playerId: string): void;
  leaveGroup(groupId: string, playerId: string): void;
  weeklyLeaderboard(groupId: string, danceId: string): LeaderboardRow[];

  listMeetups(groupId: string): Meetup[];
  toggleRsvp(meetupId: string, playerId: string): void;

  listBadges(playerId: string): EarnedBadge[];
  awardBadge(b: EarnedBadge): void;

  resetDemo(): void;
}
