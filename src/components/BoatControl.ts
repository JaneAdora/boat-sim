export interface BoatControl {
  rudderAngle: number;    // -1 to 1 (left to right)
  sailTrim: number;       // 0 to 1 (furled to fully deployed)
  throttle: number;       // 0 to 1 (for motorboats)
  rudderSpeed: number;    // how fast the rudder moves per second
  sailTrimSpeed: number;  // how fast sail trim changes per second
}

export function createBoatControl(): BoatControl {
  return {
    rudderAngle: 0,
    sailTrim: 0.5,
    throttle: 0,
    rudderSpeed: 1.5,
    sailTrimSpeed: 0.4,
  };
}
