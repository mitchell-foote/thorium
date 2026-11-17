import React from "react";
import {
  Simulator,
  Hull_Plating_Mode,
  useHullPlatingPingSubscription,
  useHullPlatingSetEngagedMutation,
  useHullPlatingSetModeMutation,
  useHullPlatingSetFocusMutation,
} from "generated/graphql";
import {Row, Col, Container, Button} from "helpers/reactstrap";
import Tour from "helpers/tourHelper";
import DamageOverlay from "../helpers/DamageOverlay";
import HullPlatingCanvas, {HullPlatingCanvasHandle} from "./HullPlatingCanvas";
import EffectivenessWave, {EffectivenessWaveHandle} from "./EffectivenessWave";
import {HIT_APPROACH} from "./canvas/types";
import {hitLeak} from "./canvas/waveform";
import HoldButton from "./HoldButton";
import {HullPlatingModeConstants} from "./constants";
import {trainingSteps} from "./trainingSteps";
import DirectionArrow from "./DirectionArrow";
import {isOperational, useHullPlating} from "./useHullPlating";
import "./style.scss";

interface HullPlatingProps {
  children: React.ReactNode;
  simulator: Simulator;
}

// Crew station for the hull plating: the ship with its live plating on the
// left (drag around it to reinforce a side), and engage / armor type /
// effectiveness on the right.
const HullPlatingCard: React.FC<HullPlatingProps> = ({simulator}) => {
  const simulatorId = simulator.id;
  const {loading, hullPlating} = useHullPlating(simulatorId);
  const {data: pingData} = useHullPlatingPingSubscription({
    variables: {simulatorId},
  });
  const [setEngaged] = useHullPlatingSetEngagedMutation();
  const [setMode] = useHullPlatingSetModeMutation();
  const [setFocus] = useHullPlatingSetFocusMutation();
  const canvasRef = React.useRef<HullPlatingCanvasHandle>(null);
  const waveRef = React.useRef<EffectivenessWaveHandle>(null);

  // Forward Flight Director-triggered impacts to the canvas
  React.useEffect(() => {
    const ping = pingData?.hullPlatingPing;
    if (ping) {
      canvasRef.current?.addHit({
        hitType: ping.hitType,
        bearing: ping.bearing,
        absorbed: ping.absorbed,
        intensity: ping.intensity,
      });
      // Whatever the armor failed to stop shakes the effectiveness readout,
      // timed to when the hit reaches the hull
      waveRef.current?.disturb(
        hitLeak(ping.absorbed) * ping.intensity,
        HIT_APPROACH * 1000,
      );
    }
  }, [pingData]);

  if (loading) {
    return <div>No Values</div>;
  }
  if (!hullPlating) {
    return <div>No Template</div>;
  }

  const id = hullPlating.id as string;
  const mode = hullPlating.mode || Hull_Plating_Mode.Kinetic;
  const engaged = Boolean(hullPlating.engaged);
  const operational = isOperational(hullPlating);
  const effectiveness = operational ? hullPlating.effectiveness ?? 0 : 0;
  const focusBearing = hullPlating.focusBearing ?? null;
  const activeMode =
    HullPlatingModeConstants.find(m => m.value === mode) ||
    HullPlatingModeConstants[0];
  const topView = simulator.assets?.top;

  const maxEffectiveness = hullPlating.maxEffectiveness ?? 1;
  let status = "Armor Offline";
  if (operational) {
    if (effectiveness >= 0.995) {
      status = `${activeMode.name} Fully Effective`;
    } else if (effectiveness >= maxEffectiveness - 0.005) {
      status = `${activeMode.name} Holding at ${Math.round(
        effectiveness * 100,
      )}%`;
    } else {
      status = `${activeMode.name} Calibrating`;
    }
  }

  return (
    <Container fluid className="card-hullPlating">
      <DamageOverlay
        system={hullPlating}
        message={`${hullPlating.displayName || hullPlating.name} Offline`}
      />
      <Row className="hull-plating-content">
        <Col sm={8} className="hull-plating-main">
          <div className="hull-plating-ship">
            <HullPlatingCanvas
              ref={canvasRef}
              engaged={engaged}
              operational={operational}
              mode={mode}
              effectiveness={effectiveness}
              focusBearing={focusBearing}
              assetPath={topView ? `/assets${topView}` : null}
              onFocusChange={bearing => setFocus({variables: {id, bearing}})}
            />
            <div className={`hull-plating-status mode-${mode}`}>{status}</div>
          </div>
          <div className="hull-plating-reinforce">
            <div>
              <strong>Reinforcement: </strong>
              {focusBearing === null ? (
                "Balanced"
              ) : (
                <DirectionArrow bearing={focusBearing} />
              )}
              <small>Drag around the ship to reinforce a side.</small>
            </div>
            <Button
              color="secondary"
              disabled={focusBearing === null}
              onClick={() => setFocus({variables: {id, bearing: null}})}
            >
              Balance
            </Button>
          </div>
        </Col>
        <Col sm={4} className="hull-plating-controls">
          <div className="hull-plating-engage">
            <HoldButton
              className={engaged ? "is-engaged" : ""}
              onComplete={() =>
                setEngaged({variables: {id, engaged: !engaged}})
              }
            >
              {engaged ? "Hold to Disengage" : "Hold to Engage"}
            </HoldButton>
          </div>
          <div className="hull-plating-modes">
            <h4>Armor Type</h4>
            {HullPlatingModeConstants.map(each => (
              <button
                type="button"
                key={each.value}
                className={`hull-plating-mode mode-${each.value} ${
                  each.value === mode ? "is-active" : ""
                }`}
                onClick={() =>
                  setMode({
                    variables: {id, mode: each.value as Hull_Plating_Mode},
                  })
                }
              >
                <span className="hull-plating-mode-name">{each.name}</span>
                <span className="hull-plating-mode-description">
                  {each.description}
                </span>
              </button>
            ))}
          </div>
          <div className={`hull-plating-effect mode-${mode}`}>
            <div className="hull-plating-effect-header">
              <h4>Effectiveness</h4>
              <span className="hull-plating-effect-value">
                {Math.round(effectiveness * 100)}%
              </span>
            </div>
            <EffectivenessWave
              ref={waveRef}
              mode={mode}
              effectiveness={effectiveness}
            />
          </div>
        </Col>
      </Row>
      <Tour steps={trainingSteps} />
    </Container>
  );
};

export default HullPlatingCard;
