import { createActor, createMachine } from "xstate";
import AbstractAffectEngine from "./AbstractAffectEngine.mjs";

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

  constructor(config = {}) {
    super(config);

    const scenario = this.getScenarioState(config.scenario);

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

    this.state.regime = this.getRegime();
    this._lastMachineStateValue = this.getRegime();
  }

  getScenarioState(name) {
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
          threat: 0.05,
          arousal: 0.18,
          dominance: 0.7,
          valence: 0.62,
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
          threat: 0.32,
          arousal: 0.46,
          dominance: 0.44,
          valence: 0.46,
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
          threat: 0.58,
          arousal: 0.74,
          dominance: 0.24,
          valence: 0.28,
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
          threat: 0.7,
          arousal: 0.84,
          dominance: 0.16,
          valence: 0.22,
        },
      },
    };

    return (
      scenarios[name] ?? {
        regime: "baseline",
        state: {},
      }
    );
  }

  /**
   * Initial continuous state.
   *
   * @returns {object}
   */
  initializeState() {
    return {
      load: 0.2, // total internal strain
      altitude: 0.45, // functional clarity / ability to stay upright
      peace: 0.25, // regulation / groundedness
      vigilance: 0.2, // lingering alarm readiness
      spiral: 0.0, // escalating recursive destabilization
      freeze: 0.0, // shutdown / constriction under overload
      threat: 0.0,
      arousal: 0.0,
      dominance: 0.5,
      valence: 0.5,
      regime: "baseline",
    };
  }

  /**
   * XState machine for qualitative regimes.
   *
   * @returns {object}
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
                  event.engineState.threat >= 0.4,
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
                  event.engineState.arousal >= 0.65,
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
                  event.engineState.peace > 0.45,
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
                  event.engineState.arousal < 0.58,
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
                  event.engineState.arousal >= 0.65,
              },
              {
                target: "alert",
                guard: ({ event }) =>
                  event.engineState.vigilance >= 0.48 ||
                  event.engineState.threat >= 0.45,
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
   * @param {object} packet
   * @returns {object}
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
   * We keep the base VAD/emotion derivation, then add a few
   * anxiety-centered composite signals.
   *
   * @param {object} packet
   * @returns {object}
   */
  computeDerivedInput(packet) {
    const base = super.computeDerivedInput(packet);
    const m = this.getRegimeModifiers();

    if (!base.hasSignal) {
      return {
        ...base,
        alarm: 0,
        destabilization: 0,
        regulation: 0,
      };
    }

    const lowValence = 1 - base.valence;
    const lowDominance = 1 - base.dominance;

    const threat = this._clamp01(
      (base.arousal * 0.5 + lowDominance * 0.35 + lowValence * 0.15) *
        m.threatGain,
    );

    const relief = this._clamp01(
      base.valence * 0.55 + base.dominance * 0.3 + (1 - base.arousal) * 0.15,
    );

    const grief = this._clamp01(
      lowValence * 0.55 + lowDominance * 0.25 + (1 - base.arousal) * 0.2,
    );

    const shock = this._clamp01(
      base.arousal * 0.6 +
        lowDominance * 0.25 +
        Math.max(0, 0.5 - base.valence) * 0.15,
    );

    const peace = this._clamp01(
      ((1 - base.arousal) * 0.45 + base.dominance * 0.35 + base.valence * 0.2) *
        m.peaceGain,
    );

    const alarm = this._clamp01(
      threat * 0.6 + base.arousal * 0.25 + lowDominance * 0.15,
    );

    const destabilization = this._clamp01(
      base.arousal * 0.45 + shock * 0.3 + lowDominance * 0.25,
    );

    const regulation = this._clamp01(
      (peace * 0.6 + relief * 0.25 + base.dominance * 0.15) * m.regulationGain,
    );

    return {
      ...base,
      threat,
      grief,
      relief,
      shock,
      peace,
      alarm,
      destabilization,
      regulation,
    };
  }

  /**
   * Reduce one packet-step into the continuous anxiety state.
   *
   * @param {object} packet
   * @param {object} input
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
    const prevThreat = this.state.threat;
    const prevArousal = this.state.arousal;
    const prevDominance = this.state.dominance;
    const prevValence = this.state.valence;

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
        prevPeace * 0.92 + (1 - this.state.load) * 0.05 * m.noInputRecoveryGain,
      );

      this.state.altitude = this._clamp01(
        prevAltitude * 0.96 +
          this.state.peace * 0.04 * m.altitudeGain -
          this.state.freeze * 0.02,
      );

      this.state.threat = this._clamp01(prevThreat * 0.9);
      this.state.arousal = this._clamp01(prevArousal * 0.92);

      this.state.dominance = this._clamp01(
        prevDominance * 0.98 +
          (1 - this.state.vigilance) * 0.01 * m.noInputRecoveryGain,
      );

      this.state.valence = this._clamp01(prevValence * 0.99);

      this.applyRegimeConstraints();
      return;
    }

    this.state.threat = input.threat;
    this.state.arousal = input.arousal;
    this.state.dominance = input.dominance;
    this.state.valence = input.valence;

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
        input.relief * 0.14 * m.altitudeGain +
        this.state.peace * 0.16 * m.altitudeGain -
        this.state.load * 0.1 -
        this.state.freeze * 0.08,
    );

    this.applyRegimeConstraints();
  }

  /**
   * Push one packet-step into the qualitative XState machine.
   *
   * @param {object} packet
   * @param {object} derivedInput
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
   * @returns {object}
   */
  getSignals() {
    return {
      regime: this.getRegime(),

      load: this.state.load,
      altitude: this.state.altitude,
      peace: this.state.peace,

      vigilance: this.state.vigilance,
      spiral: this.state.spiral,
      freeze: this.state.freeze,

      threat: this.state.threat,
      arousal: this.state.arousal,
      dominance: this.state.dominance,
      valence: this.state.valence,

      // Optional semantic composites
      instability: this._clamp01(
        this.state.spiral * 0.6 + this.state.vigilance * 0.4,
      ),
      constriction: this._clamp01(
        this.state.freeze * 0.7 + (1 - this.state.dominance) * 0.3,
      ),
      recoveryReadiness: this._clamp01(
        this.state.peace * 0.5 +
          this.state.altitude * 0.3 +
          this.state.dominance * 0.2,
      ),
    };
  }

  /**
   * Optional tighter validation.
   *
   * @param {object} packet
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

  getRegimeInfo(regime = this.getRegime()) {
    return (
      AnxietyAffectEngine.REGIME_INFO[regime] ?? {
        summary: ["No regime description available"],
        transitionOut: "No transition hint available",
      }
    );
  }

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
          regulationGain: 0.78,
          vigilanceGain: 1.12,
          spiralGain: 1.28,
          loadGain: 1.18,
          freezeGain: 1.08,
          peaceGain: 0.82,
          altitudeGain: 0.88,
          noInputRecoveryGain: 0.8,
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

  onRegimeTransition(prevRegime, nextRegime, snapshot) {
    if (!this.debug) return;

    const s = this.state;
    const info = this.getRegimeInfo(nextRegime);

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
