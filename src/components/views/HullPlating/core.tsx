import React from "react";
import {
  Simulator,
  Hull_Plating_Mode,
  useHullPlatingPingSubscription,
  useHullPlatingSetEngagedMutation,
  useHullPlatingSetModeMutation,
  useHullPlatingSetPulseMutation,
  useHullPlatingSetAutoEffectivenessMutation,
  useHullPlatingSetMaxEffectivenessMutation,
  useHullPlatingSetRecoveryTimeMutation,
  useHullPlatingSetHitTypeMutation,
  useHullPlatingSetHitIntensityMutation,
  useHullPlatingSetBattleConnectedMutation,
  useHullPlatingHitMutation,
} from "generated/graphql";
import {Button, Input} from "reactstrap";
import {HullPlatingModeConstants} from "./constants";
import CoreSlider from "./CoreSlider";
import DirectionArrow from "./DirectionArrow";
import HitPad from "./HitPad";
import {isOperational, useHullPlating} from "./useHullPlating";
import "./style.scss";

interface HullPlatingCoreProps {
  children: React.ReactNode;
  simulator: Simulator;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

const HullPlatingCore: React.FC<HullPlatingCoreProps> = ({simulator}) => {
  const simulatorId = simulator.id;
  const {loading, hullPlating} = useHullPlating(simulatorId);
  const {data: pingData} = useHullPlatingPingSubscription({
    variables: {simulatorId},
  });
  const [setEngaged] = useHullPlatingSetEngagedMutation();
  const [setMode] = useHullPlatingSetModeMutation();
  const [setPulse] = useHullPlatingSetPulseMutation();
  const [setAuto] = useHullPlatingSetAutoEffectivenessMutation();
  const [setMax] = useHullPlatingSetMaxEffectivenessMutation();
  const [setRecovery] = useHullPlatingSetRecoveryTimeMutation();
  const [setHitType] = useHullPlatingSetHitTypeMutation();
  const [setHitIntensity] = useHullPlatingSetHitIntensityMutation();
  const [setBattleConnected] = useHullPlatingSetBattleConnectedMutation();
  const [hit] = useHullPlatingHitMutation();

  if (loading) {
    return <div>No Values</div>;
  }
  if (!hullPlating) {
    return <div>No Template</div>;
  }

  const id = hullPlating.id as string;
  const mode = hullPlating.mode || Hull_Plating_Mode.Kinetic;
  const hitType = hullPlating.hitType || Hull_Plating_Mode.Kinetic;
  const operational = isOperational(hullPlating);
  const effectiveness = operational ? hullPlating.effectiveness ?? 0 : 0;
  const maxEffectiveness = hullPlating.maxEffectiveness ?? 1;
  const focusBearing = hullPlating.focusBearing ?? null;
  const lastHit = pingData?.hullPlatingPing;
  const topView = simulator.assets?.top;
  // Type and intensity are left off so the server uses the settings below —
  // the same ones a battle core hit uses.
  const sendHit = (bearing: number | null) => hit({variables: {id, bearing}});

  return (
    <div className="core-hullPlating">
      <div className="core-hullPlating-row">
        <label>
          <input
            id="hull-plating-engaged"
            type="checkbox"
            checked={Boolean(hullPlating.engaged)}
            onChange={() =>
              setEngaged({variables: {id, engaged: !hullPlating.engaged}})
            }
          />{" "}
          Engaged
        </label>
        <Input
          type="select"
          bsSize="sm"
          title="The armor type the crew has selected"
          value={mode}
          onChange={e =>
            setMode({
              variables: {id, mode: e.target.value as Hull_Plating_Mode},
            })
          }
        >
          {HullPlatingModeConstants.map(each => (
            <option key={each.value} value={each.value}>
              {each.name}
            </option>
          ))}
        </Input>
      </div>
      <div className="core-hullPlating-row">
        <span>
          Effective:{" "}
          <strong
            className={
              effectiveness >= maxEffectiveness - 0.005 && effectiveness > 0
                ? "text-success"
                : "text-warning"
            }
          >
            {percent(effectiveness)}
          </strong>
        </span>
        <label title="When checked, the armor becomes effective on its own a short time after it is engaged or reconfigured. Uncheck to control effectiveness by hand.">
          <input
            type="checkbox"
            checked={hullPlating.autoEffectiveness !== false}
            onChange={e => setAuto({variables: {id, auto: e.target.checked}})}
          />{" "}
          Auto
        </label>
        <Button
          size="sm"
          color="success"
          title="Make the armor as effective as it is allowed to be, now"
          onClick={() => setPulse({variables: {id, pulse: true}})}
        >
          Pulse
        </Button>
        <Button
          size="sm"
          color="warning"
          title="Drop the armor's effectiveness to zero"
          onClick={() => setPulse({variables: {id, pulse: false}})}
        >
          Deactivate
        </Button>
      </div>
      <CoreSlider
        label="Max effective"
        title="The most effective the armor is allowed to become"
        value={maxEffectiveness}
        min={0}
        max={1}
        step={0.05}
        format={percent}
        onChange={max => setMax({variables: {id, max}})}
      />
      <CoreSlider
        label="Hit recovery"
        title="How long the armor takes to recover its effectiveness after a hit knocks it down"
        value={hullPlating.recoveryTime ?? 8}
        min={1}
        max={60}
        step={1}
        format={value => `${Math.round(value)}s`}
        onChange={seconds => setRecovery({variables: {id, seconds}})}
      />
      <div className="core-hullPlating-hit">
        <HitPad
          assetPath={topView ? `/assets${topView}` : null}
          mode={mode}
          focusBearing={focusBearing}
          hitType={hitType}
          lastHit={lastHit}
          onHit={sendHit}
        />
        <div className="core-hullPlating-hit-settings">
          <div className="core-hullPlating-row">
            <span>Hit:</span>
            <Input
              type="select"
              bsSize="sm"
              title="What the next hit is made of. Armor of the wrong type stops much less of it."
              value={hitType}
              onChange={e =>
                setHitType({
                  variables: {id, type: e.target.value as Hull_Plating_Mode},
                })
              }
            >
              {HullPlatingModeConstants.map(each => (
                <option key={each.value} value={each.value}>
                  {each.shortName}
                </option>
              ))}
            </Input>
            <Button
              size="sm"
              color="secondary"
              title="Hit from a random direction"
              onClick={() => sendHit(null)}
            >
              Random
            </Button>
          </div>
          <CoreSlider
            label="Intensity"
            title="How much effectiveness a hit knocks off when it gets through the armor. At 100% a hit that gets through drops the armor to zero; a hit the armor fully stops costs nothing."
            value={hullPlating.hitIntensity ?? 0.1}
            min={0.05}
            max={1}
            step={0.05}
            format={percent}
            onChange={intensity =>
              setHitIntensity({variables: {id, intensity}})
            }
          />
          <label title="When checked, a projectile fired from the battle core that reaches the ship also hits the armor, from the direction it came in on the sensor grid, using the hit type and intensity above.">
            <input
              type="checkbox"
              checked={hullPlating.battleConnected !== false}
              onChange={e =>
                setBattleConnected({
                  variables: {id, connected: e.target.checked},
                })
              }
            />{" "}
            Battle core hits land here
          </label>
          <small>Click around the ship to hit that side.</small>
        </div>
      </div>
      <div className="core-hullPlating-row">
        <span>
          Crew reinforcing:{" "}
          <span className="text-info">
            {focusBearing === null ? (
              "Balanced"
            ) : (
              <DirectionArrow bearing={focusBearing} />
            )}
          </span>
        </span>
        {lastHit && (
          <span>
            Last hit: {lastHit.hitType}{" "}
            <DirectionArrow bearing={lastHit.bearing} />{" "}
            <strong
              className={
                lastHit.absorbed >= 0.5 ? "text-success" : "text-danger"
              }
            >
              {percent(lastHit.absorbed)} absorbed
            </strong>
          </span>
        )}
      </div>
    </div>
  );
};

export default HullPlatingCore;
