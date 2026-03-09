uniform float uTime;
uniform vec2 uWaveDirections[8];
uniform float uWaveAmplitudes[8];
uniform float uWaveFrequencies[8];
uniform float uWaveSteepness[8];
uniform float uWaveSpeeds[8];
uniform int uWaveCount;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;

// Gerstner wave displacement for a single wave
vec3 gerstnerWave(vec2 pos, vec2 dir, float amplitude, float frequency, float steepness, float speed, float time, inout vec3 tangent, inout vec3 binormal) {
  float phase = dot(dir, pos) * frequency + time * speed;
  float c = cos(phase);
  float s = sin(phase);
  float q = steepness / (frequency * amplitude * float(uWaveCount));

  vec3 displacement;
  displacement.x = q * amplitude * dir.x * c;
  displacement.z = q * amplitude * dir.y * c;
  displacement.y = amplitude * s;

  // Accumulate tangent and binormal for normal calculation
  tangent += vec3(
    -q * dir.x * dir.x * frequency * amplitude * s,
    dir.x * frequency * amplitude * c,
    -q * dir.x * dir.y * frequency * amplitude * s
  );

  binormal += vec3(
    -q * dir.x * dir.y * frequency * amplitude * s,
    dir.y * frequency * amplitude * c,
    -q * dir.y * dir.y * frequency * amplitude * s
  );

  return displacement;
}

void main() {
  vUv = uv;
  vec3 pos = position;
  vec2 worldXZ = (modelMatrix * vec4(pos, 1.0)).xz;

  vec3 totalDisplacement = vec3(0.0);
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);

  for (int i = 0; i < 8; i++) {
    if (i >= uWaveCount) break;
    totalDisplacement += gerstnerWave(
      worldXZ,
      uWaveDirections[i],
      uWaveAmplitudes[i],
      uWaveFrequencies[i],
      uWaveSteepness[i],
      uWaveSpeeds[i],
      uTime,
      tangent,
      binormal
    );
  }

  pos += totalDisplacement;
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

  // Compute normal from tangent and binormal
  vNormal = normalize(cross(binormal, tangent));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
