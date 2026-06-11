export interface BoatControl {
  rudderAngle: number;    // -1 to 1 (left to right)
  sailTrim: number;       // 0 to 1 (furled to fully deployed)
  throttle: number;       // -1 to 1 (reverse to full ahead)
  enginePower: number;    // max thrust in Newtons (0 for pure sailboats)
  rudderSpeed: number;    // how fast the rudder moves per second
  sailTrimSpeed: number;  // how fast sail trim changes per second
  turnRadius: number;     // meters — circle carved at full rudder
  propWash: number;       // rad/s yaw authority from throttle at standstill
}

export function createBoatControl(
  enginePower: number = 0,
  rudderSpeed: number = 1.5,
  turnRadius: number = 40,
  propWash: number = 0.15,
): BoatControl {
  return {
    rudderAngle: 0,
    sailTrim: enginePower > 0 ? 0 : 0.5,
    throttle: 0,
    enginePower,
    rudderSpeed,
    sailTrimSpeed: 0.4,
    turnRadius,
    propWash,
  };
}
