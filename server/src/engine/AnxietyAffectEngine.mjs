import { createActor, createMachine } from "xstate";
import AbstractAffectEngine from "./AbstractAffectEngine.mjs";

/**
 * @typedef {"calm" | "uneasy" | "anxious" | "spiraling"} AnxietyScenarioName
 */

/**
 * @typedef {"baseline" | "alert" | "spiraling" | "whiteout" | "settling"} AnxietyRegimeName
 */

/**
 * Continuous, engine-owned anxiety state.
 * These values persist across packet ticks.
 *
 * @typedef {object} AnxietyEngineState
 * @property {number} load Broad internal storm pressure / strain.
 * @property {number} altitude Functional clarity / ability to stay upright.
 * @property {number} peace Accumulated regulation / groundedness.
 * @property {number} vigilance Lingering alarm-readiness.
 * @property {number} spiral Recursive destabilization.
 * @property {number} freeze Constriction / shutdown under overload.
 */

/**
 * Scenario seed config.
 *
 * @typedef {object} AnxietyScenarioSeed
 * @property {AnxietyRegimeName} regime
 * @property {Partial<AnxietyEngineState>} state
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
 * @property {number} threatGain
 * @property {number} regulationGain
 * @property {number} vigilanceGain
 * @property {number} spiralGain
 * @property {number} loadGain
 * @property {number} freezeGain
 * @property {number} peaceGain
 * @property {number} altitudeGain
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
 * Anxiety-specific packet interpretation.
 * These values are per-packet cues, not persistent engine memory.
 *
 * @typedef {BaseDerivedInput & {
 *   threatCue: number,
 *   reliefCue: number,
 *   griefCue: number,
 *   shockCue: number,
 *   peaceCue: number,
 *   alarm: number,
 *   destabilization: number,
 *   regulation: number
 * }} AnxietyDerivedInput
 */

/**
 * Public semantic signals emitted to downstream consumers.
 * This intentionally mixes:
 * - persistent engine state
 * - current packet interpretation
 * - a few useful derived composites
 *
 * @typedef {object} AnxietySignals
 * @property {AnxietyRegimeName | string} regime
 * @property {number} load
 * @property {number} altitude
 * @property {number} peace
 * @property {number} vigilance
 * @property {number} spiral
 * @property {number} freeze
 * @property {number} valence
 * @property {number} arousal
 * @property {number} dominance
 * @property {number} threatCue
 * @property {number} reliefCue
 * @property {number} griefCue
 * @property {number} shockCue
 * @property {number} peaceCue
 * @property {number} alarm
 * @property {number} destabilization
 * @property {number} regulation
 * @property {number} instability
 * @property {number} constriction
 * @property {number} recoveryReadiness
 */

/**
 * AnxietyAffectEngine
 *
 * Phenomenological focus:
 * - alarm
 * - vigilance
 * - spiraling
 * - whiteout
 * - settling
 *
 * Core logic:
 * - threat and arousal spike load quickly
 * - low dominance worsens anxiety response
 * - no-input does NOT immediately calm the system
 * - relief / peace help, but only gradually
 */
export default class AnxietyAffectEngine extends AbstractAffectEngine {
  /**
   * @type {Record<AnxietyRegimeName, RegimeInfo>}
   */
  static REGIME_INFO = {
    baseline: {
      summary: [
        "The system is relatively open and responsive",
        "Calming statements can meaningfully reduce load",
        "Altitude and peace can recover at a normal pace",
      ],
      transitionOut: "Sustained threat or rising vigilance",
    },

    alert: {
      summary: [
        "Threat and vigilance amplify incoming stress",
        "Calming statements still help, but less efficiently",
        "The system is biased toward scanning and reactivation",
      ],
      transitionOut: "Either repeated calming inputs, or escalating alarm",
    },

    spiraling: {
      summary: [
        "Recursive destabilization amplifies incoming stress",
        "Calming statements have reduced traction",
        "Spiral and load tend to reinforce each other",
      ],
      transitionOut:
        "Repeated calming statements that reduce spiral and vigilance",
    },

    whiteout: {
      summary: [
        "Calming statements and no-inputs have barely any effect",
        "Load, freeze, and vigilance tend to stay elevated",
        "Peace and altitude are strongly capped and slow to recover",
      ],
      transitionOut: "Repeated calming statements over several packets",
    },

    settling: {
      summary: [
        "Recovery signals are amplified",
        "Spiral and vigilance decay more easily",
        "Altitude and peace can rebuild if stress stays low",
      ],
      transitionOut:
        "Either sustained calm to return to baseline, or renewed alarm",
    },
  };

  /**
   * @param {{
   *   scenario?: AnxietyScenarioName | null,
   *   logger?: { logTick?: (prevPublicState: unknown, nextPublicState: unknown) => void } | null,
   *   debug?: boolean,
   *   [key: string]: unknown
   * }} [config={}]
   */
  constructor(config = {}) {
    super(config);

    const scenario = this.getScenarioState(
      /** @type {AnxietyScenarioName | null | undefined} */ (config.scenario),
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
   * @param {AnxietyScenarioName | null | undefined} name
   * @returns {AnxietyScenarioSeed}
   */
  getScenarioState(name) {
    /** @type {Record<AnxietyScenarioName, AnxietyScenarioSeed>} */
    const scenarios = {
      calm: {
        regime: "baseline",
        state: {
          load: 0.12,
          altitude: 0.68,
          peace: 0.62,
          vigilance: 0.08,
          spiral: 0.02,
          freeze: 0.0,
        },
      },

      uneasy: {
        regime: "alert",
        state: {
          load: 0.32,
          altitude: 0.52,
          peace: 0.34,
          vigilance: 0.38,
          spiral: 0.1,
          freeze: 0.02,
        },
      },

      anxious: {
        regime: "alert",
        state: {
          load: 0.58,
          altitude: 0.34,
          peace: 0.12,
          vigilance: 0.66,
          spiral: 0.24,
          freeze: 0.08,
        },
      },

      spiraling: {
        regime: "spiraling",
        state: {
          load: 0.82,
          altitude: 0.22,
          peace: 0.05,
          vigilance: 0.78,
          spiral: 0.72,
          freeze: 0.14,
        },
      },
    };

    return (
      scenarios[name ?? "calm"] ?? {
        regime: "baseline",
        state: {},
      }
    );
  }

  /**
   * Initial continuous state.
   *
   * @returns {AnxietyEngineState}
   */
  initializeState() {
    return {
      load: 0.2,
      altitude: 0.45,
      peace: 0.25,
      vigilance: 0.2,
      spiral: 0.0,
      freeze: 0.0,
    };
  }

  /**
   * XState machine for qualitative regimes.
   *
   * @param {AnxietyRegimeName} [initial="baseline"]
   * @returns {import("xstate").AnyStateMachine}
   */
  createMachine(initial = "baseline") {
    return createMachine({
      id: "anxietyAffect",
      initial,
      states: {
        baseline: {
          on: {
            STEP: [
              {
                target: "whiteout",
                guard: ({ event }) => event.engineState.load >= 0.92,
              },
              {
                target: "spiraling",
                guard: ({ event }) =>
                  event.engineState.spiral >= 0.65 &&
                  event.engineState.load >= 0.6,
              },
              {
                target: "alert",
                guard: ({ event }) =>
                  event.engineState.vigilance >= 0.45 ||
                  event.derivedInput.threatCue >= 0.4,
              },
            ],
          },
        },

        alert: {
          on: {
            STEP: [
              {
                target: "whiteout",
                guard: ({ event }) => event.engineState.load >= 0.92,
              },
              {
                target: "spiraling",
                guard: ({ event }) =>
                  event.engineState.spiral >= 0.62 &&
                  event.derivedInput.arousal >= 0.65,
              },
              {
                target: "baseline",
                guard: ({ event }) =>
                  event.engineState.vigilance < 0.28 &&
                  event.engineState.load < 0.35 &&
                  event.engineState.peace > 0.45,
              },
            ],
          },
        },

        spiraling: {
          on: {
            STEP: [
              {
                target: "whiteout",
                guard: ({ event }) => event.engineState.load >= 0.92,
              },
              {
                target: "settling",
                guard: ({ event }) =>
                  event.engineState.spiral < 0.35 &&
                  event.engineState.vigilance < 0.55 &&
                  event.engineState.peace > 0.3,
              },
            ],
          },
        },

        whiteout: {
          on: {
            STEP: [
              {
                target: "settling",
                guard: ({ event }) =>
                  event.engineState.load < 0.72 &&
                  event.derivedInput.arousal < 0.58,
              },
            ],
          },
        },

        settling: {
          on: {
            STEP: [
              {
                target: "whiteout",
                guard: ({ event }) => event.engineState.load >= 0.92,
              },
              {
                target: "spiraling",
                guard: ({ event }) =>
                  event.engineState.spiral >= 0.6 &&
                  event.derivedInput.arousal >= 0.65,
              },
              {
                target: "alert",
                guard: ({ event }) =>
                  event.engineState.vigilance >= 0.48 ||
                  event.derivedInput.threatCue >= 0.45,
              },
              {
                target: "baseline",
                guard: ({ event }) =>
                  event.engineState.peace > 0.62 &&
                  event.engineState.vigilance < 0.22 &&
                  event.engineState.load < 0.28,
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
   * Anxiety-specific derived input.
   *
   * We keep the base VAD derivation, then add a few
   * anxiety-centered packet cues.
   *
   * @param {AffectPacket} packet
   * @returns {AnxietyDerivedInput}
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
        threatCue: 0,
        reliefCue: 0,
        griefCue: 0,
        shockCue: 0,
        peaceCue: 0,
        alarm: 0,
        destabilization: 0,
        regulation: 0,
      };
    }

    const lowValence = 1 - base.valence;
    const lowDominance = 1 - base.dominance;

    const threatCue = this._clamp01(
      (base.arousal * 0.5 + lowDominance * 0.35 + lowValence * 0.15) *
        m.threatGain,
    );

    const reliefCue = this._clamp01(
      base.valence * 0.55 + base.dominance * 0.3 + (1 - base.arousal) * 0.15,
    );

    const griefCue = this._clamp01(
      lowValence * 0.55 + lowDominance * 0.25 + (1 - base.arousal) * 0.2,
    );

    const shockCue = this._clamp01(
      base.arousal * 0.6 +
        lowDominance * 0.25 +
        Math.max(0, 0.5 - base.valence) * 0.15,
    );

    const peaceCue = this._clamp01(
      ((1 - base.arousal) * 0.45 + base.dominance * 0.35 + base.valence * 0.2) *
        m.peaceGain,
    );

    const alarm = this._clamp01(
      threatCue * 0.6 + base.arousal * 0.25 + lowDominance * 0.15,
    );

    const destabilization = this._clamp01(
      base.arousal * 0.45 + shockCue * 0.3 + lowDominance * 0.25,
    );

    const regulation = this._clamp01(
      (peaceCue * 0.6 + reliefCue * 0.25 + base.dominance * 0.15) *
        m.regulationGain,
    );

    return {
      kind: "affect",
      hasSignal: true,
      valence: base.valence,
      arousal: base.arousal,
      dominance: base.dominance,
      threatCue,
      reliefCue,
      griefCue,
      shockCue,
      peaceCue,
      alarm,
      destabilization,
      regulation,
    };
  }

  /**
   * Reduce one packet-step into the continuous anxiety state.
   *
   * @param {AffectPacket} packet
   * @param {AnxietyDerivedInput} input
   * @returns {void}
   */
  reduce(packet, input) {
    const noInput = !input.hasSignal;
    const m = this.getRegimeModifiers();

    const prevLoad = this.state.load;
    const prevVigilance = this.state.vigilance;
    const prevSpiral = this.state.spiral;
    const prevFreeze = this.state.freeze;
    const prevPeace = this.state.peace;
    const prevAltitude = this.state.altitude;

    if (noInput) {
      this.state.load = this._clamp01(
        prevLoad * 0.93 +
          prevVigilance * 0.04 * m.loadGain +
          prevSpiral * 0.03 * m.spiralGain,
      );

      this.state.vigilance = this._clamp01(
        prevVigilance * 0.96 + prevSpiral * 0.02 * m.vigilanceGain,
      );

      this.state.spiral = this._clamp01(
        prevSpiral * 0.91 + prevVigilance * 0.03 * m.spiralGain,
      );

      this.state.freeze = this._clamp01(
        prevFreeze * 0.94 + Math.max(0, prevLoad - 0.78) * 0.12 * m.freezeGain,
      );

      this.state.peace = this._clamp01(
        prevPeace * 0.9 +
          (1 - this.state.load) * 0.05 * m.noInputRecoveryGain +
          (1 - this.state.vigilance) * 0.01,
      );

      this.state.altitude = this._clamp01(
        prevAltitude * 0.96 +
          this.state.peace * 0.04 * m.altitudeGain -
          this.state.freeze * 0.02,
      );

      this.applyRegimeConstraints();
      return;
    }

    const lowDominance = 1 - input.dominance;

    this.state.vigilance = this._clamp01(
      prevVigilance * 0.72 +
        input.alarm * 0.48 * m.vigilanceGain +
        lowDominance * 0.1,
    );

    this.state.spiral = this._clamp01(
      prevSpiral * 0.68 +
        input.destabilization * 0.42 * m.spiralGain +
        this.state.vigilance * 0.12 -
        input.regulation * 0.14 * m.regulationGain,
    );

    this.state.load = this._clamp01(
      prevLoad * 0.52 +
        input.alarm * 0.34 * m.loadGain +
        this.state.spiral * 0.18 * m.spiralGain +
        lowDominance * 0.08 -
        input.regulation * 0.16 * m.regulationGain,
    );

    this.state.freeze = this._clamp01(
      prevFreeze * 0.7 +
        Math.max(0, this.state.load - 0.72) * 0.55 * m.freezeGain +
        Math.max(0, this.state.spiral - 0.6) * 0.2 * m.freezeGain,
    );

    this.state.peace = this._clamp01(
      prevPeace * 0.48 +
        input.regulation * 0.38 * m.peaceGain -
        this.state.vigilance * 0.12 -
        this.state.spiral * 0.08,
    );

    this.state.altitude = this._clamp01(
      prevAltitude * 0.56 +
        input.dominance * 0.18 * m.altitudeGain +
        input.reliefCue * 0.14 * m.altitudeGain +
        this.state.peace * 0.16 * m.altitudeGain -
        this.state.load * 0.1 -
        this.state.freeze * 0.08,
    );

    this.applyRegimeConstraints();
  }

  /**
   * Push one packet-step into the qualitative XState machine.
   *
   * @param {AffectPacket} packet
   * @param {AnxietyDerivedInput} derivedInput
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
   * Renderer-agnostic semantic output signals.
   *
   * These are the values that downstream consumers
   * (frontend visuals, MaxMSP audio, debug tools)
   * can map however they want.
   *
   * @returns {AnxietySignals}
   */
  getSignals() {
    const input = /** @type {Partial<AnxietyDerivedInput> | null} */ (
      this.derivedInput
    );

    const valence = input?.valence ?? 0;
    const arousal = input?.arousal ?? 0;
    const dominance = input?.dominance ?? 0;
    const threatCue = input?.threatCue ?? 0;
    const reliefCue = input?.reliefCue ?? 0;
    const griefCue = input?.griefCue ?? 0;
    const shockCue = input?.shockCue ?? 0;
    const peaceCue = input?.peaceCue ?? 0;
    const alarm = input?.alarm ?? 0;
    const destabilization = input?.destabilization ?? 0;
    const regulation = input?.regulation ?? 0;

    return {
      regime: this.getRegime(),

      load: this.state.load,
      altitude: this.state.altitude,
      peace: this.state.peace,
      vigilance: this.state.vigilance,
      spiral: this.state.spiral,
      freeze: this.state.freeze,

      valence,
      arousal,
      dominance,
      threatCue,
      reliefCue,
      griefCue,
      shockCue,
      peaceCue,
      alarm,
      destabilization,
      regulation,

      instability: this._clamp01(
        this.state.spiral * 0.6 + this.state.vigilance * 0.4,
      ),
      constriction: this._clamp01(
        this.state.freeze * 0.7 + (1 - dominance) * 0.3,
      ),
      recoveryReadiness: this._clamp01(
        this.state.peace * 0.5 + this.state.altitude * 0.3 + dominance * 0.2,
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
   * @param {AnxietyRegimeName | string} [regime=this.getRegime()]
   * @returns {RegimeInfo}
   */
  getRegimeInfo(regime = this.getRegime()) {
    return (
      AnxietyAffectEngine.REGIME_INFO[
        /** @type {AnxietyRegimeName} */ (regime)
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
          threatGain: 1.0,
          regulationGain: 1.0,
          vigilanceGain: 1.0,
          spiralGain: 1.0,
          loadGain: 1.0,
          freezeGain: 1.0,
          peaceGain: 1.0,
          altitudeGain: 1.0,
          noInputRecoveryGain: 1.0,
        };

      case "alert":
        return {
          threatGain: 1.08,
          regulationGain: 0.95,
          vigilanceGain: 1.12,
          spiralGain: 1.08,
          loadGain: 1.08,
          freezeGain: 1.0,
          peaceGain: 0.94,
          altitudeGain: 0.95,
          noInputRecoveryGain: 0.92,
        };

      case "spiraling":
        return {
          threatGain: 1.1,
          regulationGain: 0.9,
          vigilanceGain: 1.12,
          spiralGain: 1.28,
          loadGain: 1.18,
          freezeGain: 1.08,
          peaceGain: 0.95,
          altitudeGain: 0.92,
          noInputRecoveryGain: 1.1,
        };

      case "whiteout":
        return {
          threatGain: 1.02,
          regulationGain: 0.52,
          vigilanceGain: 1.05,
          spiralGain: 0.92,
          loadGain: 1.05,
          freezeGain: 1.28,
          peaceGain: 0.55,
          altitudeGain: 0.62,
          noInputRecoveryGain: 0.5,
        };

      case "settling":
        return {
          threatGain: 0.92,
          regulationGain: 1.22,
          vigilanceGain: 0.9,
          spiralGain: 0.82,
          loadGain: 0.9,
          freezeGain: 0.9,
          peaceGain: 1.15,
          altitudeGain: 1.1,
          noInputRecoveryGain: 1.18,
        };

      default:
        return {
          threatGain: 1.0,
          regulationGain: 1.0,
          vigilanceGain: 1.0,
          spiralGain: 1.0,
          loadGain: 1.0,
          freezeGain: 1.0,
          peaceGain: 1.0,
          altitudeGain: 1.0,
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
      case "whiteout": {
        this.state.peace = Math.min(this.state.peace, 0.3);
        this.state.altitude = Math.min(this.state.altitude, 0.4);
        this.state.vigilance = Math.max(this.state.vigilance, 0.45);
        this.state.load = Math.max(this.state.load, 0.55);
        break;
      }

      case "spiraling": {
        this.state.peace = Math.min(this.state.peace, 0.55);
        this.state.spiral = Math.max(this.state.spiral, 0.22);
        break;
      }

      case "alert": {
        this.state.vigilance = Math.max(this.state.vigilance, 0.18);
        break;
      }

      case "settling": {
        this.state.spiral = Math.min(this.state.spiral, 0.75);
        break;
      }

      case "baseline":
      default:
        break;
    }
  }

  /**
   * @param {AnxietyRegimeName | string} regime
   * @returns {string[]}
   */
  getRegimeConstraintSummary(regime) {
    switch (regime) {
      case "whiteout":
        return [
          "Calming statements and no-inputs have barely any effect",
          "Load and vigilance are prevented from dropping too low",
          "Peace and altitude are capped and recover very slowly",
        ];

      case "spiraling":
        return [
          "Recursive destabilization keeps amplifying pressure",
          "Peace cannot rise freely while spiral remains active",
          "Spiral is prevented from collapsing too quickly",
        ];

      case "alert":
        return [
          "The system remains biased toward vigilance",
          "Threat is interpreted more aggressively than in baseline",
        ];

      case "settling":
        return [
          "Recovery signals gain traction",
          "Spiral is softly constrained downward",
        ];

      case "baseline":
      default:
        return ["No special caps or amplification are applied"];
    }
  }

  /**
   * @param {AnxietyRegimeName | string} prevRegime
   * @param {AnxietyRegimeName | string} nextRegime
   * @param {import("xstate").Snapshot<unknown>} snapshot
   * @returns {void}
   */
  onRegimeTransition(prevRegime, nextRegime, snapshot) {
    if (!this.debug) return;

    const s = this.state;
    const info = this.getRegimeInfo(nextRegime);
    const constraints = this.getRegimeConstraintSummary(nextRegime);

    console.log(
      `\x1b[35m[AnxietyAffectEngine]\x1b[0m transition: ` +
        `\x1b[36m${prevRegime}\x1b[0m ⇒ \x1b[36m${nextRegime}\x1b[0m`,
    );

    console.log(
      `  {load=${s.load.toFixed(3)} ` +
        `peace=${s.peace.toFixed(3)} ` +
        `vigilance=${s.vigilance.toFixed(3)} ` +
        `spiral=${s.spiral.toFixed(3)} ` +
        `freeze=${s.freeze.toFixed(3)}}`,
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

  /**
   * Clamp to [-1, 1] for signed output parameters like smile curvature.
   *
   * @param {number} value
   * @returns {number}
   */
  _clampSigned(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(-1, Math.min(1, value));
  }
}
