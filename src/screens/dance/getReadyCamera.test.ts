/**
 * Owner: Zaid
 * Purpose: Camera startup and retry regression tests (FR-23).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { initPoseLandmarker, startPose } from "../../vision/poseEngine";
import { startGetReadyCamera } from "./getReadyCamera";

vi.mock("../../vision/poseEngine", () => ({ initPoseLandmarker: vi.fn(), startPose: vi.fn() }));

class CameraVideo extends EventTarget {
  srcObject: MediaStream | null = null;
  readyState = 0;
  videoWidth = 0;
  videoHeight = 0;
  play = vi.fn(async () => undefined);

  loadMetadata(): void {
    this.readyState = 1;
    this.videoWidth = 640;
    this.videoHeight = 480;
    this.dispatchEvent(new Event("loadedmetadata"));
  }
}

function makeStream() {
  const track = Object.assign(new EventTarget(), { readyState: "live", stop: vi.fn() });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}

function makeCallbacks() {
  return { onReady: vi.fn(), onError: vi.fn(), onFrame: vi.fn() };
}

function setupVideo() {
  const element = new CameraVideo();
  return { element, video: element as unknown as HTMLVideoElement };
}

describe("Get Ready camera attempts", () => {
  const stopPose = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(initPoseLandmarker).mockResolvedValue(undefined);
    vi.mocked(startPose).mockReturnValue(stopPose);
  });

  it("stops a late permission stream without touching the successful retry", async () => {
    const { element, video } = setupVideo();
    const first = makeStream();
    const second = makeStream();
    let resolveOld!: (stream: MediaStream) => void;
    const media = { getUserMedia: vi.fn<MediaDevices["getUserMedia"]>()
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(second.stream) };
    const old = makeCallbacks();
    const current = makeCallbacks();

    const cancelOld = startGetReadyCamera(video, media, old);
    cancelOld();
    const cancelCurrent = startGetReadyCamera(video, media, current);
    await vi.waitFor(() => expect(element.srcObject).toBe(second.stream));
    element.loadMetadata();
    await vi.waitFor(() => expect(current.onReady).toHaveBeenCalledWith(640, 480));

    resolveOld(first.stream);
    await vi.waitFor(() => expect(first.track.stop).toHaveBeenCalledOnce());
    cancelOld();
    expect(old.onReady).not.toHaveBeenCalled();
    expect(old.onError).not.toHaveBeenCalled();
    expect(second.track.stop).not.toHaveBeenCalled();
    expect(element.srcObject).toBe(second.stream);

    cancelCurrent();
    expect(stopPose).toHaveBeenCalledOnce();
    expect(second.track.stop).toHaveBeenCalledOnce();
    expect(element.srcObject).toBeNull();
  });

  it("removes listeners and stops an attached stream that never reports metadata", async () => {
    const { element, video } = setupVideo();
    const { track, stream } = makeStream();
    const callbacks = makeCallbacks();
    const remove = vi.spyOn(element, "removeEventListener");
    const removeTrack = vi.spyOn(track, "removeEventListener");
    const cancel = startGetReadyCamera(video, { getUserMedia: async () => stream }, callbacks);
    await vi.waitFor(() => expect(element.srcObject).toBe(stream));

    cancel();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(element.srcObject).toBeNull();
    expect(remove.mock.calls.map(([name]) => name)).toEqual(["loadedmetadata", "loadeddata", "error"]);
    expect(removeTrack).toHaveBeenCalledWith("ended", expect.any(Function));
    element.loadMetadata();
    track.dispatchEvent(new Event("ended"));
    await Promise.resolve();
    expect(startPose).not.toHaveBeenCalled();
    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("reports denial for the current request and ignores denial after cancellation", async () => {
    const { video } = setupVideo();
    const denied = new DOMException("Permission denied", "NotAllowedError");
    const old = makeCallbacks();
    const current = makeCallbacks();
    const media = { getUserMedia: async () => { throw denied; } };

    startGetReadyCamera(video, media, old)();
    startGetReadyCamera(video, media, current);

    await vi.waitFor(() => expect(current.onError).toHaveBeenCalledWith(denied));
    expect(old.onError).not.toHaveBeenCalled();
    expect(current.onReady).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });
});
