import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const hatchVert = /* glsl */`
varying vec3 vN; varying vec3 vW; varying float vDepth;
void main(){
  vec4 w = modelMatrix * vec4(position,1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

/* "Scratchboard" hatching: on black, the brighter a surface, the more accent strokes.
   Layer 1 diagonal, layer 2 cross-hatch, layer 3 dense horizontal in the brightest areas. */
const hatchFrag = /* glsl */`
uniform vec3 uColor; uniform vec3 uLight[NUM_LIGHTS]; uniform float uTime;
uniform float uDensity; uniform float uStrength; uniform float uFogNear; uniform float uFogFar;
varying vec3 vN; varying vec3 vW; varying float vDepth;
float hline(float x, float w){
  float d = fwidth(x);
  float f = abs(fract(x) - 0.5);
  float l = smoothstep(0.5 - w - d, 0.5 - w + d, f);
  return l * (1.0 - smoothstep(0.3, 0.7, d));
}
void main(){
  vec3 N = normalize(vN);
  if(!gl_FrontFacing) N = -N;
  float light = 0.05;
  for(int i=0;i<NUM_LIGHTS;i++){
    vec3 L = uLight[i] - vW; float dist = length(L); L /= dist;
    light += max(dot(N,L),0.0) * (1.5/(1.0 + 0.012*dist*dist));
  }
  light = clamp(light, 0.0, 1.0);
  vec3 an = abs(N); vec2 uv;
  if(an.y > an.x && an.y > an.z) uv = vW.xz; else if(an.x > an.z) uv = vW.zy; else uv = vW.xy;
  uv *= uDensity;
  float h1 = hline(uv.x + uv.y, 0.07) * smoothstep(0.10, 0.20, light);
  float h2 = hline(uv.x - uv.y, 0.07) * smoothstep(0.40, 0.50, light);
  float h3 = hline(uv.y * 2.0, 0.09) * smoothstep(0.68, 0.78, light);
  float ink = max(h1, max(h2, h3));
  float scanY = mod(uTime * 1.1, 16.0) - 3.0;
  float scan = exp(-pow((vW.y - scanY) * 2.2, 2.0));
  vec3 col = uColor * (ink * (0.22 + 0.5*light) * uStrength + 0.012 + scan * 0.09 * uStrength);
  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  gl_FragColor = vec4(col * (1.0 - fog), 1.0);
}`;

/** Builds every shared material for a scene from its theme and lights. */
export function createMaterials(scene) {
  const { theme, room } = scene;
  const accent = new THREE.Color(theme.accent);
  const shared = {
    uColor: { value: accent },
    uLight: { value: room.lights.map(l => new THREE.Vector3(...l)) },
    uTime: { value: 0 },
    uFogNear: { value: theme.fog[0] },
    uFogFar: { value: theme.fog[1] },
  };
  const hatch = (density, strength, side = THREE.FrontSide) => new THREE.ShaderMaterial({
    defines: { NUM_LIGHTS: room.lights.length },
    uniforms: { ...shared, uDensity: { value: density }, uStrength: { value: strength } },
    vertexShader: hatchVert,
    fragmentShader: hatchFrag,
    side,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  // Fat lines keep a constant pixel width (resolution is set by LineSegments2 itself).
  const fat = (color, linewidth, opacity) => {
    const m = new LineMaterial({ color, linewidth, transparent: opacity < 1, opacity, worldUnits: false });
    m.fog = true;
    return m;
  };
  const basic = opacity => new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity });

  const fills = {
    main: hatch(theme.hatch.density, 1),
    fine: hatch(theme.hatch.fineDensity, 1),
    room: hatch(theme.hatch.roomDensity, theme.hatch.roomStrength, THREE.BackSide),
    hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  };
  const lines = {
    thick: fat(accent, 2.4, 1),
    mid: fat(accent.clone().multiplyScalar(0.9), 1.6, 0.85),
    glow: fat(new THREE.Color(theme.highlight), 3, 1),
    thin: basic(0.55),
    faint: basic(0.16),
  };
  return {
    shared, fills, lines,
    dispose() { [...Object.values(fills), ...Object.values(lines)].forEach(m => m.dispose()); },
  };
}
