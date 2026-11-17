import App from "../app";
import {pubsub} from "../helpers/subscriptionManager";
import HullPlating from "../classes/hullPlating";

const TICK_SECONDS = 0.5;

// Ramps hull plating effectiveness up while the plating is engaged, and drops
// it when the plating loses power or is damaged.
function processHullPlating() {
  let changed = false;
  App.flights
    .filter(f => f.running === true)
    .forEach(f => {
      f.simulators.forEach((id: string) => {
        App.systems
          .filter(sys => sys.simulatorId === id && sys.class === "HullPlating")
          .forEach((sys: HullPlating) => {
            if (sys.tick(TICK_SECONDS)) {
              changed = true;
            }
          });
      });
    });
  if (changed) {
    pubsub.publish(
      "hullPlatingUpdate",
      App.systems.filter(s => s.type === "HullPlating"),
    );
  }
  setTimeout(processHullPlating, TICK_SECONDS * 1000);
}

processHullPlating();
