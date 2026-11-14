import AdvancedNavigationAndAstrometrics from "../../classes/advancedNavigationAndAstrometrics";
import {EngineStatus} from "../../classes/flightSets";

const route = {
  targetLocationId: "t",
  secondaryRouteOptions: [],
  isBorder: false,
  startOption: {id: "s", name: "Start", riskModifier: 0, secondsForStartup: 10},
  speedOption: {id: "v", name: "Cruise", speedModifier: 1, riskModifier: 0, requiresMaxEngines: false},
  exitOption: {id: "e", name: "Stop", riskModifier: 0},
};

const makeSystem = params =>
  new AdvancedNavigationAndAstrometrics({simulatorId: "sim", ...params});

describe("advanced navigation flight path approval", () => {
  test("engages immediately when approval isn't required (auto-approve)", () => {
    const system = makeSystem();
    system.handleEngageFlightPath(route);
    expect(system.pendingFlightPath).toBeUndefined();
    expect(system.currentFlightPath).toEqual(route);
    expect(system.engineStatus).toBe(EngineStatus.STARTUP);
  });

  test("holds the route until the FD approves it", () => {
    const system = makeSystem({requireApproval: true});
    system.handleEngageFlightPath(route);
    expect(system.pendingFlightPath).toEqual(route);
    expect(system.currentFlightPath).toBeUndefined();
    expect(system.engineStatus).toBe(EngineStatus.STOPPED);

    system.handleApprovePath();
    expect(system.pendingFlightPath).toBeUndefined();
    expect(system.currentFlightPath).toEqual(route);
    expect(system.engineStatus).toBe(EngineStatus.STARTUP);
  });

  test("deny drops the request and leaves an existing flight alone", () => {
    const previous = {...route, targetLocationId: "old"};
    const system = makeSystem({requireApproval: true, currentFlightPath: previous});
    system.handleEngageFlightPath(route);
    system.handleDenyPath();
    expect(system.pendingFlightPath).toBeUndefined();
    expect(system.currentFlightPath).toEqual(previous);
    expect(system.engineStatus).toBe(EngineStatus.STOPPED);
  });

  test("approve with nothing pending does nothing", () => {
    const system = makeSystem({requireApproval: true});
    system.handleApprovePath();
    expect(system.engineStatus).toBe(EngineStatus.STOPPED);
  });

  test("turning approval off auto-approves a waiting request", () => {
    const system = makeSystem({requireApproval: true});
    system.handleEngageFlightPath(route);
    system.handleSetRequireApproval(false);
    expect(system.engineStatus).toBe(EngineStatus.STARTUP);
    expect(system.pendingFlightPath).toBeUndefined();
  });

  test("extra startup delay is never negative", () => {
    const system = makeSystem();
    system.handleSetExtraStartupDelay(-5);
    expect(system.extraStartupDelay).toBe(0);
    system.handleSetExtraStartupDelay(30);
    expect(system.extraStartupDelay).toBe(30);
  });
});
