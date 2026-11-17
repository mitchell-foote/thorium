import App from "../app";
import {pubsub} from "../helpers/subscriptionManager";
import uuid from "uuid";
import throttle from "../helpers/throttle";
import {HullPlating} from "../classes";
import {HullPlatingMode, normalizeBearing} from "../classes/hullPlating";

const sendUpdate = throttle(() => {
  pubsub.publish(
    "hullPlatingUpdate",
    App.systems.filter(s => s.type === "HullPlating"),
  );
}, 60);

App.on("setHullPlatingMode", ({id, mode}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  sys && sys.setMode(mode);
  sendUpdate();
});

App.on("setHullPlatingEngaged", ({id, engaged}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  if (sys) {
    pubsub.publish("notify", {
      id: uuid.v4(),
      simulatorId: sys.simulatorId,
      type: "Hull Plating",
      station: "Core",
      title: engaged
        ? `${sys.displayName} Engaged`
        : `${sys.displayName} Disengaged`,
      body: engaged
        ? `${sys.displayName} Engaged`
        : `${sys.displayName} Disengaged`,
      color: "info",
    });
    App.handleEvent(
      {
        simulatorId: sys.simulatorId,
        title: engaged
          ? `${sys.displayName} Engaged`
          : `${sys.displayName} Disengaged`,
        body: engaged
          ? `${sys.displayName} Engaged`
          : `${sys.displayName} Disengaged`,
        component: "HullPlatingCore",
        color: "info",
      },
      "addCoreFeed",
    );
    sys.setEngaged(engaged);
  }
  sendUpdate();
});

App.on("setHullPlatingPulse", ({id, pulse}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  sys && sys.setPulse(pulse);
  sendUpdate();
});

App.on("setHullPlatingAutoEffectiveness", ({id, auto}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  sys && sys.setAutoEffectiveness(auto);
  sendUpdate();
});

App.on("setHullPlatingFocus", ({id, bearing}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  sys && sys.setFocus(bearing);
  sendUpdate();
});

App.on("setHullPlatingMaxEffectiveness", ({id, max}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  sys && sys.setMaxEffectiveness(max);
  sendUpdate();
});

App.on("setHullPlatingRecoveryTime", ({id, seconds}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  sys && sys.setRecoveryTime(seconds);
  sendUpdate();
});

App.on("setHullPlatingHitType", ({id, type}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  sys && sys.setHitType(type);
  sendUpdate();
});

App.on("setHullPlatingHitIntensity", ({id, intensity}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  sys && sys.setHitIntensity(intensity);
  sendUpdate();
});

App.on("setHullPlatingBattleConnected", ({id, connected}) => {
  const sys: HullPlating = App.systems.find(s => s.id === id);
  sys && sys.setBattleConnected(connected);
  sendUpdate();
});

// Milliseconds a hit takes to cross the crew's screen before it lands; the
// effectiveness drop waits for it. Matches HIT_APPROACH on the client.
const HIT_APPROACH_MS = 450;

// Lands a hit on the plating: tells every hull plating screen to animate it
// and knocks effectiveness down by whatever the plating failed to stop. The
// ship itself takes no damage — that is still the Flight Director's call.
function landHit(
  sys: HullPlating,
  {
    type,
    bearing,
    intensity,
  }: {
    type?: HullPlatingMode | null;
    bearing?: number | null;
    intensity?: number | null;
  },
) {
  const hitType = type || sys.hitType;
  const hitBearing =
    bearing === null || bearing === undefined || isNaN(Number(bearing))
      ? Math.floor(Math.random() * 360)
      : normalizeBearing(Number(bearing));
  const hitIntensity =
    intensity === null || intensity === undefined
      ? sys.hitIntensity
      : Math.min(1, Math.max(0, Number(intensity) || 0));
  const absorbed = sys.absorption(hitType, hitBearing);
  pubsub.publish("hullPlatingPing", {
    id: uuid.v4(),
    simulatorId: sys.simulatorId,
    hitType,
    bearing: hitBearing,
    absorbed,
    intensity: hitIntensity,
  });
  if (sys.hitLoss(absorbed, hitIntensity) > 0) {
    setTimeout(() => {
      if (sys.takeHit(absorbed, hitIntensity) > 0) {
        sendUpdate();
      }
    }, HIT_APPROACH_MS);
  }
}

// A Flight Director-triggered impact. Type and intensity default to the hit
// settings on the core; bearing defaults to a random direction.
App.on(
  "hullPlatingHit",
  ({
    id,
    type,
    bearing,
    intensity,
  }: {
    id: string;
    type?: HullPlatingMode;
    bearing?: number | null;
    intensity?: number | null;
  }) => {
    const sys: HullPlating = App.systems.find(s => s.id === id);
    if (!sys || sys.class !== "HullPlating") return;
    landHit(sys, {type, bearing, intensity});
  },
);

// Battle core link: a projectile fired from the battle core has reached the
// ship. `bearing` is the direction it came from on the sensor grid, which
// uses the same convention as the plating (0 = top of the screen, clockwise).
App.on(
  "sensorsProjectileHit",
  ({simulatorId, bearing}: {simulatorId: string; bearing?: number | null}) => {
    App.systems
      .filter(
        s =>
          s.simulatorId === simulatorId &&
          s.class === "HullPlating" &&
          s.battleConnected,
      )
      .forEach((sys: HullPlating) => landHit(sys, {bearing}));
  },
);
