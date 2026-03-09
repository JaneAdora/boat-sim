uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform float uFoamThreshold;
uniform vec3 uCameraPosition;

varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;

// Simple noise for surface detail
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(uCameraPosition - vWorldPos);

  // Fresnel - more reflection at glancing angles
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);
  fresnel = mix(0.02, 0.85, fresnel);

  // Surface detail noise (simulates fine ripples)
  float detail = noise(vWorldPos.xz * 0.3 + uTime * 0.15) * 0.03;
  normal.xz += detail;
  normal = normalize(normal);

  // Base water color — blend deep and shallow with more richness
  vec3 waterColor = mix(uDeepColor, uShallowColor, fresnel * 0.4 + 0.1);

  // Add slight teal variation based on position
  float colorVar = noise(vWorldPos.xz * 0.01 + uTime * 0.02);
  waterColor += vec3(-0.01, 0.02, 0.03) * colorVar;

  // Sun specular — double highlight (sharp + broad)
  vec3 halfDir = normalize(uSunDirection + viewDir);
  float specSharp = pow(max(dot(normal, halfDir), 0.0), 512.0);
  float specBroad = pow(max(dot(normal, halfDir), 0.0), 32.0) * 0.25;
  float specular = specSharp + specBroad;

  // Sun sparkle (high frequency glints)
  float sparkleNoise = noise(vWorldPos.xz * 2.0 + uTime * 0.5);
  float sparkle = pow(max(dot(normal, halfDir), 0.0), 128.0) * sparkleNoise * 0.5;
  specular += sparkle;

  // Subsurface scattering — light passing through wave crests
  float sss = pow(max(dot(viewDir, -uSunDirection), 0.0), 4.0);
  sss *= max(normal.y, 0.0);
  float waveHeight = vWorldPos.y;
  sss *= smoothstep(0.0, 0.5, waveHeight + 0.3); // stronger at wave peaks
  vec3 sssColor = vec3(0.05, 0.55, 0.35) * sss * 0.4;

  // Foam from wave crests
  float foam = smoothstep(uFoamThreshold, uFoamThreshold + 0.15, 1.0 - normal.y);
  // Add noise breakup to foam edge
  foam *= smoothstep(0.3, 0.6, noise(vWorldPos.xz * 1.5 + uTime * 0.1));
  vec3 foamContrib = uFoamColor * foam * 0.5;

  // Sky reflection with more color variation
  vec3 reflectDir = reflect(-viewDir, normal);
  float skyGradient = smoothstep(-0.2, 0.5, reflectDir.y);
  vec3 skyColor = mix(
    vec3(0.25, 0.35, 0.5),     // horizon
    vec3(0.35, 0.55, 0.85),    // zenith
    skyGradient
  );
  // Warm sky near sun
  float sunProximity = max(dot(reflectDir, uSunDirection), 0.0);
  skyColor = mix(skyColor, uSunColor * 0.6, pow(sunProximity, 8.0));

  // Combine
  vec3 color = waterColor;
  color = mix(color, skyColor, fresnel);
  color += sssColor;
  color += uSunColor * specular * 0.9;
  color += foamContrib;

  // Distance fog — atmospheric, kicks in gently at distance
  float dist = length(vWorldPos - uCameraPosition);
  float fogFactor = 1.0 - exp(-dist * dist * 0.00000004);
  vec3 fogColor = mix(
    vec3(0.4, 0.5, 0.6),
    vec3(0.7, 0.6, 0.5),
    pow(max(uSunDirection.y, 0.0), 0.5)
  );
  color = mix(color, fogColor, fogFactor * 0.7);

  // Tone mapping (ACES-like)
  color = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);

  gl_FragColor = vec4(color, 1.0);
}
