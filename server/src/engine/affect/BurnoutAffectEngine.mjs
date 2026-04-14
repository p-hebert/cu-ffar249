import { createActor, createMachine } from "xstate";
import AbstractAffectEngine from "./AbstractAffectEngine.mjs";

/**
 * @typedef {"rested" | "loaded" | "burnt" | "crashing"} BurnoutScenarioName
 */

/**
 * @typedef {"baseline" | "driving" | "strained" | "crashing" | "recovering"} BurnoutRegimeName
 */

/**
 * Continuous, engine-owned burnout state.
 * These values persist across packet ticks.
 *
 * @typedef {object} BurnoutEngineState
 * @property {number} load Broad internal strain / burden.
 * @property {number} altitude Functional clarity / ability to rise.
 * @property {number} peace Accumulated regulation / groundedness.
 * @property {number} fatigue Metabolic depletion / exhaustion.
 * @property {number} overdrive Momentum of effortful pushing.
 * @property {number} crashPressure Latent pressure toward collapse.
 */

/**
 * Scenario seed config.
 *
 * @typedef {object} BurnoutScenarioSeed
 * @property {BurnoutRegimeName} regime
 * @property {Partial<BurnoutEngineState>} state
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
 * @property {number} effortGain
 * @property {number} regulationGain
 * @property {number} fatigueGain
 * @property {number} loadGain
 * @property {number} altitudeGain
 * @property {number} peaceGain
 * @property {number} crashGain
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
 * Burnout-specific packet interpretation.
 * These are per-packet cues, not persistent engine memory.
 *
 * @typedef {BaseDerivedInput & {
 *   effortCue: number,
 *   reliefCue: number,
 *   depletionCue: number,
 *   peaceCue: number,
 *   selfPressureCue: number,
 *   overexertion: number,
 *   restoration: number
 * }} BurnoutDerivedInput
 */

/**
 * Public semantic signals emitted to downstream consumers.
 *
 * @typedef {object} BurnoutSignals
 * @property {BurnoutRegimeName | string} regime
 * @property {number} load
 * @property {number} altitude
 * @property {number} peace
 * @property {number} fatigue
 * @property {number} overdrive
 * @property {number} crashPressure
 * @property {number} valence
 * @property {number} arousal
 * @property {number} dominance
 * @property {number} effortCue
 * @property {number} reliefCue
 * @property {number} depletionCue
 * @property {number} peaceCue
 * @property {number} selfPressureCue
 * @property {number} overexertion
 * @property {number} restoration
 * @property {number} fragility
 * @property {number} recoveryReadiness
 * @property {number} pushCapacity
 */

/**
 * BurnoutAffectEngine
 *
 * Phenomenological focus:
 * - pushing
 * - depletion
 * - short-term climb, hidden cost
 * - crashing
 * - gradual recovery
 *
 * Core logic:
 * - high arousal + low control can temporarily raise altitude
 * - but repeated effort accumulates fatigue and crash pressure
 * - no-input helps, but recovery is slower than release from anxiety
 * - burnout is about the cost of "getting back up too fast"
 */
export default class BurnoutAffectEngine extends AbstractAffectEngine {
  /**
   * @type {Record<BurnoutRegimeName, RegimeInfo>}
   */
  static REGIME_INFO = {
    baseline: {
      summary: [
        "The system is functional and not yet overcommitted",
        "Effort can still raise altitude without too much hidden cost",
        "Recovery signals can meaningfully restore capacity",
      ],
      transitionOut: "Sustained effort, rising fatigue, or mounting strain",
    },

    driving: {
      summary: [
        "The system is pushing upward through effort and activation",
        "Altitude can rise temporarily, but hidden fatigue accumulates",
        "Restoration helps less because forward drive dominates",
      ],
      transitionOut:
        "Either continued overexertion into strain, or a deliberate slowdown",
    },

    strained: {
      summary: [
        "Load and fatigue are both elevated",
        "Further effort still works a little, but at a much steeper cost",
        "Recovery is possible, but overexertion easily reactivates collapse pressure",
      ],
      transitionOut: "Repeated restoration, or a final push into crash",
    },

    crashing: {
      summary: [
        "The system is no longer converting effort into meaningful progress",
        "Altitude is capped, while fatigue and collapse pressure stay high",
        "No-input and calming input help only slowly at first",
      ],
      transitionOut: "Repeated restorative packets over several steps",
    },

    recovering: {
      summary: [
        "Fatigue and crash pressure can finally unwind",
        "Peace and altitude can rebuild if effort stays moderate",
        "The system is vulnerable to slipping back into overdrive",
      ],
      transitionOut: "Either sustained quiet into baseline, or renewed pushing",
    },
  };

  /**
   * @param {{
   *   scenario?: BurnoutScenarioName | null,
   *   logger?: { logTick?: (prevPublicState: unknown, nextPublicState: unknown) => void } | null,
   *   debug?: boolean,
   *   [key: string]: unknown
   * }} [config={}]
   */
  constructor(config = {}) {
    super(config);

    const scenario = this.getScenarioState(
      /** @type {BurnoutScenarioName | null | undefined} */ (config.scenario),
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
   * @param {BurnoutScenarioName | null | undefined} name
   * @returns {BurnoutScenarioSeed}
   */
  getScenarioState(name) {
    /** @type {Record<BurnoutScenarioName, BurnoutScenarioSeed>} */
    const scenarios = {
      rested: {
        regime: "baseline",
        state: {
          load: 0.18,
          altitude: 0.6,
          peace: 0.52,
          fatigue: 0.14,
          overdrive: 0.08,
          crashPressure: 0.04,
        },
      },

      loaded: {
        regime: "driving",
        state: {
          load: 0.46,
          altitude: 0.48,
          peace: 0.24,
          fatigue: 0.42,
          overdrive: 0.38,
          crashPressure: 0.22,
        },
      },

      burnt: {
        regime: "strained",
        state: {
          load: 0.68,
          altitude: 0.28,
          peace: 0.12,
          fatigue: 0.72,
          overdrive: 0.32,
          crashPressure: 0.48,
        },
      },

      crashing: {
        regime: "crashing",
        state: {
          load: 0.84,
          altitude: 0.16,
          peace: 0.05,
          fatigue: 0.86,
          overdrive: 0.18,
          crashPressure: 0.78,
        },
      },
    };

    return (
      scenarios[name ?? "rested"] ?? {
        regime: "baseline",
        state: {},
      }
    );
  }

  /**
   * Initial continuous state.
   *
   * @returns {BurnoutEngineState}
   */
  initializeState() {
    return {
      load: 0.2,
      altitude: 0.48,
      peace: 0.28,
      fatigue: 0.22,
      overdrive: 0.1,
      crashPressure: 0.08,
    };
  }

  /**
   * XState machine for qualitative regimes.
   *
   * @param {BurnoutRegimeName} [initial="baseline"]
   * @returns {import("xstate").AnyStateMachine}
   */
  createMachine(initial = "baseline") {
    return createMachine({
      id: "burnoutAffect",
      initial,
      states: {
        baseline: {
          on: {
            STEP: [
              {
                target: "crashing",
                guard: ({ event }) =>
                  event.engineState.crashPressure >= 0.88 &&
                  event.engineState.fatigue >= 0.8,
              },
              {
                target: "strained",
                guard: ({ event }) =>
                  event.engineState.load >= 0.62 &&
                  event.engineState.fatigue >= 0.58,
              },
              {
                target: "driving",
                guard: ({ event }) =>
                  event.derivedInput.effortCue >= 0.52 ||
                  event.engineState.overdrive >= 0.38,
              },
            ],
          },
        },

        driving: {
          on: {
            STEP: [
              {
                target: "crashing",
                guard: ({ event }) =>
                  event.engineState.crashPressure >= 0.86 &&
                  event.engineState.fatigue >= 0.72,
              },
              {
                target: "strained",
                guard: ({ event }) =>
                  event.engineState.load >= 0.6 &&
                  event.engineState.fatigue >= 0.6,
              },
              {
                target: "baseline",
                guard: ({ event }) =>
                  event.engineState.overdrive < 0.18 &&
                  event.engineState.load < 0.3 &&
                  event.engineState.peace > 0.42,
              },
            ],
          },
        },

        strained: {
          on: {
            STEP: [
              {
                target: "crashing",
                guard: ({ event }) =>
                  event.engineState.crashPressure >= 0.78 ||
                  (event.engineState.fatigue >= 0.72 &&
                    event.engineState.altitude < 0.24),
              },
              {
                target: "recovering",
                guard: ({ event }) =>
                  event.engineState.fatigue < 0.52 &&
                  event.engineState.load < 0.42 &&
                  event.engineState.peace > 0.28,
              },
            ],
          },
        },

        crashing: {
          on: {
            STEP: [
              {
                target: "recovering",
                guard: ({ event }) =>
                  event.engineState.crashPressure < 0.52 &&
                  event.engineState.fatigue < 0.7 &&
                  event.engineState.peace > 0.18,
              },
            ],
          },
        },

        recovering: {
          on: {
            STEP: [
              {
                target: "crashing",
                guard: ({ event }) =>
                  event.engineState.crashPressure >= 0.82 &&
                  event.engineState.fatigue >= 0.72,
              },
              {
                target: "driving",
                guard: ({ event }) =>
                  event.derivedInput.overexertion >= 0.6 &&
                  event.engineState.overdrive >= 0.34,
              },
              {
                target: "baseline",
                guard: ({ event }) =>
                  event.engineState.fatigue < 0.28 &&
                  event.engineState.load < 0.24 &&
                  event.engineState.peace > 0.46,
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
   * Burnout-specific derived input.
   *
   * We derive burnout semantics from VAD:
   * - high arousal + decent dominance can feel like "push"
   * - high arousal + low valence/low dominance becomes costly overexertion
   * - restoration comes from lower arousal + higher dominance + positive valence
   *
   * @param {AffectPacket} packet
   * @returns {BurnoutDerivedInput}
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
        effortCue: 0,
        reliefCue: 0,
        depletionCue: 0,
        peaceCue: 0,
        selfPressureCue: 0,
        overexertion: 0,
        restoration: 0,
      };
    }

    const lowValence = 1 - base.valence;
    const lowDominance = 1 - base.dominance;

    // "Effort" can be somewhat positive in burnout:
    // activated + some sense of control = ability to push.
    const effortCue = this._clamp01(
      (base.arousal * 0.45 + base.dominance * 0.35 + base.valence * 0.2) *
        m.effortGain,
    );

    const reliefCue = this._clamp01(
      base.valence * 0.55 + (1 - base.arousal) * 0.2 + base.dominance * 0.25,
    );

    const depletionCue = this._clamp01(
      lowValence * 0.4 + lowDominance * 0.35 + base.arousal * 0.25,
    );

    const peaceCue = this._clamp01(
      ((1 - base.arousal) * 0.45 + base.valence * 0.25 + base.dominance * 0.3) *
        m.peaceGain,
    );

    const selfPressureCue = this._clamp01(
      base.arousal * 0.45 + lowValence * 0.3 + lowDominance * 0.25,
    );

    // Overexertion is the key burnout signal:
    // effort under depleted/strained conditions becomes costly.
    const overexertion = this._clamp01(
      effortCue * 0.35 + selfPressureCue * 0.4 + depletionCue * 0.25,
    );

    const restoration = this._clamp01(
      (peaceCue * 0.45 + reliefCue * 0.3 + base.dominance * 0.25) *
        m.regulationGain,
    );

    return {
      kind: "affect",
      hasSignal: true,
      valence: base.valence,
      arousal: base.arousal,
      dominance: base.dominance,
      effortCue,
      reliefCue,
      depletionCue,
      peaceCue,
      selfPressureCue,
      overexertion,
      restoration,
    };
  }

  /**
   * Reduce one packet-step into the continuous burnout state.
   *
   * @param {AffectPacket} packet
   * @param {BurnoutDerivedInput} input
   * @returns {void}
   */
  reduce(packet, input) {
    const noInput = !input.hasSignal;
    const m = this.getRegimeModifiers();

    const prevLoad = this.state.load;
    const prevAltitude = this.state.altitude;
    const prevPeace = this.state.peace;
    const prevFatigue = this.state.fatigue;
    const prevOverdrive = this.state.overdrive;
    const prevCrashPressure = this.state.crashPressure;

    if (noInput) {
      // Quiet helps, but burnout recovery is slower and more metabolic than anxiety.
      this.state.load = this._clamp01(
        prevLoad * 0.94 +
          prevFatigue * 0.03 * m.loadGain +
          prevCrashPressure * 0.03 * m.crashGain,
      );

      this.state.fatigue = this._clamp01(
        prevFatigue * 0.96 + prevOverdrive * 0.02 * m.fatigueGain,
      );

      this.state.overdrive = this._clamp01(prevOverdrive * 0.9);

      this.state.crashPressure = this._clamp01(
        prevCrashPressure * 0.94 +
          Math.max(0, prevFatigue - 0.68) * 0.04 * m.crashGain,
      );

      this.state.peace = this._clamp01(
        prevPeace * 0.93 +
          (1 - this.state.load) * 0.04 * m.noInputRecoveryGain +
          (1 - this.state.fatigue) * 0.03 * m.noInputRecoveryGain,
      );

      this.state.altitude = this._clamp01(
        prevAltitude * 0.95 +
          this.state.peace * 0.05 * m.altitudeGain +
          (1 - this.state.load) * 0.015 -
          this.state.fatigue * 0.02,
      );

      this.applyRegimeConstraints();
      return;
    }

    // Overdrive rises from effortful packets. It can help altitude briefly,
    // but also contributes hidden cost.
    this.state.overdrive = this._clamp01(
      prevOverdrive * 0.68 +
        input.effortCue * 0.34 * m.effortGain +
        input.overexertion * 0.12,
    );

    // Fatigue is the key long-term burden in burnout.
    this.state.fatigue = this._clamp01(
      prevFatigue * 0.74 +
        input.overexertion * 0.34 * m.fatigueGain +
        input.depletionCue * 0.18 -
        input.restoration * 0.12 * m.regulationGain,
    );

    this.state.load = this._clamp01(
      prevLoad * 0.58 +
        input.overexertion * 0.28 * m.loadGain +
        this.state.fatigue * 0.14 * m.fatigueGain +
        input.selfPressureCue * 0.1 -
        input.restoration * 0.14 * m.regulationGain,
    );

    this.state.crashPressure = this._clamp01(
      prevCrashPressure * 0.7 +
        Math.max(0, this.state.fatigue - 0.52) * 0.24 * m.crashGain +
        Math.max(0, this.state.load - 0.56) * 0.2 * m.crashGain +
        this.state.overdrive * 0.1,
    );

    this.state.peace = this._clamp01(
      prevPeace * 0.46 +
        input.restoration * 0.38 * m.peaceGain -
        this.state.load * 0.1 -
        this.state.crashPressure * 0.08,
    );

    // Burnout-specific twist:
    // effort can boost altitude briefly, but fatigue/load/crash pressure drag it down.
    this.state.altitude = this._clamp01(
      prevAltitude * 0.52 +
        this.state.overdrive * 0.2 * m.altitudeGain +
        input.reliefCue * 0.1 * m.altitudeGain +
        this.state.peace * 0.14 * m.altitudeGain -
        this.state.load * 0.1 -
        this.state.fatigue * 0.12 -
        this.state.crashPressure * 0.08,
    );

    this.applyRegimeConstraints();
  }

  /**
   * Push one packet-step into the qualitative XState machine.
   *
   * @param {AffectPacket} packet
   * @param {BurnoutDerivedInput} derivedInput
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
    const input = /** @type {Partial<BurnoutDerivedInput> | null} */ (
      this.derivedInput
    );

    const arousal = input?.arousal ?? 0;

    return {
      regime: this.getRegime(),

      load: this.state.load,
      altitude: this.state.altitude,
      peace: this.state.peace,

      // Burnout activation is "push" / overdrive more than raw arousal.
      activation: this._clamp01(this.state.overdrive * 0.7 + arousal * 0.3),

      // Constriction is exhausted narrowing / reduced capacity.
      constriction: this._clamp01(
        this.state.fatigue * 0.6 + this.state.crashPressure * 0.4,
      ),

      // Instability is relapse risk / wobble between pushing and collapse.
      instability: this._clamp01(
        this.state.crashPressure * 0.65 + this.state.overdrive * 0.35,
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
   * @param {BurnoutRegimeName | string} [regime=this.getRegime()]
   * @returns {RegimeInfo}
   */
  getRegimeInfo(regime = this.getRegime()) {
    return (
      BurnoutAffectEngine.REGIME_INFO[
        /** @type {BurnoutRegimeName} */ (regime)
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
          effortGain: 1.0,
          regulationGain: 1.0,
          fatigueGain: 1.0,
          loadGain: 1.0,
          altitudeGain: 1.0,
          peaceGain: 1.0,
          crashGain: 1.0,
          noInputRecoveryGain: 1.0,
        };

      case "driving":
        return {
          effortGain: 1.18,
          regulationGain: 0.88,
          fatigueGain: 1.14,
          loadGain: 1.08,
          altitudeGain: 1.08,
          peaceGain: 0.9,
          crashGain: 1.08,
          noInputRecoveryGain: 0.88,
        };

      case "strained":
        return {
          effortGain: 0.98,
          regulationGain: 0.82,
          fatigueGain: 1.2,
          loadGain: 1.16,
          altitudeGain: 0.84,
          peaceGain: 0.86,
          crashGain: 1.18,
          noInputRecoveryGain: 0.92,
        };

      case "crashing":
        return {
          effortGain: 0.7,
          regulationGain: 0.62,
          fatigueGain: 1.1,
          loadGain: 1.08,
          altitudeGain: 0.58,
          peaceGain: 0.7,
          crashGain: 1.22,
          noInputRecoveryGain: 0.78,
        };

      case "recovering":
        return {
          effortGain: 0.88,
          regulationGain: 1.18,
          fatigueGain: 0.88,
          loadGain: 0.9,
          altitudeGain: 1.1,
          peaceGain: 1.15,
          crashGain: 0.86,
          noInputRecoveryGain: 1.16,
        };

      default:
        return {
          effortGain: 1.0,
          regulationGain: 1.0,
          fatigueGain: 1.0,
          loadGain: 1.0,
          altitudeGain: 1.0,
          peaceGain: 1.0,
          crashGain: 1.0,
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
      case "driving": {
        this.state.overdrive = Math.max(this.state.overdrive, 0.16);
        break;
      }

      case "strained": {
        this.state.peace = Math.min(this.state.peace, 0.58);
        this.state.fatigue = Math.max(this.state.fatigue, 0.34);
        break;
      }

      case "crashing": {
        this.state.altitude = Math.min(this.state.altitude, 0.32);
        this.state.peace = Math.min(this.state.peace, 0.26);
        this.state.fatigue = Math.max(this.state.fatigue, 0.58);
        this.state.crashPressure = Math.max(this.state.crashPressure, 0.42);
        break;
      }

      case "recovering": {
        this.state.overdrive = Math.min(this.state.overdrive, 0.56);
        break;
      }

      case "baseline":
      default:
        break;
    }
  }

  /**
   * @param {BurnoutRegimeName | string} regime
   * @returns {string[]}
   */
  getRegimeConstraintSummary(regime) {
    switch (regime) {
      case "driving":
        return [
          "The system stays partially committed to forward effort",
          "Overdrive is prevented from dropping too quickly",
        ];

      case "strained":
        return [
          "Peace is softly capped while strain remains active",
          "Fatigue is prevented from dropping below a moderate floor",
        ];

      case "crashing":
        return [
          "Altitude and peace are strongly capped",
          "Fatigue and crash pressure are prevented from dropping too quickly",
          "Effort no longer converts well into upward movement",
        ];

      case "recovering":
        return [
          "Overdrive is constrained downward",
          "Restorative inputs gain more traction than in strained or crashing states",
        ];

      case "baseline":
      default:
        return ["No special caps or amplification are applied"];
    }
  }

  /**
   * @param {BurnoutRegimeName | string} prevRegime
   * @param {BurnoutRegimeName | string} nextRegime
   * @param {import("xstate").Snapshot<unknown>} snapshot
   * @returns {void}
   */
  onRegimeTransition(prevRegime, nextRegime, snapshot) {
    if (!this.debug) return;

    const s = this.state;
    const info = this.getRegimeInfo(nextRegime);
    const constraints = this.getRegimeConstraintSummary(nextRegime);

    console.log(
      `\x1b[35m[BurnoutAffectEngine]\x1b[0m transition: ` +
        `\x1b[36m${prevRegime}\x1b[0m ⇒ \x1b[36m${nextRegime}\x1b[0m`,
    );

    console.log(
      `  {load=${s.load.toFixed(3)} ` +
        `altitude=${s.altitude.toFixed(3)} ` +
        `peace=${s.peace.toFixed(3)} ` +
        `fatigue=${s.fatigue.toFixed(3)} ` +
        `overdrive=${s.overdrive.toFixed(3)} ` +
        `crashPressure=${s.crashPressure.toFixed(3)}}`,
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
