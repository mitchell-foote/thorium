import App from "../app";
import {gql, withFilter} from "apollo-server-express";
import {pubsub} from "../helpers/subscriptionManager";
import mutationHelper from "../helpers/mutationHelper";
// We define a schema that encompasses all of the types
// necessary for the functionality in this file.
const schema = gql`
  enum HULL_PLATING_MODE {
    kinetic
    energy
    radiation
  }

  type HullPlating implements SystemInterface {
    id: ID
    simulatorId: ID
    type: String
    name: String
    displayName: String
    upgradeName: String
    upgraded: Boolean
    extra: Boolean
    damage: Damage
    locations: [Room]
    stealthFactor: Float
    power: Power
    engaged: Boolean
    mode: HULL_PLATING_MODE
    pulse: Boolean
    effectiveness: Float
    autoEffectiveness: Boolean
    focusBearing: Float
    maxEffectiveness: Float
    recoveryTime: Float
    hitType: HULL_PLATING_MODE
    hitIntensity: Float
    battleConnected: Boolean
  }

  type HullPlatingPing {
    id: ID!
    hitType: HULL_PLATING_MODE!
    bearing: Float!
    absorbed: Float!
    intensity: Float!
  }

  extend type Query {
    hullPlating(id: ID!): HullPlating
    hullPlatings(simulatorId: ID!): [HullPlating]
  }
  extend type Mutation {
    setHullPlatingMode(id: ID!, mode: HULL_PLATING_MODE): String
    setHullPlatingEngaged(id: ID!, engaged: Boolean): String
    setHullPlatingPulse(id: ID!, pulse: Boolean): String
    setHullPlatingAutoEffectiveness(id: ID!, auto: Boolean!): String
    """
    Bearing in degrees clockwise from the top of the ship's top-view image
    as shown on screen. Null balances the plating.
    """
    setHullPlatingFocus(id: ID!, bearing: Float): String
    """
    The most effective (0 to 1) the plating is allowed to become.
    """
    setHullPlatingMaxEffectiveness(id: ID!, max: Float!): String
    """
    Seconds the plating takes to recover after a hit knocks it down.
    """
    setHullPlatingRecoveryTime(id: ID!, seconds: Float!): String
    setHullPlatingHitType(id: ID!, type: HULL_PLATING_MODE!): String
    """
    How hard hits land, 0 to 1. Used when a hit doesn't give its own intensity.
    """
    setHullPlatingHitIntensity(id: ID!, intensity: Float!): String
    """
    Whether battle core projectiles that reach the ship also hit the plating.
    """
    setHullPlatingBattleConnected(id: ID!, connected: Boolean!): String
    """
    Lands a hit on the hull plating: shows the impact on the hull plating
    screens and lowers effectiveness by what the plating failed to stop. Type
    and intensity default to the hit settings on the core. Bearing is degrees
    clockwise from the top of the ship's top-view image and defaults to a
    random direction.
    """
    hullPlatingHit(
      id: ID!
      type: HULL_PLATING_MODE
      bearing: Float
      intensity: Float
    ): String
  }
  extend type Subscription {
    hullPlatingUpdate(simulatorId: ID): [HullPlating!]!
    hullPlatingPing(simulatorId: ID!): HullPlatingPing
  }
`;

const resolver = {
  HullPlating: {
    locations(rootValue) {
      return rootValue.locations.map(r =>
        App.rooms.find(room => room.id === r),
      );
    },
  },
  Query: {
    hullPlating(rootValue, {id}) {
      const sys = App.systems.find(s => s.id === id);
      if (!sys) return App.dockingPorts.find(s => s.id === id);
      return sys;
    },
    hullPlatings(root, {simulatorId}) {
      let returnVal = App.systems.filter(s => s.type === "HullPlating");
      if (simulatorId) {
        returnVal = returnVal.filter(s => s.simulatorId === simulatorId);
      }
      return returnVal;
    },
  },
  Mutation: mutationHelper(schema),
  Subscription: {
    hullPlatingUpdate: {
      resolve(rootValue, {simulatorId}) {
        let returnSystems = rootValue;
        if (simulatorId) {
          returnSystems = returnSystems.filter(
            s => s.simulatorId === simulatorId,
          );
        }
        return returnSystems;
      },
      subscribe: withFilter(
        () => pubsub.asyncIterator("hullPlatingUpdate"),
        rootValue => !!(rootValue && rootValue.length),
      ),
    },
    hullPlatingPing: {
      resolve(rootValue) {
        return rootValue;
      },
      // Transient one-shot events — no initial publish on subscribe
      subscribe: withFilter(
        () => pubsub.asyncIterator("hullPlatingPing"),
        (rootValue, args) => rootValue?.simulatorId === args?.simulatorId,
      ),
    },
  },
};

export default {schema, resolver};
