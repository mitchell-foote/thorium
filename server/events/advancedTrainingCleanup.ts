import App from "../app";
import {AdvancedTrainingProgress} from "../classes/advancedTrainingProgress";
import {
  getClientTrainingConfig,
  publishProgress,
  publishClientChanged,
} from "./advancedTrainingHelpers";
import {teardownTrainingTacticalMap} from "./advancedTrainingTacticalMap";

// Shared teardown for advanced-training sessions. `App.advancedTrainingProgress`
// is a flat, global, client-keyed list that isn't persisted to snapshots, so a
// stale record survives everything short of a server restart. `deleteFlight`,
// `resetFlight`, and any station/simulator reassignment need to drop the
// matching records; this module is the one place that logic lives.
//
// Unlike the `clientStopAdvancedTraining` handler in ./advancedTraining, these
// helpers do NOT bail out when the client object is missing — cleaning up
// orphaned records (client already reset/removed) is the whole point.

// End the training session for every progress record matching `predicate`.
export function stopAdvancedTrainingForClients(
  predicate: (progress: AdvancedTrainingProgress) => boolean,
) {
  const all = App.advancedTrainingProgress || [];
  const doomed = all.filter(predicate);
  if (doomed.length === 0) {
    return;
  }

  for (const progress of doomed) {
    // Delete the client's private live tactical map instance, if any. Callers
    // that also tear down flight tactical maps must invoke this BEFORE that so
    // the map is still present to be removed cleanly.
    teardownTrainingTacticalMap(progress);

    const client = App.clients.find((c: any) => c.id === progress.clientId);
    if (client) {
      client.setTraining(false);
    }
  }

  const doomedIds = new Set(doomed.map(p => p.id));
  App.advancedTrainingProgress = all.filter(p => !doomedIds.has(p.id));

  publishProgress();
  publishClientChanged();
}

// Drop any progress record that no longer corresponds to a live, matching
// training assignment: the client is gone, the client has moved to a different
// simulator/station, or the station no longer has advanced training enabled.
export function pruneStaleAdvancedTrainingProgress() {
  stopAdvancedTrainingForClients(progress => {
    const client = App.clients.find((c: any) => c.id === progress.clientId);
    if (!client) {
      return true;
    }
    if (
      client.simulatorId !== progress.simulatorId ||
      client.station !== progress.stationName
    ) {
      return true;
    }
    if (!getClientTrainingConfig(progress.clientId)) {
      return true;
    }
    return false;
  });
}
