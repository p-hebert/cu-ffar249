import AnxietyAffectEngine from "./affect/AnxietyAffectEngine.mjs";
import BurnoutAffectEngine from "./affect/BurnoutAffectEngine.mjs";
import DepressionAffectEngine from "./affect/DepressionAffectEngine.mjs";
import AffectStateDeltaLogger from "./debug/AffectStateDeltaLogger.mjs";

/**
 * @typedef {"anxiety" | "burnout" | "depression"} AffectEngineType
 */

/**
 * @typedef {import("./affect/AbstractAffectEngine.mjs").default} AbstractAffectEngine
 */

/**
 * @typedef {{
 *   precision?: number,
 *   showUnchanged?: boolean,
 *   stateKeys?: string[] | null,
 *   signalKeys?: string[] | null,
 *   useColors?: boolean
 * }} AffectStateDeltaLoggerConfig
 */

/**
 * @typedef {{
 *   engineType?: AffectEngineType,
 *   scenario?: string | null,
 *   debug?: boolean,
 *   logger?: AffectStateDeltaLogger | null,
 *   loggerConfig?: AffectStateDeltaLoggerConfig,
 *   engineConfig?: Record<string, unknown>
 * }} AffectEngineRuntimeConfig
 */

/**
 * AffectEngineRuntime
 *
 * Responsibilities:
 * 1. Create and own the current affect engine + logger
 * 2. Switch cleanly between engine types
 * 3. Switch cleanly between scenarios
 * 4. Tick the current engine
 * 5. Reset the current engine to defaults or to a specific scenario
 *
 * Important invariant:
 * - switching engine/scenario always creates a brand-new engine instance
 * - no state is transferred across switches unless explicitly implemented later
 */
export default class AffectEngineRuntime {
  /**
   * @type {Record<AffectEngineType, new (config?: Record<string, unknown>) => AbstractAffectEngine>}
   */
  static ENGINE_CLASS_BY_TYPE = {
    anxiety: AnxietyAffectEngine,
    burnout: BurnoutAffectEngine,
    depression: DepressionAffectEngine,
  };

  /**
   * @param {AffectEngineRuntimeConfig} [config={}]
   */
  constructor(config = {}) {
    /**
     * @type {AffectEngineType}
     */
    this.engineType = config.engineType ?? "anxiety";

    /**
     * The currently selected scenario for the current engine type.
     * Null means "use engine defaults".
     *
     * @type {string | null}
     */
    this.scenario = config.scenario ?? null;

    /**
     * Whether engine-level regime transition logging is enabled.
     *
     * @type {boolean}
     */
    this.debug = config.debug ?? false;

    /**
     * Extra config forwarded into each concrete engine constructor.
     * Useful for future tuning knobs.
     *
     * @type {Record<string, unknown>}
     */
    this.engineConfig = { ...(config.engineConfig ?? {}) };

    /**
     * Logger instance used by engines for before/after tick deltas.
     * If the caller did not provide one, runtime creates its own.
     *
     * @type {AffectStateDeltaLogger}
     */
    this.logger =
      config.logger ??
      new AffectStateDeltaLogger({
        precision: config.loggerConfig?.precision ?? 3,
        showUnchanged: config.loggerConfig?.showUnchanged ?? false,
        stateKeys: config.loggerConfig?.stateKeys ?? null,
        signalKeys: config.loggerConfig?.signalKeys ?? null,
        useColors: config.loggerConfig?.useColors ?? true,
      });

    /**
     * Current engine instance.
     *
     * @type {AbstractAffectEngine}
     */
    this.engine = this.#createEngine(this.engineType, this.scenario);
  }

  /**
   * Create a new concrete affect engine instance from scratch.
   *
   * @param {AffectEngineType} engineType
   * @param {string | null} scenario
   * @returns {AbstractAffectEngine}
   */
  #createEngine(engineType, scenario) {
    const EngineClass = AffectEngineRuntime.ENGINE_CLASS_BY_TYPE[engineType];

    if (!EngineClass) {
      throw new Error(`Unsupported affect engine type: ${engineType}`);
    }

    return new EngineClass({
      ...this.engineConfig,
      debug: this.debug,
      logger: this.logger,
      scenario,
    });
  }

  /**
   * Replace the current engine with a fresh new instance.
   *
   * @param {AffectEngineType} engineType
   * @param {string | null} scenario
   * @returns {AbstractAffectEngine}
   */
  #replaceEngine(engineType, scenario) {
    if (this.engine && typeof this.engine.pause === "function") {
      this.engine.pause();
    }

    this.engineType = engineType;
    this.scenario = scenario ?? null;
    this.engine = this.#createEngine(engineType, this.scenario);

    return this.engine;
  }

  /**
   * Tick the current engine with a packet.
   *
   * @param {import("./affect/AbstractAffectEngine.mjs").AffectPacket | object} packet
   * @returns {ReturnType<AbstractAffectEngine["getPublicState"]>}
   */
  tick(packet) {
    return this.engine.tick(packet);
  }

  /**
   * Get the current engine's public state.
   *
   * @returns {ReturnType<AbstractAffectEngine["getPublicState"]>}
   */
  getPublicState() {
    return this.engine.getPublicState();
  }

  /**
   * Get the current engine's reduced public signals.
   *
   * @returns {ReturnType<AbstractAffectEngine["getSignals"]>}
   */
  getSignals() {
    return this.engine.getSignals();
  }

  /**
   * Get runtime metadata + current engine state.
   *
   * @returns {{
   *   engineType: AffectEngineType,
   *   scenario: string | null,
   *   debug: boolean,
   *   publicState: ReturnType<AbstractAffectEngine["getPublicState"]>,
   *   signals: ReturnType<AbstractAffectEngine["getSignals"]>
   * }}
   */
  getSnapshot() {
    return {
      engineType: this.engineType,
      scenario: this.scenario,
      debug: this.debug,
      publicState: this.getPublicState(),
      signals: this.getSignals(),
    };
  }

  /**
   * Switch to a different engine type.
   * This is always a clean slate.
   *
   * If no scenario is provided, the new engine starts from its own defaults.
   *
   * @param {AffectEngineType} engineType
   * @param {string | null} [scenario=null]
   * @returns {{
   *   engineType: AffectEngineType,
   *   scenario: string | null,
   *   publicState: ReturnType<AbstractAffectEngine["getPublicState"]>,
   *   signals: ReturnType<AbstractAffectEngine["getSignals"]>
   * }}
   */
  switchEngine(engineType, scenario = null) {
    this.#replaceEngine(engineType, scenario);

    return {
      engineType: this.engineType,
      scenario: this.scenario,
      publicState: this.getPublicState(),
      signals: this.getSignals(),
    };
  }

  /**
   * Recreate the current engine using a different scenario.
   * This is also always a clean slate.
   *
   * @param {string | null} scenario
   * @returns {{
   *   engineType: AffectEngineType,
   *   scenario: string | null,
   *   publicState: ReturnType<AbstractAffectEngine["getPublicState"]>,
   *   signals: ReturnType<AbstractAffectEngine["getSignals"]>
   * }}
   */
  switchScenario(scenario) {
    this.#replaceEngine(this.engineType, scenario);

    return {
      engineType: this.engineType,
      scenario: this.scenario,
      publicState: this.getPublicState(),
      signals: this.getSignals(),
    };
  }

  /**
   * Reset the current engine cleanly.
   *
   * Behavior:
   * - reset() with no args: recreate current engine using current scenario
   * - reset(null): recreate current engine with no scenario override
   * - reset("someScenario"): recreate current engine with that scenario
   *
   * @param {string | null | undefined} [scenario=undefined]
   * @returns {{
   *   engineType: AffectEngineType,
   *   scenario: string | null,
   *   publicState: ReturnType<AbstractAffectEngine["getPublicState"]>,
   *   signals: ReturnType<AbstractAffectEngine["getSignals"]>
   * }}
   */
  reset(scenario = undefined) {
    const nextScenario = scenario === undefined ? this.scenario : scenario;
    this.#replaceEngine(this.engineType, nextScenario ?? null);

    return {
      engineType: this.engineType,
      scenario: this.scenario,
      publicState: this.getPublicState(),
      signals: this.getSignals(),
    };
  }

  /**
   * Enable or disable engine debug mode.
   * This recreates the engine cleanly so the new debug setting is applied consistently.
   *
   * @param {boolean} debug
   * @returns {{
   *   engineType: AffectEngineType,
   *   scenario: string | null,
   *   debug: boolean,
   *   publicState: ReturnType<AbstractAffectEngine["getPublicState"]>,
   *   signals: ReturnType<AbstractAffectEngine["getSignals"]>
   * }}
   */
  setDebug(debug) {
    this.debug = Boolean(debug);
    this.#replaceEngine(this.engineType, this.scenario);

    return {
      engineType: this.engineType,
      scenario: this.scenario,
      debug: this.debug,
      publicState: this.getPublicState(),
      signals: this.getSignals(),
    };
  }

  /**
   * Update the shared logger.
   * Recreates the current engine cleanly so the logger is attached from construction.
   *
   * @param {AffectStateDeltaLogger} logger
   * @returns {{
   *   engineType: AffectEngineType,
   *   scenario: string | null,
   *   publicState: ReturnType<AbstractAffectEngine["getPublicState"]>,
   *   signals: ReturnType<AbstractAffectEngine["getSignals"]>
   * }}
   */
  setLogger(logger) {
    if (!logger || typeof logger.logTick !== "function") {
      throw new Error(
        "setLogger(logger): logger must implement logTick(prev, next).",
      );
    }

    this.logger = logger;
    this.#replaceEngine(this.engineType, this.scenario);

    return {
      engineType: this.engineType,
      scenario: this.scenario,
      publicState: this.getPublicState(),
      signals: this.getSignals(),
    };
  }

  /**
   * Update extra engine config used for future recreations.
   * This does not mutate the current engine in place.
   * It recreates the engine cleanly.
   *
   * @param {Record<string, unknown>} engineConfig
   * @returns {{
   *   engineType: AffectEngineType,
   *   scenario: string | null,
   *   publicState: ReturnType<AbstractAffectEngine["getPublicState"]>,
   *   signals: ReturnType<AbstractAffectEngine["getSignals"]>
   * }}
   */
  setEngineConfig(engineConfig) {
    this.engineConfig = { ...engineConfig };
    this.#replaceEngine(this.engineType, this.scenario);

    return {
      engineType: this.engineType,
      scenario: this.scenario,
      publicState: this.getPublicState(),
      signals: this.getSignals(),
    };
  }
}
