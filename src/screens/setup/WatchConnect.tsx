/**
 * Owner: Mohamed
 * Purpose: WatchConnect screen (/watch)
 * FRs: FR-04, FR-06, FR-08
 * Contract: signatures below are LOCKED (RULES.md section 2). Implement the bodies only.
 */

import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { getActiveMonitor, setActiveMonitor } from "../../hr/activeMonitor";
import { createBleMonitor, createSimulatedMonitor } from "../../hr/heartRate";
import type { HeartRateMonitor, HrReading } from "../../types/pulse";
import { classifyConnectError, statusLabel, type ConnectProblem } from "./watchStatus";
import "./setup.css";

// Re-render this often so the status label and staleness update (there is no status event). Display-only.
const POLL_MS = 1000;

interface Latest {
  reading: HrReading;
  receivedAtMs: number; // performance.now() when it arrived
}

function ProblemPanel({ problem, onSimulated }: { problem: ConnectProblem; onSimulated: () => void }): ReactElement {
  return (
    <div className="watch-connect-problem" role="status">
      {problem === "unsupported" && (
        <p>Your browser can't connect to watches. Use Chrome or Edge on a laptop, or dance with simulated heart rate.</p>
      )}
      {problem === "not-found" && (
        <>
          <p>No watch found. Turn on heart-rate broadcast, then try again:</p>
          <p className="watch-connect-steps-title">WHOOP</p>
          <ol className="watch-connect-steps">
            <li>Open the WHOOP app → Device settings → turn on <strong>Broadcast Heart Rate</strong>.</li>
            <li>Keep the strap on your wrist.</li>
          </ol>
          <p className="watch-connect-steps-title">Garmin</p>
          <ol className="watch-connect-steps">
            <li>On the watch, open the heart-rate settings and turn on <strong>Broadcast Heart Rate</strong> (the menu name varies by model).</li>
            <li>Keep the watch awake.</li>
          </ol>
        </>
      )}
      {problem === "failed" && <p>The watch connected but stopped responding. Move closer and try again.</p>}
      <div>
        <button type="button" className="btn btn-secondary" onClick={onSimulated}>Use simulated heart rate</button>
      </div>
    </div>
  );
}

export default function WatchConnect(): ReactElement {
  const navigate = useNavigate();
  const [monitor, setMonitor] = useState<HeartRateMonitor | null>(() => getActiveMonitor());
  const [latest, setLatest] = useState<Latest | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [problem, setProblem] = useState<ConnectProblem | null>(null);
  // FR-06: true once the BLE watch was live on this screen, so a later drop shows "Your watch disconnected."
  const [wasLive, setWasLive] = useState(() => getActiveMonitor()?.status() === "live");
  const [, setTick] = useState(0);

  // Subscribe to the active monitor and poll its status. Never disconnect here: the dance screen needs it.
  useEffect(() => {
    if (!monitor) return;
    const unsubscribe = monitor.subscribe((reading) => setLatest({ reading, receivedAtMs: performance.now() }));
    const timer = setInterval(() => {
      if (monitor.status() === "live") setWasLive(true);
      setTick((t) => t + 1);
    }, POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [monitor]);

  const status = monitor ? monitor.status() : "disconnected";
  const isSimulated = status === "simulated";
  // Only BLE monitors report "live" or "disconnected"; simulated always reports "simulated".
  const bleMonitor = monitor && !isSimulated ? monitor : null;
  const secondsSinceReading = latest ? (performance.now() - latest.receivedAtMs) / 1000 : null;
  const dropped = wasLive && bleMonitor !== null && status === "disconnected";

  function activate(m: HeartRateMonitor): void {
    if (m !== monitor) {
      setLatest(null);
      setWasLive(false);
    }
    setActiveMonitor(m);
    setMonitor(m);
    setProblem(null);
  }

  async function handleConnect(): Promise<void> {
    // Reuse the same BLE monitor so a retry reconnects without a new picker.
    const m = bleMonitor ?? createBleMonitor();
    activate(m);
    setConnecting(true);
    try {
      await m.connect();
      setWasLive(true);
    } catch (err) {
      // Ignore failures from a monitor the user already replaced (e.g. chose simulated meanwhile).
      if (getActiveMonitor() === m) setProblem(classifyConnectError(err));
    } finally {
      setConnecting(false);
    }
  }

  // FR-06: let go of the watch on purpose, so no "Your watch disconnected." message. The next Connect
  // creates a new BLE monitor, so the picker opens again and a different watch can be chosen.
  function handleDisconnect(): void {
    monitor?.disconnect();
    setActiveMonitor(null);
    setMonitor(null);
    setLatest(null);
    setWasLive(false);
    setProblem(null);
  }

  async function handleSimulated(): Promise<void> {
    const m = createSimulatedMonitor();
    activate(m);
    await m.connect();
  }

  const connectLabel = connecting ? "Connecting…" : dropped ? "Reconnect" : "Connect watch";
  const canContinue = status === "live" || isSimulated;
  const canDisconnect = (bleMonitor !== null && status === "live") || isSimulated;

  return (
    <main className="watch-connect">
      <div className="card watch-connect-card">
        <h1 className="watch-connect-title">Connect your watch</h1>
        <p className="watch-connect-intro">PULSE reads your heart rate to measure effort. Points come from how hard you work.</p>

        <div className="watch-connect-status">
          <span className="badge">{statusLabel(status, secondsSinceReading)}</span>
          {monitor && <span className="watch-connect-source">{isSimulated ? "Simulated heart rate" : "WHOOP / Garmin"}</span>}
        </div>

        <div className="watch-connect-bpm">
          {latest ? (
            <p className="watch-connect-bpm-value">
              {latest.reading.bpm} <span className="watch-connect-bpm-unit">bpm</span>
            </p>
          ) : (
            <p className="watch-connect-bpm-value">--</p>
          )}
          {isSimulated && <p className="watch-connect-bpm-simulated">Simulated</p>}
        </div>

        {dropped && <p className="watch-connect-dropped" role="status">Your watch disconnected.</p>}

        <div className="watch-connect-actions">
          {!(bleMonitor && status === "live") && (
            <button type="button" className="btn btn-primary" disabled={connecting} onClick={() => void handleConnect()}>
              {connectLabel}
            </button>
          )}
          {canDisconnect && (
            <button type="button" className="btn btn-secondary" onClick={handleDisconnect}>
              Disconnect
            </button>
          )}
          {!isSimulated && (
            <button type="button" className="btn btn-secondary" onClick={() => void handleSimulated()}>
              Use simulated heart rate
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!canContinue} onClick={() => navigate("/dances")}>
            Continue
          </button>
        </div>

        {problem && <ProblemPanel problem={problem} onSimulated={() => void handleSimulated()} />}
      </div>
    </main>
  );
}
