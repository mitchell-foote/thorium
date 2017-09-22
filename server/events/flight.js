import App from "../../app.js";
import { pubsub } from "../helpers/subscriptionManager.js";
import * as Classes from "../classes";
import uuid from "uuid";

// Flight
App.on("startFlight", ({ id, name, simulators }) => {
  // Loop through all of the simulators
  const simIds = simulators.map(s => {
    const template = Object.assign(
      {},
      App.simulators.find(sim => sim.id === s.simulatorId)
    );
    template.id = null;
    const sim = new Classes.Simulator(template);
    sim.template = false;
    sim.templateId = s.simulatorId;
    sim.mission = s.missionId;
    const stationSet = App.stationSets.find(ss => ss.id === s.stationSet);
    sim.stations = stationSet.stations;
    sim.stationSet = stationSet.id;
    App.simulators.push(sim);
    // Duplicate all of the other stuff attached to the simulator too.
    [
      "systems",
      "decks",
      "rooms",
      "crew",
      "teams",
      "inventory",
      "dockingPorts"
    ].forEach(aspect => {
      const filterAspect = App[aspect].filter(
        a => a.simulatorId === s.simulatorId
      );
      filterAspect.forEach(a => {
        const newAspect = Object.assign({}, a);
        newAspect.id = null;
        newAspect.simulatorId = sim.id;
        // Rooms need to reference their deck
        if (aspect === "rooms") {
          const oldDeck = App.decks.find(d => d.id === newAspect.deckId);
          const deck = App.decks.find(
            d => d.simulatorId === sim.id && d.number === oldDeck.number
          );
          newAspect.deckId = deck.id;
        }
        if (aspect === "systems") {
          // Create a new isochip for that system, if one exists
          const isochip = App.isochips.find(i => i.system === a.id);
          // Override the system ID
          newAspect.id = uuid.v4();
          if (isochip) {
            isochip.id = uuid.v4();
            isochip.system = newAspect.id;
            isochip.simulatorId = sim.id;
            App.isochips.push(new Classes.Isochip(isochip));
          }
          if (newAspect.power && newAspect.power.powerLevels.length) {
            newAspect.power.power = newAspect.power.powerLevels[0];
          }
          if (newAspect.power && !newAspect.power.powerLevels.length) {
            newAspect.power.power = 0;
          }
        }
        App[aspect].push(new Classes[newAspect.class](newAspect));
      });
    });
    return sim.id;
  });
  App.flights.push(new Classes.Flight({ id, name, simulators: simIds }));
  pubsub.publish("flightsUpdate", App.flights);
});

App.on("pauseFlight", () => {});
App.on("resumeFlight", () => {});
App.on("removeFlight", () => {});