import App from "../app";
import {getClientTrainingConfig} from "./advancedTrainingHelpers";

// Advanced training has no equivalent of legacy training mode's "scan finds
// targets after 5s" behavior, so crew would sit on "Scanning..." forever and
// never reach the targeting/charging screen. When a transport scan begins, find
// whether a training crew member's active chapter (or the Record Actions
// sandbox) wants targets, and supply them.

const SANDBOX_FLIGHT_PREFIX = "__sandbox_";
const SANDBOX_TARGET_COUNT = 2;
export const TRANSPORTER_SCAN_DELAY_MS = 5000;

// How many targets to add for a scan on this simulator (0 = none).
export function getTransporterTargetCount(simulatorId: string): number {
  const progresses = (App.advancedTrainingProgress || []).filter(
    (p: any) => p.simulatorId === simulatorId,
  );
  for (const progress of progresses) {
    const config = getClientTrainingConfig(progress.clientId);
    const chapter = config?.findChapter(progress.activeChapterId);
    if (chapter?.transporterTargetCount > 0) {
      return chapter.transporterTargetCount;
    }
  }
  // Record Actions sandbox: let the FD record the targeting steps.
  const inSandbox = App.flights.some(
    (f: any) =>
      f.name?.startsWith(SANDBOX_FLIGHT_PREFIX) &&
      f.simulators?.includes(simulatorId),
  );
  return inSandbox ? SANDBOX_TARGET_COUNT : 0;
}

App.on("beginTransportScan", ({transporter: transporterId}: any) => {
  const transporter = App.systems.find((s: any) => s.id === transporterId);
  // Legacy training mode already schedules its own targets.
  if (!transporter || transporter.training) {
    return;
  }
  const targets = getTransporterTargetCount(transporter.simulatorId);
  if (!targets) {
    return;
  }
  setTimeout(() => {
    // Only supply targets if the scan wasn't cancelled in the meantime.
    if (transporter.state !== "Scanning") {
      return;
    }
    App.handleEvent(
      {transporter: transporter.id, targets},
      "setTransporterTargets",
      {clientId: "training", simulatorId: transporter.simulatorId},
    );
  }, TRANSPORTER_SCAN_DELAY_MS);
});
