import { createActor } from "xstate";

/**
 * AbstractAffectEngine
 *
 * Packet-driven abstract base class for affect engines.
 *
 * Architecture:
 * - One packet = one engine tick
 * - Backend is authoritative
 * - Engine owns:
 *   - continuous aggregated state
 *   - current input packet
 *   - XState actor for qualitative regime transitions
 *
 * Subclasses must implement:
 * - initializeState()
 * - createMachine()
 * - reduce(packet, derivedInput)
 * - stepStateMachine(packet, derivedInput)
 * - getVisualParams()
 * - getAudioParams()
 *
 * Optional hooks simulate "partial subclassing":
 * - validatePacket()
 * - normalizePacket()
 * - computeDerivedInput()
 * - applyConstraints()
 * - beforeTick()
 * - afterTick()
 * - onReset()
 */
export default class AbstractAffectEngine {
  /**
   * Sentinel for "no new affective content".
   * Distinct from neutral affect.
   *
   * @type {symbol}
   */
  static NO_INPUT = Symbol("NO_INPUT");

  /**
   * @param {object} [config={}]
   */
  constructor(config = {}) {
    if (new.target === AbstractAffectEngine) {
      throw new Error(
        "AbstractAffectEngine is abstract and cannot be instantiated directly.",
      );
    }

    /**
     * User / engine config.
     * @type {object}
     */
    this.config = { ...config };

    this.logger = config.logger ?? null;
    this.debug = config.debug ?? false;

    /**
     * Number of packets processed so far.
     * @type {number}
     */
    this.tickCount = 0;

    /**
     * Whether the engine is active.
     * @type {boolean}
     */
    this.active = true;

    /**
     * Last normalized packet received.
     * @type {object|null}
     */
    this.packet = null;

    /**
     * Last derived input computed from the packet.
     * @type {object|null}
     */
    this.derivedInput = null;

    /**
     * Continuous aggregated state.
     * @type {object}
     */
    this.state = this.initializeState();
    if (!this.state || typeof this.state !== "object") {
      throw new Error(
        `${this.constructor.name}.initializeState() must return an object.`,
      );
    }

    /**
     * XState machine instance.
     */
    this.machine = this.createMachine();
    if (!this.machine) {
      throw new Error(
        `${this.constructor.name}.createMachine() must return an XState machine.`,
      );
    }

    /**
     * XState actor instance.
     */
    this.actor = createActor(this.machine);
    this.actor.start();
    this._lastMachineStateValue = this.getRegime();

    // Subscribe to state transitions for logging/visibility.
    this.actor.subscribe((snapshot) => {
      const nextValue =
        typeof snapshot.value === "string"
          ? snapshot.value
          : JSON.stringify(snapshot.value);

      if (nextValue !== this._lastMachineStateValue) {
        this.onRegimeTransition(
          this._lastMachineStateValue,
          nextValue,
          snapshot,
        );
        this._lastMachineStateValue = nextValue;
      }
    });

    /**
     * Mirror current regime into continuous state for convenience.
     * @type {string}
     */
    this.state.regime = this.getRegime();
  }

  /**
   * Process exactly one packet.
   *
   * Flow:
   * 1. validate packet
   * 2. normalize packet
   * 3. derive semantic input
   * 4. reduce continuous state
   * 5. apply constraints
   * 6. step qualitative state machine
   * 7. update mirrored regime
   *
   * @param {object} packet
   * @returns {object} snapshot
   */
  tick(packet) {
    if (!this.active) {
      return this.getPublicState();
    }

    const prevPublicState = this.getPublicState();

    this.beforeTick(packet);

    this.validatePacket(packet);

    const normalizedPacket = this.normalizePacket(packet);
    this.packet = normalizedPacket;

    const derivedInput = this.computeDerivedInput(normalizedPacket);
    this.derivedInput = derivedInput;

    this.reduce(normalizedPacket, derivedInput);
    this.applyConstraints();

    this.stepStateMachine(normalizedPacket, derivedInput);

    this.tickCount += 1;
    this.state.regime = this.getRegime();

    this.afterTick(normalizedPacket, derivedInput);

    const nextPublicState = this.getPublicState();

    if (this.logger && typeof this.logger.logTick === "function") {
      this.logger.logTick(prevPublicState, nextPublicState);
    }

    return nextPublicState;
  }

  /**
   * Pause engine processing.
   */
  pause() {
    this.active = false;
  }

  /**
   * Resume engine processing.
   */
  resume() {
    this.active = true;
  }

  /**
   * Reset state and recreate machine actor.
   */
  reset() {
    this.tickCount = 0;
    this.active = true;
    this.packet = null;
    this.derivedInput = null;
    this.state = this.initializeState();

    if (this.actor) {
      this.actor.stop();
    }

    this.machine = this.createMachine();
    this.actor = createActor(this.machine);
    this.actor.start();

    this.state.regime = this.getRegime();

    this.onReset();
  }

  /**
   * Send an event to the XState actor.
   *
   * @param {object} event
   */
  sendMachineEvent(event) {
    if (!this.actor) return;
    this.actor.send(event);
  }

  /**
   * Returns the XState snapshot.
   *
   * @returns {object|null}
   */
  getMachineSnapshot() {
    return this.actor ? this.actor.getSnapshot() : null;
  }

  /**
   * Returns the current qualitative regime from XState.
   *
   * @returns {string}
   */
  getRegime() {
    const snapshot = this.getMachineSnapshot();
    if (!snapshot) return "unknown";

    const value = snapshot.value;

    if (typeof value === "string") {
      return value;
    }

    return JSON.stringify(value);
  }

  /**
   * Serializable engine snapshot for transport/debug/render.
   *
   * @returns {object}
   */
  getPublicState() {
    return {
      engine: this.constructor.name,
      tickCount: this.tickCount,
      active: this.active,
      regime: this.getRegime(),
      state: { ...this.state },
      signals: this.getSignals(),
      packet: this.packet,
      derivedInput: this.derivedInput,
    };
  }

  // ---------------------------------------------------------------------------
  // REQUIRED ABSTRACT HOOKS
  // ---------------------------------------------------------------------------

  /**
   * Must return the initial continuous state object.
   *
   * @abstract
   * @returns {object}
   */
  initializeState() {
    this._abstract("initializeState");
  }

  /**
   * Must return an XState machine.
   *
   * @abstract
   * @returns {object}
   */
  createMachine() {
    this._abstract("createMachine");
  }

  /**
   * Must update the continuous aggregated state for one packet-step.
   *
   * @abstract
   * @param {object} packet
   * @param {object} derivedInput
   */
  reduce(packet, derivedInput) {
    this._abstract("reduce");
  }

  /**
   * Must advance / notify the qualitative XState machine.
   *
   * Usually this will send a STEP event containing:
   * - packet
   * - derivedInput
   * - engineState
   * - tickCount
   *
   * @abstract
   * @param {object} packet
   * @param {object} derivedInput
   */
  stepStateMachine(packet, derivedInput) {
    this._abstract("stepStateMachine");
  }

  // ---------------------------------------------------------------------------
  // OPTIONAL HOOKS
  // ---------------------------------------------------------------------------

  /**
   * Optional pre-tick hook.
   *
   * @param {object} packet
   */
  beforeTick(packet) {
    // no-op
  }

  /**
   * Optional post-tick hook.
   *
   * @param {object} packet
   * @param {object} derivedInput
   */
  afterTick(packet, derivedInput) {
    // no-op
  }

  onRegimeTransition(prevRegime, nextRegime, snapshot) {
    if (!this.debug) return;

    console.log(
      `\x1b[35m[${this.constructor.name}]\x1b[0m regime transition: ` +
        `\x1b[36m${prevRegime}\x1b[0m ⇒ \x1b[36m${nextRegime}\x1b[0m`,
    );
  }

  /**
   * Optional reset hook.
   */
  onReset() {
    // no-op
  }

  /**
   * Optional packet validation.
   *
   * Expected normalized packet shape is flexible, but subclasses/backend
   * should typically use something like:
   *
   * {
   *   type: "affect" | "idle",
   *   value: scorecard | AbstractAffectEngine.NO_INPUT,
   *   meta?: {...}
   * }
   *
   * @param {object} packet
   */
  validatePacket(packet) {
    if (!packet || typeof packet !== "object") {
      throw new Error("tick(packet): packet must be an object.");
    }

    if (!("type" in packet)) {
      throw new Error("tick(packet): packet.type is required.");
    }

    if (!("value" in packet)) {
      throw new Error("tick(packet): packet.value is required.");
    }
  }

  /**
   * Optional packet normalization.
   * Default: shallow clone.
   *
   * @param {object} packet
   * @returns {object}
   */
  normalizePacket(packet) {
    return {
      meta: {},
      ...packet,
    };
  }

  /**
   * Convert the normalized packet into a derived semantic affect payload.
   *
   * Default behavior:
   * - affect packet with VAD + emotions => derive secondary signals
   * - idle / NO_INPUT packet => return no-input semantic payload
   *
   * @param {object} packet
   * @returns {object}
   */
  computeDerivedInput(packet) {
    if (
      packet.type === "idle" ||
      packet.value === AbstractAffectEngine.NO_INPUT
    ) {
      return {
        kind: "no-input",
        hasSignal: false,
        valence: 0,
        arousal: 0,
        dominance: 0,
        threat: 0,
        grief: 0,
        relief: 0,
        numbness: 0,
        shock: 0,
        peace: 0,
      };
    }

    const value = packet.value || {};
    const emotions = value.emotions || {};

    const valence = this._clamp01(value.valence ?? 0);
    const arousal = this._clamp01(value.arousal ?? 0);
    const dominance = this._clamp01(value.dominance ?? 0);

    const fear = this._clamp01(emotions.fear ?? 0);
    const anger = this._clamp01(emotions.anger ?? 0);
    const sadness = this._clamp01(emotions.sadness ?? 0);
    const joy = this._clamp01(emotions.joy ?? 0);
    const neutral = this._clamp01(emotions.neutral ?? 0);
    const surprise = this._clamp01(emotions.surprise ?? 0);

    return {
      kind: "affect",
      hasSignal: true,
      valence,
      arousal,
      dominance,
      threat: this._clamp01((fear + anger) / 2),
      grief: sadness,
      relief: joy,
      numbness: neutral,
      shock: surprise,
      peace: this._clamp01((1 - arousal) * dominance),
    };
  }

  /**
   * Optional post-reduction constraints.
   * Default: clamp commonly used normalized state keys to [0, 1].
   */
  applyConstraints() {
    const keysToClamp = [
      "load",
      "altitude",
      "fatigue",
      "peace",
      "momentum",
      "valence",
      "arousal",
      "dominance",
      "threat",
      "grief",
      "relief",
      "numbness",
      "shock",
    ];

    for (const key of keysToClamp) {
      if (typeof this.state[key] === "number") {
        this.state[key] = this._clamp01(this.state[key]);
      }
    }
  }

  /**
   * Must return the engine's semantic output signals.
   *
   * These signals are renderer-agnostic and can be consumed by:
   * - frontend visual modules
   * - audio modules / MaxMSP
   * - debugging tools
   * - logging / telemetry
   *
   * @abstract
   * @returns {object}
   */
  getSignals() {
    this._abstract("getSignals");
  }

  // ---------------------------------------------------------------------------
  // INTERNAL HELPERS
  // ---------------------------------------------------------------------------

  /**
   * @param {string} methodName
   */
  _abstract(methodName) {
    throw new Error(`${this.constructor.name} must implement ${methodName}().`);
  }

  /**
   * Clamp a number to [0, 1].
   *
   * @param {number} value
   * @returns {number}
   */
  _clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }
}
