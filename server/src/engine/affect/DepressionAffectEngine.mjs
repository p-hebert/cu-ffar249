import { createActor, createMachine } from "xstate";
import AbstractAffectEngine from "./AbstractAffectEngine.mjs";

/**
 * @typedef {"light" | "low" | "depressed" | "numb"} DepressionScenarioName
 */

/**
 * @typedef {"baseline" | "heavy" | "flattened" | "numb" | "stirring"} DepressionRegimeName
 */

/**
 * Continuous, engine-owned depression state.
 * These values persist across packet ticks.
 *
 * @typedef {object} DepressionEngineState
 * @property {number} load Broad internal burden / heaviness.
 * @property {number} altitude Functional clarity / capacity to rise.
 * @property {number} peace Accumulated regulation / soft safety.
 * @property {number} heaviness Felt weight / downward pull.
 * @property {number} inertia Difficulty mobilizing / getting moving.
 * @property {number} numbness Emotional blunting / flattening.
 */

/**
 * Scenario seed config.
 *
 * @typedef {object} DepressionScenarioSeed
 * @property {DepressionRegimeName} regime
 * @property {Partial<DepressionEngineState>} state
 */

/**
 * Human-readable information about a qualitative regime.
 *
 * @typedef {object} RegimeInfo
 * @property {string[]} summary
 * @property {string} transitionOut
 */

/**
 * Regime-specific numeric modifiers.
 *
 * @typedef {object} RegimeModifiers
 * @property {number} heavinessGain
 * @property {number} inertiaGain
 * @property {number} numbnessGain
 * @property {number} regulationGain
 * @property {number} altitudeGain
 * @property {number} peaceGain
 * @property {number} noInputRecoveryGain
 */

/**
 * Normalized transport packet expected by the engine.
 *
 * @typedef {object} AffectPacket
 * @property {"affect" | "idle"} type
 * @property {unknown} value
 * @property {{
 *   correlationId?: string | null,
 *   source?: string | null,
 *   [key: string]: unknown
 * }} [meta]
 */

/**
 * Base VAD packet interpretation.
 *
 * @typedef {object} BaseDerivedInput
 * @property {"affect" | "no-input"} kind
 * @property {boolean} hasSignal
 * @property {number} valence
 * @property {number} arousal
 * @property {number} dominance
 */

/**
 * Depression-specific packet interpretation.
 * These are per-packet cues, not persistent engine memory.
 *
 * @typedef {BaseDerivedInput & {
 *   heavinessCue: number,
 *   reliefCue: number,
 *   numbnessCue: number,
 *   peaceCue: number,
 *   mobilizationCue: number,
 *   restoration: number
 * }} DepressionDerivedInput
 */

/**
 * Public semantic signals emitted to downstream consumers.
 *
 * @typedef {object} DepressionSignals
 * @property {DepressionRegimeName | string} regime
 * @property {number} load
 * @property {number} altitude
 * @property {number} peace
 * @property {number} heaviness
 * @property {number} inertia
 * @property {number} numbness
 * @property {number} valence
 * @property {number} arousal
 * @property {number} dominance
 * @property {number} heavinessCue
 * @property {number} reliefCue
 * @property {number} numbnessCue
 * @property {number} peaceCue
 * @property {number} mobilizationCue
 * @property {number} restoration
 * @property {number} flattening
 * @property {number} recoveryReadiness
 * @property {number} activationCapacity
 */

/**
 * DepressionAffectEngine
 *
 * Phenomenological focus:
 * - heaviness
 * - flattening
 * - lowered activation
 * - numbness
 * - slow re-opening / stirring
 *
 * Core logic:
 * - low valence + low dominance + often low/moderate arousal create downward pull
 * - positive signals help, but often with reduced traction
 * - no-input does not automatically heal; it can preserve inertia
 * - recovery appears first as "stirring", not as immediate clarity
 */
export default class DepressionAffectEngine extends AbstractAffectEngine {
  /**
   * @type {Record<DepressionRegimeName, RegimeInfo>}
   */
  static REGIME_INFO = {
    baseline: {
      summary: [
        "The system is open enough to respond to input",
        "Relief and gentle activation can raise altitude normally",
        "Heaviness and numbness are not strongly self-sustaining",
      ],
      transitionOut:
        "Sustained heaviness, growing inertia, or increasing emotional flattening",
    },

    heavy: {
      summary: [
        "The system feels weighted down and harder to mobilize",
        "Relief still helps, but progress is slower and more effortful",
        "Load and heaviness begin to pull altitude downward",
      ],
      transitionOut:
        "Either repeated restoration into stirring, or deeper flattening",
    },

    flattened: {
      summary: [
        "The system has low affective amplitude and low momentum",
        "Relief and peace cues have reduced traction",
        "Inertia and heaviness reinforce lowered activity",
      ],
      transitionOut:
        "Gentle repeated restoration that slowly reintroduces movement",
    },

    numb: {
      summary: [
        "The system is emotionally blunted and minimally responsive",
        "No-input alone tends to preserve low-motion flattening",
        "Altitude and peace are strongly capped and slow to recover",
      ],
      transitionOut:
        "Repeated restorative packets that slowly break through numbness",
    },

    stirring: {
      summary: [
        "Small amounts of warmth and motion are returning",
        "Relief and mobilization cues gain more traction",
        "The system can rise, but is still fragile and easy to flatten again",
      ],
      transitionOut:
        "Either sustained restoration into baseline, or renewed heaviness",
    },
  };

  /**
   * @param {{
   *   scenario?: DepressionScenarioName | null,
   *   logger?: { logTick?: (prevPublicState: unknown, nextPublicState: unknown) => void } | null,
   *   debug?: boolean,
   *   [key: string]: unknown
   * }} [config={}]
   */
  constructor(config = {}) {
    super(config);

    const scenario = this.getScenarioState(
      /** @type {DepressionScenarioName | null | undefined} */ (
        config.scenario
      ),
    );

    this.state = {
      ...this.state,
      ...scenario.state,
    };

    if (this.actor) {
      this.actor.stop();
    }

    this.machine = this.createMachine(scenario.regime);
    this.actor = createActor(this.machine);
    this.actor.start();

    this._lastMachineStateValue = this.getRegime();
    this._attachScenarioActorTransitionLogger();
  }

  /**
   * Re-attach transition logging after restarting the actor for a scenario.
   *
   * @returns {void}
   */
  _attachScenarioActorTransitionLogger() {
    if (!this.actor) return;

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
  }

  /**
   * @param {DepressionScenarioName | null | undefined} name
   * @returns {DepressionScenarioSeed}
   */
  getScenarioState(name) {
    /** @type {Record<DepressionScenarioName, DepressionScenarioSeed>} */
    const scenarios = {
      light: {
        regime: "baseline",
        state: {
          load: 0.18,
          altitude: 0.58,
          peace: 0.44,
          heaviness: 0.16,
          inertia: 0.14,
          numbness: 0.1,
        },
      },

      low: {
        regime: "heavy",
        state: {
          load: 0.42,
          altitude: 0.38,
          peace: 0.22,
          heaviness: 0.44,
          inertia: 0.34,
          numbness: 0.24,
        },
      },

      depressed: {
        regime: "flattened",
        state: {
          load: 0.62,
          altitude: 0.22,
          peace: 0.1,
          heaviness: 0.66,
          inertia: 0.62,
          numbness: 0.42,
        },
      },

      numb: {
        regime: "numb",
        state: {
          load: 0.58,
          altitude: 0.14,
          peace: 0.06,
          heaviness: 0.52,
          inertia: 0.72,
          numbness: 0.78,
        },
      },
    };

    return (
      scenarios[name ?? "light"] ?? {
        regime: "baseline",
        state: {},
      }
    );
  }

  /**
   * Initial continuous state.
   *
   * @returns {DepressionEngineState}
   */
  initializeState() {
    return {
      load: 0.2,
      altitude: 0.46,
      peace: 0.26,
      heaviness: 0.2,
      inertia: 0.18,
      numbness: 0.12,
    };
  }

  /**
   * XState machine for qualitative regimes.
   *
   * @param {DepressionRegimeName} [initial="baseline"]
   * @returns {import("xstate").AnyStateMachine}
   */
  createMachine(initial = "baseline") {
    return createMachine({
      id: "depressionAffect",
      initial,
      states: {
        baseline: {
          on: {
            STEP: [
              {
                target: "numb",
                guard: ({ event }) =>
                  event.engineState.numbness >= 0.78 &&
                  event.engineState.altitude <= 0.18,
              },
              {
                target: "flattened",
                guard: ({ event }) =>
                  event.engineState.heaviness >= 0.6 &&
                  event.engineState.inertia >= 0.54,
              },
              {
                target: "heavy",
                guard: ({ event }) =>
                  event.engineState.heaviness >= 0.42 ||
                  event.engineState.load >= 0.4,
              },
            ],
          },
        },

        heavy: {
          on: {
            STEP: [
              {
                target: "numb",
                guard: ({ event }) =>
                  event.engineState.numbness >= 0.72 &&
                  event.engineState.altitude <= 0.18,
              },
              {
                target: "flattened",
                guard: ({ event }) =>
                  event.engineState.heaviness >= 0.58 &&
                  event.engineState.inertia >= 0.5,
              },
              {
                target: "stirring",
                guard: ({ event }) =>
                  event.engineState.peace > 0.2 &&
                  event.engineState.altitude > 0.24 &&
                  event.derivedInput.restoration > 0.28,
              },
              {
                target: "baseline",
                guard: ({ event }) =>
                  event.engineState.heaviness < 0.24 &&
                  event.engineState.load < 0.24 &&
                  event.engineState.peace > 0.38,
              },
            ],
          },
        },

        flattened: {
          on: {
            STEP: [
              {
                target: "numb",
                guard: ({ event }) =>
                  event.engineState.numbness >= 0.72 &&
                  event.engineState.inertia >= 0.58,
              },
              {
                target: "stirring",
                guard: ({ event }) =>
                  event.engineState.heaviness < 0.54 &&
                  event.engineState.inertia < 0.56 &&
                  event.engineState.peace > 0.18,
              },
            ],
          },
        },

        numb: {
          on: {
            STEP: [
              {
                target: "stirring",
                guard: ({ event }) =>
                  event.engineState.numbness < 0.58 &&
                  event.engineState.peace > 0.14 &&
                  event.engineState.altitude > 0.12,
              },
            ],
          },
        },

        stirring: {
          on: {
            STEP: [
              {
                target: "numb",
                guard: ({ event }) =>
                  event.engineState.numbness >= 0.72 &&
                  event.engineState.altitude < 0.18,
              },
              {
                target: "heavy",
                guard: ({ event }) =>
                  event.engineState.heaviness >= 0.46 &&
                  event.engineState.peace < 0.18,
              },
              {
                target: "baseline",
                guard: ({ event }) =>
                  event.engineState.heaviness < 0.24 &&
                  event.engineState.inertia < 0.24 &&
                  event.engineState.peace > 0.38 &&
                  event.engineState.altitude > 0.4,
              },
            ],
          },
        },
      },
    });
  }

  /**
   * Normalize packet shape a bit more strictly.
   *
   * @param {AffectPacket} packet
   * @returns {AffectPacket}
   */
  normalizePacket(packet) {
    const normalized = super.normalizePacket(packet);

    return {
      type: normalized.type,
      value: normalized.value,
      meta: {
        correlationId: normalized.meta?.correlationId ?? null,
        source: normalized.meta?.source ?? null,
        ...normalized.meta,
      },
    };
  }

  /**
   * Depression-specific derived input.
   *
   * Heuristics:
   * - low valence + low dominance + low/moderate arousal => heaviness / flattening
   * - very low arousal + low valence + low dominance => numbness
   * - relief / mobilization require positive valence and some control
   *
   * @param {AffectPacket} packet
   * @returns {DepressionDerivedInput}
   */
  computeDerivedInput(packet) {
    const base = super.computeDerivedInput(packet);
    const m = this.getRegimeModifiers();

    if (!base.hasSignal) {
      return {
        kind: "no-input",
        hasSignal: false,
        valence: 0,
        arousal: 0,
        dominance: 0,
        heavinessCue: 0,
        reliefCue: 0,
        numbnessCue: 0,
        peaceCue: 0,
        mobilizationCue: 0,
        restoration: 0,
      };
    }

    const lowValence = 1 - base.valence;
    const lowDominance = 1 - base.dominance;
    const lowArousal = 1 - base.arousal;

    const heavinessCue = this._clamp01(
      (lowValence * 0.42 + lowDominance * 0.33 + lowArousal * 0.25) *
        m.heavinessGain,
    );

    const reliefCue = this._clamp01(
      base.valence * 0.52 + base.dominance * 0.28 + (1 - base.arousal) * 0.2,
    );

    const numbnessCue = this._clamp01(
      (lowArousal * 0.4 + lowValence * 0.35 + lowDominance * 0.25) *
        m.numbnessGain,
    );

    const peaceCue = this._clamp01(
      ((1 - base.arousal) * 0.4 + base.valence * 0.25 + base.dominance * 0.35) *
        m.peaceGain,
    );

    const mobilizationCue = this._clamp01(
      base.arousal * 0.3 + base.dominance * 0.4 + base.valence * 0.3,
    );

    const restoration = this._clamp01(
      (peaceCue * 0.4 + reliefCue * 0.32 + mobilizationCue * 0.28) *
        m.regulationGain,
    );

    return {
      kind: "affect",
      hasSignal: true,
      valence: base.valence,
      arousal: base.arousal,
      dominance: base.dominance,
      heavinessCue,
      reliefCue,
      numbnessCue,
      peaceCue,
      mobilizationCue,
      restoration,
    };
  }

  /**
   * Reduce one packet-step into the continuous depression state.
   *
   * @param {AffectPacket} packet
   * @param {DepressionDerivedInput} input
   * @returns {void}
   */
  reduce(packet, input) {
    const noInput = !input.hasSignal;
    const m = this.getRegimeModifiers();

    const prevLoad = this.state.load;
    const prevAltitude = this.state.altitude;
    const prevPeace = this.state.peace;
    const prevHeaviness = this.state.heaviness;
    const prevInertia = this.state.inertia;
    const prevNumbness = this.state.numbness;

    if (noInput) {
      // In depression, no-input is ambiguous:
      // it can softly help, but it can also preserve inertia if the system is flattened.
      this.state.load = this._clamp01(
        prevLoad * 0.96 + prevHeaviness * 0.02 + prevInertia * 0.02,
      );

      this.state.heaviness = this._clamp01(
        prevHeaviness * 0.95 + prevInertia * 0.02 * m.heavinessGain,
      );

      this.state.inertia = this._clamp01(
        prevInertia * 0.97 + prevNumbness * 0.015 * m.inertiaGain,
      );

      this.state.numbness = this._clamp01(
        prevNumbness * 0.96 +
          Math.max(0, prevInertia - 0.6) * 0.03 * m.numbnessGain,
      );

      this.state.peace = this._clamp01(
        prevPeace * 0.94 +
          (1 - this.state.load) * 0.03 * m.noInputRecoveryGain +
          (1 - this.state.numbness) * 0.015,
      );

      this.state.altitude = this._clamp01(
        prevAltitude * 0.95 +
          this.state.peace * 0.035 * m.altitudeGain +
          (1 - this.state.heaviness) * 0.01 -
          this.state.inertia * 0.018,
      );

      this.applyRegimeConstraints();
      return;
    }

    this.state.heaviness = this._clamp01(
      prevHeaviness * 0.74 +
        input.heavinessCue * 0.28 * m.heavinessGain +
        input.numbnessCue * 0.06 -
        input.restoration * 0.12 * m.regulationGain,
    );

    this.state.inertia = this._clamp01(
      prevInertia * 0.78 +
        input.heavinessCue * 0.14 * m.inertiaGain +
        input.numbnessCue * 0.18 * m.numbnessGain -
        input.mobilizationCue * 0.1 * m.altitudeGain,
    );

    this.state.numbness = this._clamp01(
      prevNumbness * 0.76 +
        input.numbnessCue * 0.26 * m.numbnessGain +
        this.state.inertia * 0.08 -
        input.restoration * 0.1 * m.regulationGain,
    );

    this.state.load = this._clamp01(
      prevLoad * 0.6 +
        this.state.heaviness * 0.18 +
        this.state.inertia * 0.12 +
        input.heavinessCue * 0.12 * m.heavinessGain -
        input.restoration * 0.12 * m.regulationGain,
    );

    this.state.peace = this._clamp01(
      prevPeace * 0.48 +
        input.restoration * 0.34 * m.peaceGain -
        this.state.heaviness * 0.08 -
        this.state.numbness * 0.06,
    );

    // Depression-specific twist:
    // upward movement depends less on activation spikes and more on gentle mobilization + relief + reduced inertia.
    this.state.altitude = this._clamp01(
      prevAltitude * 0.54 +
        input.mobilizationCue * 0.14 * m.altitudeGain +
        input.reliefCue * 0.12 * m.altitudeGain +
        this.state.peace * 0.14 * m.altitudeGain -
        this.state.heaviness * 0.1 -
        this.state.inertia * 0.12 -
        this.state.numbness * 0.06,
    );

    this.applyRegimeConstraints();
  }

  /**
   * Push one packet-step into the qualitative XState machine.
   *
   * @param {AffectPacket} packet
   * @param {DepressionDerivedInput} derivedInput
   * @returns {void}
   */
  stepStateMachine(packet, derivedInput) {
    this.sendMachineEvent({
      type: "STEP",
      packet,
      derivedInput,
      engineState: { ...this.state },
      tickCount: this.tickCount,
    });
  }

  /**
   * Renderer-facing shared signal surface.
   *
   * @returns {{
   *   regime: string,
   *   load: number,
   *   altitude: number,
   *   peace: number,
   *   activation: number,
   *   constriction: number,
   *   instability: number
   * }}
   */
  getSignals() {
    const input = /** @type {Partial<DepressionDerivedInput> | null} */ (
      this.derivedInput
    );

    const mobilizationCue = input?.mobilizationCue ?? 0;

    return {
      regime: this.getRegime(),

      load: this.state.load,
      altitude: this.state.altitude,
      peace: this.state.peace,

      // Depression activation is low by default; this reflects available movement / rise.
      activation: this._clamp01(
        mobilizationCue * 0.4 +
          this.state.altitude * 0.3 +
          (1 - this.state.inertia) * 0.3,
      ),

      // Constriction is flattened / deadened / stuck.
      constriction: this._clamp01(
        this.state.inertia * 0.55 + this.state.numbness * 0.45,
      ),

      // Depression instability is subtler:
      // fragility of emerging regulation under heaviness/flattening.
      instability: this._clamp01(
        this.state.heaviness * 0.35 +
          this.state.numbness * 0.25 +
          (1 - this.state.peace) * 0.4,
      ),
    };
  }

  /**
   * Optional tighter validation.
   *
   * @param {AffectPacket} packet
   * @returns {void}
   */
  validatePacket(packet) {
    super.validatePacket(packet);

    const validTypes = new Set(["affect", "idle"]);
    if (!validTypes.has(packet.type)) {
      throw new Error(
        `tick(packet): packet.type must be one of ${Array.from(validTypes).join(", ")}.`,
      );
    }
  }

  /**
   * @param {DepressionRegimeName | string} [regime=this.getRegime()]
   * @returns {RegimeInfo}
   */
  getRegimeInfo(regime = this.getRegime()) {
    return (
      DepressionAffectEngine.REGIME_INFO[
        /** @type {DepressionRegimeName} */ (regime)
      ] ?? {
        summary: ["No regime description available"],
        transitionOut: "No transition hint available",
      }
    );
  }

  /**
   * @returns {RegimeModifiers}
   */
  getRegimeModifiers() {
    switch (this.getRegime()) {
      case "baseline":
        return {
          heavinessGain: 1.0,
          inertiaGain: 1.0,
          numbnessGain: 1.0,
          regulationGain: 1.0,
          altitudeGain: 1.0,
          peaceGain: 1.0,
          noInputRecoveryGain: 1.0,
        };

      case "heavy":
        return {
          heavinessGain: 1.08,
          inertiaGain: 1.1,
          numbnessGain: 1.02,
          regulationGain: 0.92,
          altitudeGain: 0.92,
          peaceGain: 0.94,
          noInputRecoveryGain: 0.94,
        };

      case "flattened":
        return {
          heavinessGain: 1.1,
          inertiaGain: 1.18,
          numbnessGain: 1.1,
          regulationGain: 0.8,
          altitudeGain: 0.78,
          peaceGain: 0.84,
          noInputRecoveryGain: 0.88,
        };

      case "numb":
        return {
          heavinessGain: 1.0,
          inertiaGain: 1.12,
          numbnessGain: 1.22,
          regulationGain: 0.64,
          altitudeGain: 0.58,
          peaceGain: 0.72,
          noInputRecoveryGain: 0.8,
        };

      case "stirring":
        return {
          heavinessGain: 0.9,
          inertiaGain: 0.88,
          numbnessGain: 0.86,
          regulationGain: 1.18,
          altitudeGain: 1.14,
          peaceGain: 1.16,
          noInputRecoveryGain: 1.06,
        };

      default:
        return {
          heavinessGain: 1.0,
          inertiaGain: 1.0,
          numbnessGain: 1.0,
          regulationGain: 1.0,
          altitudeGain: 1.0,
          peaceGain: 1.0,
          noInputRecoveryGain: 1.0,
        };
    }
  }

  /**
   * Apply hard/soft caps implied by the current regime.
   *
   * @returns {void}
   */
  applyRegimeConstraints() {
    switch (this.getRegime()) {
      case "heavy": {
        this.state.heaviness = Math.max(this.state.heaviness, 0.18);
        break;
      }

      case "flattened": {
        this.state.peace = Math.min(this.state.peace, 0.5);
        this.state.altitude = Math.min(this.state.altitude, 0.42);
        this.state.inertia = Math.max(this.state.inertia, 0.24);
        break;
      }

      case "numb": {
        this.state.peace = Math.min(this.state.peace, 0.26);
        this.state.altitude = Math.min(this.state.altitude, 0.24);
        this.state.numbness = Math.max(this.state.numbness, 0.42);
        this.state.inertia = Math.max(this.state.inertia, 0.36);
        break;
      }

      case "stirring": {
        this.state.numbness = Math.min(this.state.numbness, 0.72);
        break;
      }

      case "baseline":
      default:
        break;
    }
  }

  /**
   * @param {DepressionRegimeName | string} regime
   * @returns {string[]}
   */
  getRegimeConstraintSummary(regime) {
    switch (regime) {
      case "heavy":
        return [
          "Heaviness is prevented from dropping too quickly",
          "The system remains somewhat weighted even when restoration appears",
        ];

      case "flattened":
        return [
          "Peace and altitude are softly capped",
          "Inertia is prevented from collapsing too quickly",
          "The system resists sudden recovery",
        ];

      case "numb":
        return [
          "Peace and altitude are strongly capped",
          "Numbness and inertia are prevented from dropping too quickly",
          "No-input tends to preserve low-motion flattening",
        ];

      case "stirring":
        return [
          "Numbness is constrained downward",
          "Restorative cues gain more traction than in flattened or numb states",
        ];

      case "baseline":
      default:
        return ["No special caps or amplification are applied"];
    }
  }

  /**
   * @param {DepressionRegimeName | string} prevRegime
   * @param {DepressionRegimeName | string} nextRegime
   * @param {import("xstate").Snapshot<unknown>} snapshot
   * @returns {void}
   */
  onRegimeTransition(prevRegime, nextRegime, snapshot) {
    if (!this.debug) return;

    const s = this.state;
    const info = this.getRegimeInfo(nextRegime);
    const constraints = this.getRegimeConstraintSummary(nextRegime);

    console.log(
      `\x1b[35m[DepressionAffectEngine]\x1b[0m transition: ` +
        `\x1b[36m${prevRegime}\x1b[0m ⇒ \x1b[36m${nextRegime}\x1b[0m`,
    );

    console.log(
      `  {load=${s.load.toFixed(3)} ` +
        `altitude=${s.altitude.toFixed(3)} ` +
        `peace=${s.peace.toFixed(3)} ` +
        `heaviness=${s.heaviness.toFixed(3)} ` +
        `inertia=${s.inertia.toFixed(3)} ` +
        `numbness=${s.numbness.toFixed(3)}}`,
    );

    console.log("  State:");
    for (const line of info.summary) {
      console.log(`    - ${line}`);
    }

    console.log("  Constraints:");
    for (const line of constraints) {
      console.log(`    - ${line}`);
    }

    console.log(`  Transition out: ${info.transitionOut}`);
  }
}
