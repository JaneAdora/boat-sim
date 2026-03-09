export interface WindReceiver {
  sailArea: number;       // m^2 of sail when fully deployed
  dragCoefficient: number;
  liftCoefficient: number;
}

export function createWindReceiver(sailArea: number): WindReceiver {
  return {
    sailArea,
    dragCoefficient: 0.03,
    liftCoefficient: 1.2,
  };
}
