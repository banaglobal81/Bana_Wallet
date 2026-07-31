'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

/* ---------------------------------------------------------------------------
   Nebula page background — a full-viewport WebGL field behind the whole app.

   SAFETY MODEL (this is the important part)

   An earlier version made the page wrappers fully transparent so this canvas
   could show through. When that misbehaved the entire signed-in UI vanished.
   The rule now is: nothing is ever fully transparent.

     <html>        solid base colour            (globals.css)
     .bana-bg      this canvas, z-index -1
     .bana-page    TRANSLUCENT tint, never 0 alpha
     cards/text    fully opaque surfaces

   So if the canvas fails to mount, fails to compile, loses its context, or is
   disabled, the page is a translucent tint over a solid colour — i.e. it looks
   like the plain app. There is no state in which content is left with nothing
   behind it.

   Palette is silver/platinum on dark and platinum-on-paper in light, matched
   to the brushed-silver buttons and the chrome wordmark.
   --------------------------------------------------------------------------- */

const PALETTES = {
  dark: {
    space: [0.023, 0.075, 0.164], // #06132A — page base
    hi: [0.945, 0.953, 0.965], // #F1F3F6 — silver button top stop
    lo: [0.678, 0.706, 0.753], // #ADB4C0 — silver button bottom stop
    hiMix: 0.14,
    loMix: 0.15,
    vig: [0.8, 0.55], // strength, floor
  },
  /* Light is NOT a tinted copy of dark. On a dark base you build structure by
     adding light (#06132A -> silver is a huge luminance jump). A light base has
     almost no headroom upward — #F4F7FB is already ~90% luminance — so pushing
     toward white just produces haze. Light therefore carves DOWNWARD: the base
     is the highlight and the noise cuts cooler, darker veins into it.
     The darkest vein lands around #C6D2E5, which still leaves dark body text
     (#15233F) at roughly 9:1 — well clear of AA. */
  light: {
    space: [0.957, 0.969, 0.984], // #F4F7FB — brighter base, room to carve down
    hi: [1.0, 1.0, 1.0], // white blooms, used sparingly
    lo: [0.561, 0.639, 0.761], // #8FA3C2 — cool steel veining, the real structure
    hiMix: 0.45,
    loMix: 0.55,
    vig: [0.34, 0.86], // gentle: a heavy vignette reads as dirt on a light page
  },
} as const;

const VERT = `attribute vec2 a_position;
varying vec2 v_uv;
void main(){ v_uv = a_position*0.5+0.5; gl_Position = vec4(a_position,0.0,1.0); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_time;
uniform vec2  u_resolution;
uniform vec3  u_space;
uniform vec3  u_hi;
uniform vec3  u_lo;
uniform vec2  u_mix;
uniform vec2  u_vig;
varying vec2  v_uv;

vec3 permute(vec3 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0,i1.y,1.0)) + i.x + vec3(0.0,i1.x,1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0*fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 a0 = x - floor(x + 0.5);
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x*x0.x + h.x*x0.y;
  g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.0 * dot(m, g);
}

/* 3 octaves — enough structure to read as marbled stone, cheap enough to run
   at a 30fps cap and roughly half resolution. */
float fbm(vec2 p){
  float f = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++){ f += a*snoise(p); p = p*2.03 + 11.7; a *= 0.5; }
  return f;
}

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

void main(){
  vec2 uv = v_uv;
  float ar = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(ar, 1.0) * 2.2;
  float t = u_time * 0.028;

  /* Domain warp: noise fed through noise. This is what gives the flow real
     structure instead of a texture sliding sideways. */
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(3.4, -t * 0.8)));
  float n = fbm(p + 1.7 * q + vec2(-t * 0.5, t * 0.35));
  n = n * 0.5 + 0.5;

  vec3 col = u_space;
  col = mix(col, u_hi, smoothstep(0.42, 0.92, n) * u_mix.x);
  col = mix(col, u_lo, smoothstep(0.58, 1.00, n) * u_mix.y);

  float vig = 1.0 - length((uv - 0.5) * vec2(ar, 1.0)) * u_vig.x;
  col *= clamp(vig, u_vig.y, 1.0);
  /* 1.5 LSB dither — near-neutral gradients band far worse than coloured ones. */
  col += (hash(gl_FragCoord.xy + fract(u_time) * 137.0) - 0.5) * 1.5 / 255.0;

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[bana-bg] compile failed:\n' + gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/** Coarse pointer or narrow viewport means a phone — skip it, save the battery. */
function isCoarse(): boolean {
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true;
  } catch {
    /* older browsers */
  }
  return window.innerWidth < 768;
}

export default function BanaBackground() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();
  // next-themes resolves synchronously on the client but not on the server, so
  // gating on it alone causes a hydration mismatch. Gate on mount instead.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const theme: keyof typeof PALETTES = resolvedTheme === 'light' ? 'light' : 'dark';

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !mounted) return;

    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    /* Phones render the nebula but never animate it: one frame is drawn and the
       loop never starts. Identical look to desktop, zero ongoing GPU/battery
       cost — better than leaving mobile on a flat colour while desktop is not. */
    const still = isCoarse();

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(canvas);

    const gl = (canvas.getContext('webgl', {
      antialias: false,
      depth: false,
      alpha: false,
      powerPreference: 'low-power',
    }) || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      canvas.remove();
      return;
    }

    const pal = PALETTES[theme];
    const scale = still ? 0.34 : (navigator.hardwareConcurrency || 4) >= 8 ? 0.55 : 0.42;
    const fpsCap = 30;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = vs && fs ? gl.createProgram() : null;
    if (!vs || !fs || !prog) {
      canvas.remove();
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[bana-bg] link failed:\n' + gl.getProgramInfoLog(prog));
      canvas.remove();
      return;
    }
    gl.useProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uRes = gl.getUniformLocation(prog, 'u_resolution');
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_space'), pal.space as unknown as number[]);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_hi'), pal.hi as unknown as number[]);
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_lo'), pal.lo as unknown as number[]);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_mix'), pal.hiMix, pal.loMix);
    gl.uniform2f(gl.getUniformLocation(prog, 'u_vig'), pal.vig[0], pal.vig[1]);

    function resize() {
      if (!gl || !host) return;
      const w = Math.max(1, Math.round((host.clientWidth || window.innerWidth) * scale));
      const h = Math.max(1, Math.round((host.clientHeight || window.innerHeight) * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }
    function draw(seconds: number) {
      if (!gl) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, seconds);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    let raf = 0;
    let last = 0;
    let acc = 0;
    let running = false;
    let visible = !document.hidden;
    let reduce = reduceMq.matches;

    function tick(now: number) {
      raf = requestAnimationFrame(tick);
      acc += now - last;
      last = now;
      const budget = 1000 / fpsCap;
      if (acc < budget) return;
      acc = acc % budget;
      resize();
      draw(now * 0.001);
    }
    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    /* Reduced motion still gets the nebula — it is simply frozen, not removed,
       so the look is identical and only the movement stops. */
    function sync() {
      if (visible && !reduce && !still) start();
      else {
        stop();
        resize();
        draw(performance.now() * 0.001);
      }
    }

    const onReduce = () => {
      reduce = reduceMq.matches;
      sync();
    };
    const onVis = () => {
      visible = !document.hidden;
      sync();
    };
    const onResize = () => {
      resize();
      if (!running) draw(performance.now() * 0.001);
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      stop();
    };

    if (reduceMq.addEventListener) reduceMq.addEventListener('change', onReduce);
    else reduceMq.addListener(onReduce);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', onResize);
    canvas.addEventListener('webglcontextlost', onLost, false);

    resize();
    sync();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      if (reduceMq.removeEventListener) reduceMq.removeEventListener('change', onReduce);
      else reduceMq.removeListener(onReduce);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
  }, [mounted, theme]);

  if (!mounted) return null;
  return <div ref={hostRef} className="bana-bg" aria-hidden="true" />;
}
