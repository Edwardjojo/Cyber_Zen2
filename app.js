/* ==========================================================
   Cyber Zen · 赛博禅  —  Application Core
   ========================================================== */

(function () {
  'use strict';

  /* =======================================================
     §1  GLSL Shader Sources
     ======================================================= */

  const VERT_SRC = `
    attribute vec2 aPos;
    void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  // ---------- Heartfelt rain (adapted from Martijn Steinrucken / BigWings) ----------
  // Original: https://www.shadertoy.com/view/ltffzl
  // License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported
  const RAIN_FRAG = `
    precision highp float;
    uniform vec2  uRes;
    uniform float uTime;
    uniform float uIntensity;   // 0-1

    // Manual smoothstep that handles edge0 > edge1 and prevents NaN from 0/0
    float S(float a, float b, float t) {
      float d = b - a;
      float safe = abs(d) < 1e-7 ? 1e-7 : d;
      float x = clamp((t - a) / safe, 0.0, 1.0);
      return x * x * (3.0 - 2.0 * x);
    }

    vec3 N13(float p) {
      vec3 p3 = fract(vec3(p) * vec3(.1031,.11369,.13787));
      p3 += dot(p3, p3.yzx + 19.19);
      return fract(vec3((p3.x + p3.y)*p3.z, (p3.x+p3.z)*p3.y, (p3.y+p3.z)*p3.x));
    }

    float N(float t) {
      return fract(sin(t*12345.564)*7658.76);
    }

    float Saw(float b, float t) {
      return S(0., b, t)*S(1., b, t);
    }

    vec2 DropLayer2(vec2 uv, float t) {
      vec2 UV = uv;
      uv.y += t*0.75;
      vec2 a = vec2(6., 1.);
      vec2 grid = a*2.;
      vec2 id = floor(uv*grid);

      float colShift = N(id.x);
      uv.y += colShift;

      id = floor(uv*grid);
      vec3 n = N13(id.x*35.2+id.y*2376.1);
      vec2 st = fract(uv*grid)-vec2(.5, 0);

      float x = n.x-.5;

      float y = UV.y*20.;
      float wiggle = sin(y+sin(y));
      x += wiggle*(.5-abs(x))*(n.z-.5);
      x *= .7;
      float ti = fract(t+n.z);
      y = (Saw(.85, ti)-.5)*.9+.5;
      vec2 p = vec2(x, y);

      float d = length((st-p)*a.yx);

      float mainDrop = S(.4, .0, d);

      float r = sqrt(S(1., y, st.y));
      float cd = abs(st.x-x);
      float trail = S(.23*r, .15*r*r, cd);
      float trailFront = S(-.02, .02, st.y-y);
      trail *= trailFront*r*r;

      y = UV.y;
      float trail2 = S(.2*r, .0, cd);
      float droplets = max(0., (sin(y*(1.-y)*120.)-st.y))*trail2*trailFront*n.z;
      y = fract(y*10.)+(st.y-.5);
      float dd = length(st-vec2(x, y));
      droplets = S(.3, 0., dd);
      float m = mainDrop+droplets*r*trailFront;

      return vec2(m, trail);
    }

    float StaticDrops(vec2 uv, float t) {
      uv *= 40.;
      vec2 id = floor(uv);
      uv = fract(uv)-.5;
      vec3 n = N13(id.x*107.45+id.y*3543.654);
      vec2 p = (n.xy-.5)*.7;
      float d = length(uv-p);

      float fade = Saw(.025, fract(t+n.z));
      float c = S(.3, 0., d)*fract(n.z*10.)*fade;
      return c;
    }

    vec2 Drops(vec2 uv, float t, float l0, float l1, float l2) {
      float s = StaticDrops(uv, t)*l0;
      vec2 m1 = DropLayer2(uv, t)*l1;
      vec2 m2 = DropLayer2(uv*1.85, t)*l2;

      float c = s+m1.x+m2.x;
      c = S(.3, 1., c);

      return vec2(c, max(m1.y*l0, m2.y*l1));
    }

    /* ---- Procedural bokeh background (replaces iChannel0 texture) ---- */
    float hash2(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec3 background(vec2 uv, float blur) {
      // luminous base — foggy glass with city light bleeding through
      vec3 col = mix(vec3(0.15,0.12,0.22), vec3(0.22,0.20,0.35), uv.y);

      // broad city glow from below — warm and strong
      float glow = smoothstep(0.8, 0.0, uv.y);
      col += glow * vec3(0.25, 0.18, 0.12) * 0.6;

      // secondary cool glow from above (sky reflection)
      float skyGlow = smoothstep(0.3, 1.0, uv.y);
      col += skyGlow * vec3(0.08, 0.1, 0.18) * 0.4;

      // fog / glass diffusion — blur increases overall brightness
      col += vec3(0.04, 0.035, 0.06) * blur * 0.3;

      // bokeh city lights — 50 blobs, large and luminous
      float spread = 1.0 + blur * 0.25;
      for(int i = 0; i < 50; i++){
        float fi = float(i);
        vec2 bp = vec2(
          hash2(vec2(fi*1.17, 0.31))*2.0-1.0,
          hash2(vec2(0.73, fi*0.93))*2.0-1.0
        ) * vec2(1.4, 1.0);
        bp.y -= 0.1;
        float baseSize = 0.03 + hash2(vec2(fi, fi*0.41))*0.10;
        float sz = baseSize * spread;
        float br = 0.5 + hash2(vec2(fi*0.51, fi*1.23))*0.5;
        float d = length((uv - vec2(0.5,0.5)) * 2.0 - bp);
        // soft outer glow + bright core
        float bokeh = S(sz*1.5, sz*0.3, d) * br * 0.5
                    + S(sz*0.6, sz*0.02, d) * br * 0.5;

        vec3 tint = vec3(0.4,0.6,1.0);
        float ht = hash2(vec2(fi*2.01, 0.07));
        if(ht > 0.75) tint = vec3(1.0,0.4,0.75);
        else if(ht > 0.5) tint = vec3(0.35,0.9,0.65);
        else if(ht > 0.25) tint = vec3(1.0,0.75,0.35);
        col += bokeh * tint * 0.5;
      }
      return col;
    }

    void main(){
      vec2 uv = (gl_FragCoord.xy-.5*uRes.xy) / uRes.y;
      vec2 UV = gl_FragCoord.xy/uRes.xy;
      float T = uTime;
      float t = T*.2;

      float rainAmount = uIntensity;

      float maxBlur = mix(3., 6., rainAmount);
      float minBlur = 2.;

      float staticDrops = S(-.5, 1., rainAmount)*2.;
      float layer1 = S(.25, .75, rainAmount);
      float layer2 = S(.0, .5, rainAmount);

      vec2 c = Drops(uv, t, staticDrops, layer1, layer2);

      // expensive normals
      vec2 e = vec2(.001, 0.);
      float cx = Drops(uv+e, t, staticDrops, layer1, layer2).x;
      float cy = Drops(uv+e.yx, t, staticDrops, layer1, layer2).x;
      vec2 n = vec2(cx-c.x, cy-c.x);

      float focus = mix(maxBlur-c.y, minBlur, S(.1, .2, c.x));
      vec3 col = background(UV+n, focus);

      // very gentle vignette only at edges
      vec2 uvV = UV - .5;
      col *= 1.0 - dot(uvV, uvV) * 0.3;

      gl_FragColor = vec4(col, 1.);
    }
  `;

  // ---------- "Just snow" (adapted from Andrew Baldwin / baldand) ----------
  // Original: https://www.shadertoy.com/view/ldsGDn
  // License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0
  const SNOW_FRAG = `
    precision highp float;
    uniform vec2  uRes;
    uniform float uTime;
    uniform float uIntensity;

    void main(){
      // intensity controls layer count and speed
      // light snow: LAYERS 50, DEPTH .5, WIDTH .3, SPEED .6
      // blizzard:   LAYERS 200, DEPTH .1, WIDTH .8, SPEED 1.5
      float DEPTH = mix(0.5, 0.1, uIntensity);
      float WIDTH = mix(0.3, 0.8, uIntensity);
      float SPEED = mix(0.6, 1.5, uIntensity);
      int   LAYERS = int(mix(50.0, 200.0, uIntensity));

      const mat3 p = mat3(
        13.323122, 23.5112,  21.71123,
        21.1212,   28.7312,  11.9312,
        21.8112,   14.7212,  61.3934
      );

      vec2 uv = vec2(1.0, uRes.y/uRes.x) * gl_FragCoord.xy / uRes.xy;
      vec3 acc = vec3(0.0);
      float dof = 5.0 * sin(uTime * 0.1);

      for (int i = 0; i < 200; i++) {
        if (i >= LAYERS) break;
        float fi = float(i);
        vec2 q = uv * (1.0 + fi * DEPTH);
        q += vec2(
          q.y * (WIDTH * mod(fi * 7.238917, 1.0) - WIDTH * 0.5),
          SPEED * uTime / (1.0 + fi * DEPTH * 0.03)
        );
        vec3 n = vec3(floor(q), 31.189 + fi);
        vec3 m = floor(n) * 0.00001 + fract(n);
        vec3 mp = (31415.9 + m) / fract(p * m);
        vec3 r = fract(mp);
        vec2 s = abs(mod(q, 1.0) - 0.5 + 0.9 * r.xy - 0.45);
        s += 0.01 * abs(2.0 * fract(10.0 * q.yx) - 1.0);
        float d = 0.6 * max(s.x - s.y, s.x + s.y) + max(s.x, s.y) - 0.01;
        float edge = 0.005 + 0.05 * min(0.5 * abs(fi - 5.0 - dof), 1.0);
        acc += vec3(smoothstep(edge, -edge, d) * (r.x / (1.0 + 0.02 * fi * DEPTH)));
      }

      gl_FragColor = vec4(acc, 1.0);
    }
  `;

  /* =======================================================
     §2  WebGL Canvas Renderer
     ======================================================= */

  const Canvas = {
    gl: null,
    programs: {},    // { rain, snow }
    current: 'rain',
    quad: null,
    startTime: performance.now() / 1000,
    intensity: 0.5,
    animId: null,

    init() {
      const c = document.getElementById('bg-canvas');
      const gl = c.getContext('webgl', { alpha: false, antialias: false });
      if (!gl) { console.error('WebGL not supported'); return; }
      this.gl = gl;
      this._resize();
      window.addEventListener('resize', () => this._resize());

      // fullscreen quad (two triangles)
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      this.quad = buf;

      this.programs.rain = this._buildProgram(VERT_SRC, RAIN_FRAG);
      this.programs.snow = this._buildProgram(VERT_SRC, SNOW_FRAG);

      this._loop();
    },

    setMode(mode) { this.current = mode; },
    setIntensity(v) { this.intensity = v; },

    _resize() {
      const c = this.gl.canvas;
      const dpr = window.devicePixelRatio || 1;
      c.width  = window.innerWidth  * dpr;
      c.height = window.innerHeight * dpr;
      this.gl.viewport(0, 0, c.width, c.height);
    },

    _compileShader(type, src) {
      const gl = this.gl;
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const err = gl.getShaderInfoLog(s);
        console.error('Shader error', err);
        document.title = 'SHADER ERR: ' + err.slice(0, 120);
      }
      return s;
    },

    _buildProgram(vSrc, fSrc) {
      const gl = this.gl;
      const vs = this._compileShader(gl.VERTEX_SHADER, vSrc);
      const fs = this._compileShader(gl.FRAGMENT_SHADER, fSrc);
      const pg = gl.createProgram();
      gl.attachShader(pg, vs); gl.attachShader(pg, fs);
      gl.linkProgram(pg);
      if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) {
        const err = gl.getProgramInfoLog(pg);
        console.error('Link error', err);
        document.title = 'LINK ERR: ' + err.slice(0, 120);
      }
      return {
        pg,
        aPos: gl.getAttribLocation(pg, 'aPos'),
        uRes: gl.getUniformLocation(pg, 'uRes'),
        uTime: gl.getUniformLocation(pg, 'uTime'),
        uIntensity: gl.getUniformLocation(pg, 'uIntensity'),
      };
    },

    _loop() {
      const gl = this.gl;
      const p  = this.programs[this.current];
      gl.useProgram(p.pg);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.enableVertexAttribArray(p.aPos);
      gl.vertexAttribPointer(p.aPos, 2, gl.FLOAT, false, 0, 0);

      const now = performance.now() / 1000 - this.startTime;
      gl.uniform2f(p.uRes, gl.canvas.width, gl.canvas.height);
      gl.uniform1f(p.uTime, now);
      gl.uniform1f(p.uIntensity, this.intensity);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      this.animId = requestAnimationFrame(() => this._loop());
    },
  };

  /* =======================================================
     §3  Audio Engine (Web Audio API)
     ======================================================= */

  const Audio = {
    ctx: null,
    noiseGain: null,
    _masterOut: null,   // master limiter/gain
    _ambientBus: null,  // ambient scene bus → reverb → master
    _reverbWet: null,   // reverb send gain
    _ambientLevel: 0,
    _currentMode: 'rain',
    _currentScene: 0,   // 0 = A track, 1 = B track
    _sceneNodes: [],    // stoppable nodes for current scene
    _schedTimers: [],   // setTimeout handles for current scene

    // ── Bootstrap ──────────────────────────────────────────
    _ensureCtx() {
      if (this.ctx) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.ctx;

      // Master output gain (headroom)
      this._masterOut = ctx.createGain();
      this._masterOut.gain.value = 0.85;
      this._masterOut.connect(ctx.destination);

      // ── White noise bus (always running, very quiet) ──
      const nBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
      const nd = nBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const nSrc = ctx.createBufferSource();
      nSrc.buffer = nBuf; nSrc.loop = true;
      const nHP = ctx.createBiquadFilter();
      nHP.type = 'highpass'; nHP.frequency.value = 400;
      this.noiseGain = ctx.createGain();
      this.noiseGain.gain.value = 0;
      nSrc.connect(nHP).connect(this.noiseGain).connect(this._masterOut);
      nSrc.start();

      // ── Ambient scene bus ──
      this._ambientBus = ctx.createGain();
      this._ambientBus.gain.value = 0;

      // Shared reverb: Schroeder-lite (two comb-like delay lines)
      this._reverbWet = ctx.createGain();
      this._reverbWet.gain.value = 0.38;
      [[2.1, 0.42, 700], [3.3, 0.32, 500]].forEach(([t, fb, co]) => {
        const d = ctx.createDelay(5.0); d.delayTime.value = t;
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = co;
        const g = ctx.createGain(); g.gain.value = fb;
        d.connect(f).connect(g).connect(d);
        this._ambientBus.connect(d);
        g.connect(this._reverbWet);
      });
      this._reverbWet.connect(this._masterOut);

      // Dry path
      const dryLP = ctx.createBiquadFilter();
      dryLP.type = 'lowpass'; dryLP.frequency.value = 8000;
      this._ambientBus.connect(dryLP).connect(this._masterOut);
    },

    // ── Scene lifecycle ────────────────────────────────────
    _stopScene() {
      this._schedTimers.forEach(clearTimeout);
      this._schedTimers = [];
      const t = this.ctx ? this.ctx.currentTime : 0;
      this._sceneNodes.forEach(n => {
        try {
          if (n.gain) {
            n.gain.cancelScheduledValues(t);
            n.gain.setTargetAtTime(0, t, 0.4);    // 400ms fade-out
          } else if (n.stop) {
            n.stop(t + 0.5);
          }
        } catch (_) {}
      });
      this._sceneNodes = [];
    },

    _startScene(mode, scene) {
      this._ensureCtx();
      this._stopScene();
      if (this._ambientLevel < 0.01) return;
      const fn = {
        rain0: '_sceneRainNatural',
        rain1: '_sceneRainWindow',
        snow0: '_sceneStarPiano',
        snow1: '_sceneStarSpace',
      }[`${mode}${scene}`];
      if (fn) this[fn]();
    },

    // helper: register a node for cleanup
    _reg(node)  { this._sceneNodes.push(node); return node; },
    _sched(fn, ms) { this._schedTimers.push(setTimeout(fn, ms)); },

    // helper: pink noise buffer (stereo, 4s)
    _makePink(dur = 4) {
      const ctx = this.ctx;
      const buf = ctx.createBuffer(2, ctx.sampleRate * dur, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0;
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1;
          b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
          b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
          b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
          d[i] = (b0+b1+b2+b3+b4+b5+w*0.5362) * 0.11;
        }
      }
      return buf;
    },

    // ─────────────────────────────────────────────────────
    // RAIN A │ 自然雨声 — 连绵粉红噪声，三频段叠加
    // ─────────────────────────────────────────────────────
    _sceneRainNatural() {
      const ctx = this.ctx;
      const buf = this._makePink(6);
      const vol = this._ambientLevel;

      // Low rumble (thunder distance)
      const src1 = ctx.createBufferSource(); src1.buffer = buf; src1.loop = true;
      const lp1  = ctx.createBiquadFilter(); lp1.type = 'lowpass';  lp1.frequency.value = 180;
      const g1   = ctx.createGain(); g1.gain.value = vol * 0.25;
      src1.connect(lp1).connect(g1).connect(this._ambientBus);
      src1.start(); this._reg(g1); this._reg(src1);

      // Main rain body
      const src2 = ctx.createBufferSource(); src2.buffer = buf; src2.loop = true; src2.loopStart = 0.5;
      const bp2  = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 900; bp2.Q.value = 0.6;
      const g2   = ctx.createGain(); g2.gain.value = vol * 0.7;
      src2.connect(bp2).connect(g2).connect(this._ambientBus);
      src2.start(); this._reg(g2); this._reg(src2);

      // High shimmer
      const src3 = ctx.createBufferSource(); src3.buffer = buf; src3.loop = true; src3.loopStart = 1.2;
      const hp3  = ctx.createBiquadFilter(); hp3.type = 'highpass'; hp3.frequency.value = 3500;
      const g3   = ctx.createGain(); g3.gain.value = vol * 0.18;
      src3.connect(hp3).connect(g3).connect(this._ambientBus);
      src3.start(); this._reg(g3); this._reg(src3);

      // Slow swell LFO (wind variation)
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.04;
      const lg  = ctx.createGain(); lg.gain.value = vol * 0.08;
      lfo.connect(lg).connect(g2.gain);
      lfo.start(); this._reg(lfo);
    },

    // ─────────────────────────────────────────────────────
    // RAIN B │ 窗边细雨 — 随机水滴 + 细沙沙背景
    // ─────────────────────────────────────────────────────
    _sceneRainWindow() {
      const ctx = this.ctx;
      const buf = this._makePink(4);
      const vol = this._ambientLevel;

      // Very quiet sizzle background
      const bgSrc = ctx.createBufferSource(); bgSrc.buffer = buf; bgSrc.loop = true;
      const bgBP  = ctx.createBiquadFilter(); bgBP.type = 'bandpass'; bgBP.frequency.value = 2400; bgBP.Q.value = 1.2;
      const bgG   = ctx.createGain(); bgG.gain.value = vol * 0.2;
      bgSrc.connect(bgBP).connect(bgG).connect(this._ambientBus);
      bgSrc.start(); this._reg(bgG); this._reg(bgSrc);

      // Sparse droplet scheduler
      const drop = () => {
        if (this._ambientLevel < 0.01) return;
        const now = ctx.currentTime;
        // each drop = short noise burst through narrow BP
        const dropBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
        const dd = dropBuf.getChannelData(0);
        for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1;
        const dSrc = ctx.createBufferSource(); dSrc.buffer = dropBuf;
        const dBP  = ctx.createBiquadFilter(); dBP.type = 'bandpass';
        dBP.frequency.value = 800 + Math.random() * 1600; dBP.Q.value = 4;
        const dEnv = ctx.createGain();
        dEnv.gain.setValueAtTime(0, now);
        dEnv.gain.linearRampToValueAtTime(vol * (0.3 + Math.random() * 0.5), now + 0.003);
        dEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.08);
        dSrc.connect(dBP).connect(dEnv).connect(this._ambientBus);
        dSrc.start(now);
        // schedule next drop
        const next = 80 + Math.random() * 300;
        this._sched(drop, next);
      };
      this._sched(drop, 50);
    },

    // ─────────────────────────────────────────────────────
    // STAR A │ 钢琴+合成器 — 五声音阶随机琴音 + 柔光垫音
    // ─────────────────────────────────────────────────────
    _sceneStarPiano() {
      const ctx   = this.ctx;
      const vol   = this._ambientLevel;
      // C pentatonic: C4, D4, E4, G4, A4, C5, D5
      const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33];

      // Pad drone (slow attack, always-on)
      [[130.81, 0.022], [196.00, 0.016], [261.63, 0.012]].forEach(([f, v]) => {
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
        // slow breath LFO
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06 + Math.random() * 0.04;
        const lg  = ctx.createGain(); lg.gain.value = v * 0.25;
        const g   = ctx.createGain(); g.gain.value = vol * v;
        lfo.connect(lg).connect(osc.frequency);
        osc.connect(g).connect(this._ambientBus);
        osc.start(); lfo.start();
        this._reg(g); this._reg(osc); this._reg(lfo);
      });

      // Random piano notes
      const note = () => {
        if (this._ambientLevel < 0.01) return;
        const now = ctx.currentTime;
        const f   = notes[Math.floor(Math.random() * notes.length)];
        // sine + soft triangle blend = piano-ish tone
        [[1.0, 'sine', 0.6], [2.0, 'triangle', 0.2], [3.0, 'sine', 0.08]].forEach(([mult, type, w]) => {
          const o   = ctx.createOscillator(); o.type = type; o.frequency.value = f * mult;
          const env = ctx.createGain();
          const pk  = vol * w * (0.7 + Math.random() * 0.3);
          env.gain.setValueAtTime(0, now);
          env.gain.linearRampToValueAtTime(pk, now + 0.015);
          env.gain.exponentialRampToValueAtTime(0.0001, now + 1.8 + Math.random() * 2.5);
          o.connect(env).connect(this._ambientBus);
          o.start(now); o.stop(now + 4.5);
        });
        const next = 1800 + Math.random() * 4000;
        this._sched(note, next);
      };
      this._sched(note, 600 + Math.random() * 1000);
    },

    // ─────────────────────────────────────────────────────
    // STAR B │ 深空星际 — 水晶音色 + 星光闪烁 + 缥缈底音
    // ─────────────────────────────────────────────────────
    _sceneStarSpace() {
      const ctx = this.ctx;
      const vol = this._ambientLevel;

      // Deep sub drone (55Hz + 82.5Hz) — theta binaural pair
      [[55.00, 0.030], [61.00, 0.018], [82.50, 0.020]].forEach(([f, v]) => {
        const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
        const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.03;
        const lg  = ctx.createGain(); lg.gain.value = f * 0.001;
        const g   = ctx.createGain(); g.gain.value = vol * v;
        lfo.connect(lg).connect(osc.frequency);
        osc.connect(g).connect(this._ambientBus);
        osc.start(); lfo.start();
        this._reg(g); this._reg(osc); this._reg(lfo);
      });

      // Crystal shimmer — narrow high bandpass noise strata
      const buf = this._makePink(3);
      [4200, 6800].forEach((freq, i) => {
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = i * 0.7;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 3;
        const g = ctx.createGain(); g.gain.value = vol * 0.07;
        s.connect(f).connect(g).connect(this._ambientBus);
        s.start(); this._reg(g); this._reg(s);
      });

      // Sparse star-light chimes (FM bell)
      const chime = () => {
        if (this._ambientLevel < 0.01) return;
        const now  = ctx.currentTime;
        const base = [523.25, 659.25, 783.99, 1046.5][Math.floor(Math.random() * 4)];
        const mod  = ctx.createOscillator(); mod.frequency.value = base * 2.756;
        const modG = ctx.createGain(); modG.gain.value = base * 1.8;
        const car  = ctx.createOscillator(); car.frequency.value = base;
        const env  = ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(vol * 0.18, now + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 3.5 + Math.random() * 2);
        mod.connect(modG).connect(car.frequency);
        car.connect(env).connect(this._ambientBus);
        mod.start(now); car.start(now);
        mod.stop(now + 6); car.stop(now + 6);
        const next = 2500 + Math.random() * 6000;
        this._sched(chime, next);
      };
      this._sched(chime, 1000 + Math.random() * 1500);
    },

    // ── Public API ─────────────────────────────────────────
    setMode(mode) {
      this._currentMode = mode;
      // update scene button labels
      const labels = {
        rain: ['自然雨声', '窗边细雨'],
        snow: ['星空钢琴', '深空星际'],
      };
      document.querySelectorAll('.scene-btn').forEach((btn, i) => {
        btn.textContent = labels[mode][i];
      });
      if (this.ctx && this._ambientLevel > 0.01) {
        this._startScene(mode, this._currentScene);
      }
    },

    setScene(scene) {
      this._currentScene = scene;
      document.querySelectorAll('.scene-btn').forEach(b => {
        b.classList.toggle('active', +b.dataset.scene === scene);
      });
      if (this.ctx && this._ambientLevel > 0.01) {
        this._startScene(this._currentMode, scene);
      }
    },

    setNoise(v) {
      this._ensureCtx();
      // significantly lower ceiling — white noise as subtle texture only
      this.noiseGain.gain.linearRampToValueAtTime(v * 0.08, this.ctx.currentTime + 0.15);
    },

    setAmbient(v) {
      this._ensureCtx();
      const wasOff = this._ambientLevel < 0.01;
      this._ambientLevel = v;
      this._ambientBus.gain.linearRampToValueAtTime(v * 0.32, this.ctx.currentTime + 0.4);
      if (wasOff && v > 0.01) {
        this._startScene(this._currentMode, this._currentScene);
      } else if (v < 0.01) {
        this._stopScene();
      }
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
  };

  /* =======================================================
     §4  Storage (LocalStorage + .txt export)
     ======================================================= */

  const Storage = {
    KEY_TEXT: 'cyberzen_text',
    KEY_FONT: 'cyberzen_font',
    KEY_MODE: 'cyberzen_mode',
    KEY_MIXER: 'cyberzen_mixer',
    KEY_TIMER: 'cyberzen_timer_preset',

    save(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota */ }
    },
    load(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v !== null ? JSON.parse(v) : fallback;
      } catch { return fallback; }
    },
    exportTxt(text) {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
      a.download = `cyberzen-${ts}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    },
  };

  /* =======================================================
     §5  Editor (The Deck)
     ======================================================= */

  const Editor = {
    el: null,
    fonts: ['font-wenkai', 'font-serif', 'font-mono'],
    fontIdx: 0,
    _saveTimer: null,

    init() {
      this.el = document.getElementById('editor');
      // restore
      this.el.value = Storage.load(Storage.KEY_TEXT, '');
      this.fontIdx = Storage.load(Storage.KEY_FONT, 0);
      this._applyFont();

      // auto-save on typing (debounced)
      this.el.addEventListener('input', () => {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
          Storage.save(Storage.KEY_TEXT, this.el.value);
        }, 400);
      });

      // font toggle
      document.getElementById('btn-font').addEventListener('click', () => {
        this.fontIdx = (this.fontIdx + 1) % this.fonts.length;
        this._applyFont();
        Storage.save(Storage.KEY_FONT, this.fontIdx);
      });

      // export
      document.getElementById('btn-export').addEventListener('click', () => {
        Storage.exportTxt(this.el.value);
      });
    },

    _applyFont() {
      this.fonts.forEach(f => this.el.classList.remove(f));
      this.el.classList.add(this.fonts[this.fontIdx]);
    },
  };

  /* =======================================================
     §6  Vibe Mixer
     ======================================================= */

  const Mixer = {
    panel: null,
    open: false,

    init() {
      this.panel = document.getElementById('vibe-mixer');
      const toggle = document.getElementById('mixer-toggle');
      toggle.addEventListener('click', () => this.toggle());

      // close when clicking outside
      document.addEventListener('mousedown', (e) => {
        if (this.open && !this.panel.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
          this.toggle(false);
        }
      });

      // sliders
      const saved = Storage.load(Storage.KEY_MIXER, { intensity: 50, blur: 20, noise: 0, music: 0 });

      const wire = (id, key, fn) => {
        const sl = document.getElementById(id);
        sl.value = saved[key];
        fn(saved[key] / 100);
        sl.addEventListener('input', () => {
          saved[key] = +sl.value;
          fn(+sl.value / 100);
          Storage.save(Storage.KEY_MIXER, saved);
        });
      };

      wire('sl-intensity', 'intensity', v => Canvas.setIntensity(v));
      wire('sl-blur', 'blur', v => {
        document.documentElement.style.setProperty('--glass-blur', (8 + v * 30) + 'px');
      });
      wire('sl-noise', 'noise', v => Audio.setNoise(v));
      wire('sl-music', 'music', v => Audio.setAmbient(v));

      // Scene selector
      document.querySelectorAll('.scene-btn').forEach(btn => {
        btn.addEventListener('click', () => Audio.setScene(+btn.dataset.scene));
      });
    },

    toggle(force) {
      this.open = force !== undefined ? force : !this.open;
      this.panel.classList.toggle('open', this.open);
    },
  };

  /* =======================================================
     §7  Zen Timer
     ======================================================= */

  const Timer = {
    el: null,
    display: null,
    ringFg: null,
    totalSec: 25 * 60,
    remaining: 25 * 60,
    running: false,
    interval: null,
    CIRCUM: 2 * Math.PI * 54,  // ≈ 339.292

    init() {
      this.el      = document.getElementById('zen-timer');
      this.display = document.getElementById('timer-display');
      this.ringFg  = document.querySelector('.ring-fg');

      // timer toggle via toolbar button
      document.getElementById('btn-timer').addEventListener('click', () => {
        const visible = this.el.classList.contains('visible');
        this.el.classList.remove('hidden');
        // force a reflow before toggling visible
        void this.el.offsetHeight;
        this.el.classList.toggle('visible', !visible);
      });

      // start / pause
      document.getElementById('timer-start').addEventListener('click', () => {
        if (this.running) this.pause(); else this.start();
      });

      // reset
      document.getElementById('timer-reset').addEventListener('click', () => this.reset());

      // presets
      const presetSaved = Storage.load(Storage.KEY_TIMER, 25);
      document.querySelectorAll('#timer-presets span').forEach(s => {
        const m = +s.dataset.min;
        if (m === presetSaved) s.classList.add('active');
        s.addEventListener('click', () => {
          document.querySelectorAll('#timer-presets span').forEach(x => x.classList.remove('active'));
          s.classList.add('active');
          this.setMinutes(m);
          Storage.save(Storage.KEY_TIMER, m);
        });
      });

      this.setMinutes(presetSaved);
    },

    setMinutes(m) {
      this.pause();
      this.totalSec = m * 60;
      this.remaining = this.totalSec;
      this._render();
    },

    start() {
      if (this.remaining <= 0) return;
      Audio.resume();
      this.running = true;
      document.getElementById('timer-start').textContent = '⏸';
      this.interval = setInterval(() => {
        this.remaining = Math.max(0, this.remaining - 1);
        this._render();
        if (this.remaining <= 0) { this.pause(); this._flash(); }
      }, 1000);
    },

    pause() {
      this.running = false;
      clearInterval(this.interval);
      document.getElementById('timer-start').textContent = '▶';
    },

    reset() {
      this.pause();
      this.remaining = this.totalSec;
      this._render();
    },

    _render() {
      const m = Math.floor(this.remaining / 60);
      const s = this.remaining % 60;
      this.display.textContent =
        String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      const progress = 1 - this.remaining / this.totalSec;
      this.ringFg.style.strokeDashoffset = (progress * this.CIRCUM).toFixed(2);
    },

    _flash() {
      // brief visual pulse when timer finishes
      this.display.style.textShadow = '0 0 20px rgba(100,180,255,0.9)';
      setTimeout(() => { this.display.style.textShadow = ''; }, 1500);
    },
  };

  /* =======================================================
     §8  Mode Switcher
     ======================================================= */

  const Mode = {
    current: 'rain',
    init() {
      this.current = Storage.load(Storage.KEY_MODE, 'rain');
      this._apply(this.current);

      document.querySelectorAll('.mode-option').forEach(el => {
        el.addEventListener('click', () => {
          this._apply(el.dataset.mode);
        });
      });

      // show mode-bar when mouse enters top 50px
      document.addEventListener('mousemove', (e) => {
        document.getElementById('mode-bar').classList.toggle('visible', e.clientY <= 50);
      });
    },

    _apply(mode) {
      this.current = mode;
      document.querySelectorAll('.mode-option').forEach(el => {
        el.classList.toggle('active', el.dataset.mode === mode);
      });
      Canvas.setMode(mode);
      Audio.setMode(mode);
      Storage.save(Storage.KEY_MODE, mode);
    },
  };

  /* =======================================================
     §9  Boot
     ======================================================= */

  function boot() {
    Canvas.init();
    Editor.init();
    Mixer.init();
    Timer.init();
    Mode.init();

    // first user interaction unlocks audio context
    const unlock = () => { Audio.resume(); document.removeEventListener('click', unlock); };
    document.addEventListener('click', unlock);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', boot);
  else
    boot();
})();
