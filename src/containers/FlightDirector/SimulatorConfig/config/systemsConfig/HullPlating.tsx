import React from "react";
import {FormGroup, Label} from "helpers/reactstrap";
import GenericSystemConfig from "./Generic";
import {
  useHullPlatingsQuery,
  useHullPlatingSetAutoEffectivenessMutation,
  useHullPlatingSetBattleConnectedMutation,
  HullPlatingsDocument,
} from "generated/graphql";

const HullPlating = (props: any) => {
  const {simulatorId, id} = props;
  const {data} = useHullPlatingsQuery({variables: {simulatorId}});
  const [setAuto] = useHullPlatingSetAutoEffectivenessMutation({
    refetchQueries: [{query: HullPlatingsDocument, variables: {simulatorId}}],
  });
  const [setBattleConnected] = useHullPlatingSetBattleConnectedMutation({
    refetchQueries: [{query: HullPlatingsDocument, variables: {simulatorId}}],
  });
  const hullPlating =
    data?.hullPlatings?.find(sys => sys?.id === id) || data?.hullPlatings?.[0];
  return (
    <GenericSystemConfig {...props}>
      {hullPlating && (
        <FormGroup>
          <Label>
            <input
              type="checkbox"
              checked={hullPlating.autoEffectiveness !== false}
              onChange={e =>
                setAuto({
                  variables: {
                    id: hullPlating.id as string,
                    auto: e.target.checked,
                  },
                })
              }
            />{" "}
            Armor becomes effective automatically
          </Label>
          <div>
            <small>
              When checked, the armor becomes fully effective a short time after
              the crew engages or reconfigures it. Uncheck to have the Flight
              Director control effectiveness with the Pulse buttons on the core,
              as in earlier versions.
            </small>
          </div>
          <Label style={{marginTop: "1rem"}}>
            <input
              type="checkbox"
              checked={hullPlating.battleConnected !== false}
              onChange={e =>
                setBattleConnected({
                  variables: {
                    id: hullPlating.id as string,
                    connected: e.target.checked,
                  },
                })
              }
            />{" "}
            Battle core hits land on the armor
          </Label>
          <div>
            <small>
              When checked, a projectile fired from the battle core that reaches
              the ship also shows as a hit on the armor, from the direction it
              came in on the sensor grid. The Flight Director can switch this on
              the core during a flight.
            </small>
          </div>
        </FormGroup>
      )}
    </GenericSystemConfig>
  );
};
export default HullPlating;
