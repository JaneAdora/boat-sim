# Mobile Touch Controls Design

## Layout

Two controls anchored to the bottom of the screen, visible only on touch devices.

- **Tiller (bottom-left):** Horizontal slider, ~200px wide. Outputs -1 to 1 mapped to rudderAngle. Springs back to center on release.
- **Throttle (bottom-right):** Vertical slider, ~180px tall. Outputs -1 to 1 (top = forward, bottom = reverse). Stays where released.

Controls sit ~20px from screen edges to avoid OS gesture conflicts. Position: fixed HTML overlay, not WebGL.

**Camera:** Two-finger drag on canvas orbits. Pinch-to-zoom controls distance. Same exponential smoothing as keyboard camera.

## Visual Style

Minimal translucent — semi-transparent white controls with thin outlines. Subtle, not attention-grabbing. Knobs highlight slightly (opacity 0.8 to 1.0) when active.

## Architecture

Single new file: `src/ui/TouchControls.ts`. Standalone class (not ECS system), like HUD.ts.

- Constructor takes InputManager reference
- Creates HTML elements (two slider tracks + knobs)
- Listens for touchstart/touchmove/touchend on each control
- Tracks active touches by touch.identifier for simultaneous multi-control use
- Exposes: rudder, throttle, cameraOrbitDelta, cameraZoomDelta

### Integration

- **BoatControlSystem:** Optional TouchControls reference. Touch values take priority over keyboard when non-zero.
- **CameraSystem:** Optional TouchControls reference. Reads cameraOrbitDelta and cameraZoomDelta each frame.
- **No changes to BoatControl component** — touch feeds into existing fields.

### Wiring (Engine.ts)

Detect touch with `'ontouchstart' in window`. If true, create TouchControls, pass to BoatControlSystem and CameraSystem.

## Touch Gesture Details

### Tiller knob
- touchstart: record finger identifier, highlight knob
- touchmove: clamp horizontal position within track, compute -1 to 1
- touchend: animate back to center over ~200ms (CSS transition), set rudder to 0
- Dead zone: values within +/-0.05 snap to 0

### Throttle knob
- Same touch tracking, vertical axis
- touchend: stays where released (no spring-back)
- Center notch: if released within +/-0.08 of zero, snaps to exactly 0

### Two-finger camera (canvas)
- Track two touch.identifiers on canvas element
- Orbit: horizontal midpoint delta between frames, scaled by 0.005
- Zoom: distance change between fingers, scaled by 0.05
- Deltas reset to 0 each frame after CameraSystem consumes them
- Ignores touches that started on a control element (check event.target)

### Conflict prevention
Each touch owned by the element where touchstart fired. A finger on the tiller can't accidentally orbit the camera if it drifts off the control.
