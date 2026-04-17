import { IP5Drawable } from "src/p5/interfaces.mjs";

/**
 * Inner weather static + vertical noise field.
 *
 * Renders into an offscreen p5.Graphics buffer so it can control pixelDensity
 * independently, then draws that buffer onto the main canvas.
 */
export default class AffectNoiseFieldDrawable extends IP5Drawable {
  /**
   * @param {object} [options={}]
   * @param {number} [options.width=400]
   * @param {number} [options.height=400]
   * @param {number} [options.x=0]
   * @param {number} [options.y=0]
   */
  constructor(options = {}) {
    super();

    this.width = options.width ?? 400;
    this.height = options.height ?? 400;
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;

    /**
     * Offscreen buffer used to isolate pixelDensity / pixel operations.
     *
     * @type {import("p5").Graphics | null}
     */
    this.buffer = null;

    /**
     * Smoothed affect state used for drawing.
     *
     * @type {{
     *   load:number,
     *   altitude:number,
     *   peace:number,
     *   activation:number,
     *   constriction:number,
     *   instability:number,
     *   regime:string,
     *   affectEngine:string
     * }}
     */
    this.state = {
      load: 0.2,
      altitude: 0.4,
      peace: 0.2,
      activation: 0.3,
      constriction: 0.2,
      instability: 0.2,
      regime: "baseline",
      affectEngine: "anxiety",
    };

    /**
     * Target affect state received from upstream.
     *
     * @type {{
     *   load:number,
     *   altitude:number,
     *   peace:number,
     *   activation:number,
     *   constriction:number,
     *   instability:number,
     *   regime:string,
     *   affectEngine:string
     * }}
     */
    this.targetState = { ...this.state };

    /**
     * Whether we've received at least one real affect state.
     * @type {boolean}
     */
    this._hasReceivedFirstState = false;

    /**
     * Time accumulator for animation.
     *
     * @type {number}
     */
    this.t = 0;
  }

  /**
   * @param {import("p5")} p5
   */
  setup(p5) {
    this.buffer = p5.createGraphics(this.width, this.height);
    this._configureBuffer(this.buffer);
  }

  /**
   * @param {import("p5")} p5
   * @param {number} width
   * @param {number} height
   */
  resize(p5, width, height) {
    this.width = width;
    this.height = height;

    this.buffer = p5.createGraphics(this.width, this.height);
    this._configureBuffer(this.buffer);
  }

  /**
   * Set the current affect state from the engine/runtime.
   *
   * @param {object} params
   * @param {{
   *   load:number,
   *   altitude:number,
   *   peace:number,
   *   activation:number,
   *   constriction:number,
   *   instability:number
   * }} params.signals
   * @param {string} [params.regime]
   * @param {string} [params.affectEngine]
   */
  setAffectState({ signals, regime, affectEngine }) {
    if (!signals) return;

    this._hasReceivedFirstState = true;

    this.targetState = {
      load: this._clamp01(signals.load ?? this.targetState.load),
      altitude: this._clamp01(signals.altitude ?? this.targetState.altitude),
      peace: this._clamp01(signals.peace ?? this.targetState.peace),
      activation: this._clamp01(
        signals.activation ?? this.targetState.activation,
      ),
      constriction: this._clamp01(
        signals.constriction ?? this.targetState.constriction,
      ),
      instability: this._clamp01(
        signals.instability ?? this.targetState.instability,
      ),
      regime: regime ?? signals.regime ?? this.targetState.regime,
      affectEngine: affectEngine ?? this.targetState.affectEngine,
    };
  }

  /**
   * @param {import("p5")} p5
   */
  draw(p5) {
    if (!this.buffer) {
      this.setup(p5);
    }

    // Do not render anything until we have real affect data
    if (!this._hasReceivedFirstState) {
      console.log("[AffectNoiseFieldDrawable] No state submitted yet");
      return;
    }

    this._stepState();
    this._renderToBuffer(p5, this.buffer);

    p5.push();
    p5.image(this.buffer, this.x, this.y, this.width, this.height);
    p5.pop();
  }

  /**
   * @param {import("p5").Graphics} buffer
   */
  _configureBuffer(buffer) {
    buffer.pixelDensity(1);
    buffer.colorMode(buffer.RGB, 255, 255, 255, 255);
    buffer.noSmooth();
  }

  _stepState() {
    const lerpAmt = 0.12;

    this.state.load = this._lerp(
      this.state.load,
      this.targetState.load,
      lerpAmt,
    );
    this.state.altitude = this._lerp(
      this.state.altitude,
      this.targetState.altitude,
      lerpAmt,
    );
    this.state.peace = this._lerp(
      this.state.peace,
      this.targetState.peace,
      lerpAmt,
    );
    this.state.activation = this._lerp(
      this.state.activation,
      this.targetState.activation,
      lerpAmt,
    );
    this.state.constriction = this._lerp(
      this.state.constriction,
      this.targetState.constriction,
      lerpAmt,
    );
    this.state.instability = this._lerp(
      this.state.instability,
      this.targetState.instability,
      lerpAmt,
    );

    this.state.regime = this.targetState.regime;
    this.state.affectEngine = this.targetState.affectEngine;

    const timeRate =
      0.3 +
      this.state.activation * 0.8 +
      this.state.instability * 0.6 -
      this.state.peace * 0.25;

    this.t += Math.max(0.02, timeRate) * 0.01;
  }

  /**
   * @param {import("p5")} p5
   * @param {import("p5").Graphics} g
   */
  /**
   * Renders noisy RGBA grain + vertical noise lines into the provided buffer.
   *
   * Assumptions:
   * - this.state values are all in [0, 1]
   * - g is a p5.Graphics buffer already created at the target size
   *
   * @param {import("p5")} p5
   * @param {import("p5").Graphics} g
   */
  _renderToBuffer(p5, g) {
    const {
      load = 0,
      altitude = 0,
      peace = 0,
      activation = 0,
      constriction = 0,
      instability = 0,
    } = this.state ?? {};

    // -----------------------------
    // Helpers
    // -----------------------------
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const lerp = (a, b, t) => a + (b - a) * t;

    const to255 = (v) => Math.round(clamp01(v) * 255);

    // -----------------------------
    // Derive the old "slider" values
    // from the semantic affect state
    // -----------------------------
    //
    // Original comments:
    // - load: mid PD, NL/NS don't matter, low RGB, high A
    // - altitude: highest PD, NL doesn't matter, low NS, high RGBA
    // - peace: highest PD, mid NL, low NS, low R, high G, low B, high A
    // - activation: high everything, mid NL
    // - constriction: high PD, low NL, low NS, high R, low G, low B, high A
    // - instability: extremely low PD
    //
    // We combine these as weighted influences.

    // Pixel density in the original slider was [1..100], then divided by 100.
    // So effective range was [0.01 .. 1.0].
    let pd01 =
      0.45 * load +
      1.0 * (1-altitude) +
      1.0 * (1-peace) +
      0.8 * activation +
      0.9 * constriction +
      1.0 * instability;

    // Instability strongly collapses density.
    pd01 *= 1 - 0.92 * instability;

    // Keep some floor so it does not vanish completely.
    pd01 = clamp01(Math.max(0.02, pd01));

    // Variance in the mean horizontal line of the noise wave
    // Noise level corresponds to old sliderN in [10..1000]
    // "mid" ~ around 0.45 to 0.6
    let noiseLevel01 =
      0.75 * load +
      0.25 * altitude +
      0.25 * peace +
      0.75 * activation +
      0.15 * constriction +
      0.5 * instability;

    noiseLevel01 = clamp01(noiseLevel01);
    const noiseLevel = lerp(10, 1000, noiseLevel01);

    // Variance in the wave height
    // Noise scale corresponds to old sliderNS in [1..100], then /1000
    // So effective range [0.001 .. 0.1]
    let noiseScale01 =
      0.5 * load +
      0.1 * altitude +
      0.1 * peace +
      0.95 * activation +
      0.1 * constriction +
      0.6 * instability;

    noiseScale01 = clamp01(noiseScale01);
    const noiseScale = lerp(0.001, 0.1, noiseScale01);

    // RGBA channel biases, normalized first in [0..1], then mapped to [0..255]
    let r01 =
      0.3 * load +
      0.05 * altitude +
      0.05 * peace +
      0.4 * activation +
      0.4 * constriction +
      0.25 * instability;

    r01 = clamp01(r01);

    let g01 =
      r01 > 0.5 ? 0 :
      0.05 * (1-load) +
      0.2 * altitude +
      0.4 * peace +
      0.4 * (1-activation) +
      0.05 * constriction +
      0.05 * instability;

    g01 = clamp01(g01);

    let b01 =
      0.1 * load +
      0 * altitude +
      0.1 * peace +
      0.1 * activation +
      0.35 * constriction +
      0.45 * instability;
    
    

    let a01 =
      0.9 * load +
      0.9 * altitude +
      0.9 * peace +
      1.0 * activation +
      0.9 * constriction +
      0.5 * instability;
    
    b01 = clamp01(b01);
    a01 = clamp01(a01);

    const rBias = to255(r01);
    const gBias = to255(g01);
    const bBias = to255(b01);
    const aBias = to255(a01);

    // -----------------------------
    // Render base noise into pixels
    // -----------------------------
    g.clear();

    // pixelDensity affects the internal backing resolution of the graphics.
    // It is best if this is stable, but since your original sketch drove it
    // dynamically, this keeps the same spirit.
    g.pixelDensity(pd01);

    g.loadPixels();

    const d = g.pixelDensity();
    const w = g.width * d;
    const h = g.height * d;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = 4 * (x + y * w);

        const val = p5.random(255);

        g.pixels[i] = Math.min(255, val + rBias);
        g.pixels[i + 1] = Math.min(255, val + gBias);
        g.pixels[i + 2] = Math.min(255, val + bBias);
        g.pixels[i + 3] = Math.min(255, val + aBias);
      }
    }

    g.updatePixels();

    // -----------------------------
    // Overlay vertical Perlin lines
    // -----------------------------
    g.push();
    g.stroke(
      Math.min(255, rBias),
      Math.min(255, gBias),
      Math.min(255, bBias),
      Math.min(255, aBias),
    );
    g.strokeWeight(1);

    for (let x = 0; x < g.width; x += 1) {
      const nx = noiseScale * x;
      const nt = noiseScale * p5.frameCount;
      const y = noiseLevel * p5.noise(nx, nt);

      g.line(x, 0, x, y);
    }

    g.pop();

    this._drawRegimeOverlay(g);
  }

  /**
   * @param {import("p5").Graphics} g
   */
  _drawRegimeOverlay(g) {
    const w = this.width;
    const h = this.height;

    g.push();
    g.noStroke();

    switch (this.state.regime) {
      case "whiteout":
      case "crashing":
      case "numb": {
        g.fill(255, 255, 255, 8 + this.state.load * 20);
        g.rect(0, 0, w, h);
        break;
      }

      case "spiraling":
      case "strained":
      case "flattened": {
        g.fill(0, 0, 0, 8 + this.state.constriction * 24);
        g.rect(0, 0, w, h);
        break;
      }

      default:
        break;
    }

    g.pop();
  }

  _getPalette() {
    switch (this.state.affectEngine) {
      case "depression":
        return {
          bg: [18, 22, 28],
          noiseTint: [6, 8, 12],
          line: [120, 135, 155],
        };

      case "burnout":
        return {
          bg: [28, 20, 18],
          noiseTint: [20, 8, 6],
          line: [165, 120, 95],
        };

      case "anxiety":
      default:
        return {
          bg: [16, 18, 24],
          noiseTint: [8, 10, 18],
          line: [145, 160, 190],
        };
    }
  }

  /**
   * @param {number} rx
   * @param {number} ry
   * @returns {number}
   */
  _distToCenter(rx, ry) {
    const dx = rx - 0.5;
    const dy = ry - 0.5;
    return Math.sqrt(dx * dx + dy * dy) * 2.0;
  }

  /**
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @param {number} outMin
   * @param {number} outMax
   * @returns {number}
   */
  _map(value, min, max, outMin, outMax) {
    const t = (value - min) / (max - min);
    return outMin + (outMax - outMin) * t;
  }

  /**
   * @param {number} a
   * @param {number} b
   * @param {number} t
   * @returns {number}
   */
  _lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * @param {number} v
   * @returns {number}
   */
  _clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  /**
   * @param {number} v
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  _clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
}
