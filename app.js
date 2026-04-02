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
    ambientGain: null,
    noiseNode: null,
    ambientOscs: [],
    _bowlTimer: null,
    _ambientLevel: 0,

    _ensureCtx() {
      if (this.ctx) return;
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      // --- White noise (rain texture) ---
      const bufSize = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      this.noiseNode = this.ctx.createBufferSource();
      this.noiseNode.buffer = buf;
      this.noiseNode.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.5;
      this.noiseGain = this.ctx.createGain();
      this.noiseGain.gain.value = 0;
      this.noiseNode.connect(bp).connect(this.noiseGain).connect(this.ctx.destination);
      this.noiseNode.start();

      // --- Zen ambient bus ---
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0;

      // Long reverb tail: two delay lines with filtered feedback
      const mkDelay = (time, fbAmt, cutoff) => {
        const d  = this.ctx.createDelay(4.0);
        const f  = this.ctx.createBiquadFilter();
        const fg = this.ctx.createGain();
        d.delayTime.value = time;
        f.type = 'lowpass'; f.frequency.value = cutoff;
        fg.gain.value = fbAmt;
        d.connect(f).connect(fg).connect(d);       // feedback loop
        this.ambientGain.connect(d);
        fg.connect(this.ctx.destination);          // wet out
      };
      mkDelay(1.8,  0.45, 800);
      mkDelay(2.7,  0.35, 500);

      // Dry path through low-pass
      const dryLP = this.ctx.createBiquadFilter();
      dryLP.type = 'lowpass'; dryLP.frequency.value = 900;
      this.ambientGain.connect(dryLP).connect(this.ctx.destination);

      // Continuous breath-drone: 136.1 Hz (Earth-year resonance, "OM" frequency)
      // + a theta-beat partner 6 Hz higher to induce meditative brainwave entrainment
      [[136.1, 0.028], [142.1, 0.018]].forEach(([f, vol]) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        // micro-drift LFO (0.04 Hz, ±0.15%)
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine'; lfo.frequency.value = 0.04;
        const lg = this.ctx.createGain(); lg.gain.value = f * 0.0015;
        lfo.connect(lg).connect(osc.frequency); lfo.start();
        const g = this.ctx.createGain(); g.gain.value = vol;
        osc.connect(g).connect(this.ambientGain);
        osc.start();
        this.ambientOscs.push(osc);
      });

      // Schedule periodic singing-bowl strikes
      this._scheduleBowl();
    },

    // Tibetan singing bowl simulation
    // Real bowls: strong fundamental + overtone at ~2.76× + 5.2× the fundamental
    _strikeBowl() {
      if (!this.ctx || this._ambientLevel < 0.01) return;
      const now  = this.ctx.currentTime;
      const root = 222.0;   // ~A3-ish, warm bowl pitch
      const partials = [
        { f: root,        vol: 0.18, decay: 6.0  },
        { f: root * 2.76, vol: 0.07, decay: 4.0  },
        { f: root * 5.20, vol: 0.025, decay: 2.5 },
      ];
      partials.forEach(({ f, vol, decay }) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(vol * this._ambientLevel, now + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(env).connect(this.ambientGain);
        osc.start(now);
        osc.stop(now + decay + 0.1);
      });
    },

    _scheduleBowl() {
      const interval = () => 7000 + Math.random() * 9000; // 7–16 s
      const tick = () => {
        this._strikeBowl();
        this._bowlTimer = setTimeout(tick, interval());
      };
      this._bowlTimer = setTimeout(tick, 2000 + Math.random() * 4000);
    },

    setNoise(v) {
      this._ensureCtx();
      this.noiseGain.gain.linearRampToValueAtTime(v * 0.35, this.ctx.currentTime + 0.1);
    },
    setAmbient(v) {
      this._ensureCtx();
      this._ambientLevel = v;
      this.ambientGain.gain.linearRampToValueAtTime(v * 0.28, this.ctx.currentTime + 0.3);
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
