export interface BoatControl {
  rudderAngle: number;    // -1 to 1 (left to right)
  sailTrim: number;       // 0 to 1 (furled to fully deployed)
  throttle: number;       // -1 to 1 (reverse to full ahead)
  enginePower: number;    // max thrust in Newtons (0 for pure sailboats)
  rudderSpeed: number;    // how fast the rudder moves per second
  sailTrimSpeed: number;  // how fast sail trim changes per second
}

export function createBoatControl(enginePower: number = 0): BoatControl {
  return {
    rudderAngle: 0,
    sailTrim: enginePower > 0 ? 0 : 0.5,
    throttle: 0,
    enginePower,
    rudderSpeed: 1.5,
    sailTrimSpeed: 0.4,
  };
}
