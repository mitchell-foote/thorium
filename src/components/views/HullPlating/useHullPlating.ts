import {
  useHullPlatingsQuery,
  useHullPlatingsUpdateSubscription,
} from "generated/graphql";

// The simulator's hull plating system, kept live. The update subscription
// doesn't send an initial value, so a query provides the first one.
export function useHullPlating(simulatorId: string) {
  const {data, loading} = useHullPlatingsQuery({
    variables: {simulatorId},
    fetchPolicy: "cache-and-network",
  });
  const {data: subscriptionData} = useHullPlatingsUpdateSubscription({
    variables: {simulatorId},
  });
  const list = subscriptionData?.hullPlatingUpdate ?? data?.hullPlatings;
  return {loading: loading && !list, hullPlating: list?.[0] ?? null};
}

// True when the plating is engaged, powered and undamaged.
export function isOperational(hullPlating: {
  engaged?: boolean | null;
  damage?: {damaged?: boolean | null} | null;
  power?: {
    power?: number | null;
    powerLevels?: (number | null)[] | null;
  } | null;
}) {
  const levels = hullPlating.power?.powerLevels || [];
  const hasPower =
    levels.length === 0 || (hullPlating.power?.power ?? 0) >= (levels[0] ?? 0);
  return Boolean(
    hullPlating.engaged && !hullPlating.damage?.damaged && hasPower,
  );
}
