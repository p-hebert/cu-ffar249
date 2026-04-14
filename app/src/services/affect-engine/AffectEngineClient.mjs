/**
 * @typedef {Object} AffectRange
 * @property {number | null} min
 * @property {number | null} max
 */

/**
 * @typedef {Object} AffectValues
 * @property {number} valence
 * @property {number} arousal
 * @property {number} dominance
 */

/**
 * Reduced renderer-facing public signals.
 *
 * @typedef {Object} AffectSignals
 * @property {string} regime
 * @property {number} load
 * @property {number} altitude
 * @property {number} peace
 * @property {number} activation
 * @property {number} constriction
 * @property {number} instability
 */

/**
 * Public affect engine state returned by the server/runtime.
 *
 * Shape is intentionally loose here because each engine may expose
 * a slightly different internal state/debug payload over time.
 *
 * @typedef {Object} AffectPublicState
 * @property {string} engine
 * @property {number} tickCount
 * @property {boolean} active
 * @property {string} regime
 * @property {Record<string, number>} state
 * @property {AffectSignals} signals
 * @property {unknown} packet
 * @property {unknown} derivedInput
 */

/**
 * @typedef {Object} AffectPayload
 * @property {string} id
 * @property {string} type
 * @property {{
 *   text?: string,
 *   range?: AffectRange,
 *   values?: AffectValues | null,
 *   engineType?: string,
 *   scenario?: string | null,
 *   debug?: boolean,
 *   publicState?: AffectPublicState,
 *   signals?: AffectSignals,
 *   [key: string]: any
 * }} data
 */

/**
 * Resolve the correct WebSocket implementation depending on runtime.
 *
 * - Browser → native WebSocket
 * - Node → dynamically import "ws"
 *
 * This avoids bundling "ws" in browser builds.
 *
 * @returns {Promise<typeof WebSocket>}
 */
async function resolveWebSocketImpl() {
  // Browser environment
  if (
    typeof window !== "undefined" &&
    typeof window.WebSocket !== "undefined"
  ) {
    return window.WebSocket;
  }

  // Node environment
  const mod = await import("ws");
  return mod.default;
}

/**
 * WebSocket client for the affect engine server/runtime.
 *
 * Supported outbound messages:
 * - analyze_affect
 * - switch_affect_engine
 * - switch_affect_scenario
 * - reset_affect_engine
 *
 * Supported inbound messages:
 * - affect_result
 * - affect_engine_switched
 * - affect_scenario_switched
 * - affect_engine_reset
 * - error
 */
export default class AffectEngineClient {
  static #_cached_instances = new Map();

  /** @type {string | null} */
  #_cacheKey = null;

  /** @type {boolean} */
  #_isCachedInstance = false;

  /**
   * @param {Object} options
   * @param {string} options.url
   * @param {number} [options.reconnectDelayMs=1500]
   * @param {boolean} [options.autoReconnect=true]
   */
  static getInstance(options) {
    if (!options?.url) {
      throw new Error("getInstance requires options.url");
    }

    if (!AffectEngineClient.#_cached_instances.has(options.url)) {
      const instance = new AffectEngineClient(options);
      instance.#_isCachedInstance = true;
      instance.#_cacheKey = options.url;

      AffectEngineClient.#_cached_instances.set(options.url, instance);
    }

    return AffectEngineClient.#_cached_instances.get(options.url);
  }

  static #_purgeCachedInstance(instance) {
    if (!instance.#_isCachedInstance || !instance.#_cacheKey) {
      return;
    }

    const cached = AffectEngineClient.#_cached_instances.get(
      instance.#_cacheKey,
    );

    if (cached === instance) {
      AffectEngineClient.#_cached_instances.delete(instance.#_cacheKey);
    }

    instance.#_isCachedInstance = false;
    instance.#_cacheKey = null;
  }

  /**
   * @param {Object} options
   * @param {string} options.url
   * @param {number} [options.reconnectDelayMs=1500]
   * @param {boolean} [options.autoReconnect=true]
   */
  constructor({ url, reconnectDelayMs = 1500, autoReconnect = true }) {
    if (!url) {
      throw new Error("AffectEngineClient requires a WebSocket URL.");
    }

    this.url = url;
    this.reconnectDelayMs = reconnectDelayMs;
    this.autoReconnect = autoReconnect;

    /** @type {WebSocket | null} */
    this.ws = null;

    /** @type {Promise<void> | null} */
    this._connectPromise = null;

    /** @type {boolean} */
    this._manuallyClosed = false;

    /** @type {number | null} */
    this._reconnectTimer = null;

    /** @type {Array<string>} */
    this._sendQueue = [];

    /**
     * Latest affect/control payload received from server.
     * @type {AffectPayload | null}
     */
    this._latestAffect = null;

    /**
     * Per-request waiters keyed by outgoing id.
     * @type {Map<string, { resolve: Function, reject: Function, timeoutId: number | null }>}
     */
    this._pendingRequests = new Map();

    /**
     * Event listeners.
     * @type {Map<string, Set<Function>>}
     */
    this._listeners = new Map([
      ["open", new Set()],
      ["close", new Set()],
      ["error", new Set()],
      ["message", new Set()],
      ["affect", new Set()],
      ["status", new Set()],
    ]);
  }

  /**
   * Opens the websocket connection.
   * Safe to call multiple times.
   *
   * Works in both:
   * - browser (native WebSocket)
   * - Node (ws)
   *
   * @returns {Promise<void>}
   */
  async connect() {
    const WS_CONNECTING = 0;
    const WS_OPEN = 1;

    if (this.ws && this.ws.readyState === WS_OPEN) {
      return;
    }

    if (
      this.ws &&
      this.ws.readyState === WS_CONNECTING &&
      this._connectPromise
    ) {
      return this._connectPromise;
    }

    if (this._connectPromise) {
      return this._connectPromise;
    }

    this._manuallyClosed = false;
    this._emit("status", { status: "connecting" });

    this._connectPromise = (async () => {
      const WebSocketImpl = await resolveWebSocketImpl();

      const ws = new WebSocketImpl(this.url);
      this.ws = ws;

      return new Promise((resolve, reject) => {
        const cleanup = () => {
          ws.removeEventListener?.("open", handleOpen);
          ws.removeEventListener?.("error", handleError);
          ws.removeEventListener?.("close", handleClose);

          ws.off?.("open", handleOpen);
          ws.off?.("error", handleError);
          ws.off?.("close", handleClose);
        };

        const handleOpen = () => {
          cleanup();

          this._emit("status", { status: "open" });
          this._emit("open");

          this._flushQueue();

          this._connectPromise = null;
          resolve();
        };

        const handleError = (error) => {
          cleanup();
          this._connectPromise = null;

          AffectEngineClient.#_purgeCachedInstance(this);
          reject(error instanceof Error ? error : new Error("WebSocket error"));
        };

        const handleClose = (event) => {
          const wasNeverOpened = ws.readyState !== WS_OPEN;

          if (wasNeverOpened) {
            cleanup();
            this._connectPromise = null;

            AffectEngineClient.#_purgeCachedInstance(this);

            reject(
              new Error(
                `Connection closed: ${event?.code ?? ""} ${event?.reason ?? ""}`,
              ),
            );
            return;
          }

          if (!this.autoReconnect) {
            AffectEngineClient.#_purgeCachedInstance(this);
          }
        };

        // Browser
        if (ws.addEventListener) {
          ws.addEventListener("open", handleOpen);
          ws.addEventListener("error", handleError);
          ws.addEventListener("close", handleClose);

          ws.addEventListener("message", (event) => {
            this._handleMessage(event.data);
          });

          ws.addEventListener("close", (event) => {
            this._emit("status", {
              status: "closed",
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
            });

            this._emit("close", event);

            if (!this._manuallyClosed && this.autoReconnect) {
              this._scheduleReconnect();
            }
          });
        } else {
          // Node (ws)
          ws.on("open", handleOpen);
          ws.on("error", handleError);
          ws.on("close", handleClose);

          ws.on("message", (data) => {
            this._handleMessage(
              typeof data === "string" ? data : data.toString(),
            );
          });

          ws.on("close", (code, reason) => {
            this._emit("status", {
              status: "closed",
              code,
              reason: reason?.toString?.() ?? "",
              wasClean: true,
            });

            this._emit("close", { code, reason });

            if (!this._manuallyClosed && this.autoReconnect) {
              this._scheduleReconnect();
            }
          });
        }
      });
    })();

    return this._connectPromise;
  }

  /**
   * Closes the websocket connection and disables reconnect for this close.
   */
  disconnect() {
    this._manuallyClosed = true;

    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    AffectEngineClient.#_purgeCachedInstance(this);
  }

  /**
   * @returns {boolean}
   */
  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Send plain text for affect analysis.
   *
   * @param {string} text
   * @param {Object} [options]
   * @param {number | null} [options.min=null]
   * @param {number | null} [options.max=null]
   * @param {string} [options.type="analyze_affect"]
   * @returns {string} request id
   */
  submitText(text, { min = null, max = null, type = "analyze_affect" } = {}) {
    if (typeof text !== "string") {
      throw new Error("submitText(text): text must be a string.");
    }

    const payload = {
      id: crypto.randomUUID(),
      type,
      data: {
        text,
        range: { min, max },
      },
    };

    this.send(payload);
    return payload.id;
  }

  /**
   * Send plain text and await a matching response by id.
   *
   * @param {string} text
   * @param {Object} [options]
   * @param {number | null} [options.min=null]
   * @param {number | null} [options.max=null]
   * @param {string} [options.type="analyze_affect"]
   * @param {number} [options.timeoutMs=5000]
   * @returns {Promise<AffectPayload>}
   */
  submitTextAndWait(
    text,
    { min = null, max = null, type = "analyze_affect", timeoutMs = 5000 } = {},
  ) {
    if (typeof text !== "string") {
      throw new Error("submitTextAndWait(text): text must be a string.");
    }

    const payload = {
      id: crypto.randomUUID(),
      type,
      data: {
        text,
        range: { min, max },
      },
    };

    return this._sendAndWait(payload, timeoutMs);
  }

  /**
   * Switch to a different affect engine.
   *
   * This is a clean-slate switch on the server/runtime side.
   *
   * @param {"anxiety" | "burnout" | "depression"} engineType
   * @param {string | null} [scenario=null]
   * @returns {string} request id
   */
  switchEngine(engineType, scenario = null) {
    if (typeof engineType !== "string" || engineType.trim() === "") {
      throw new Error(
        "switchEngine(engineType): engineType must be a non-empty string.",
      );
    }

    const payload = {
      id: crypto.randomUUID(),
      type: "switch_affect_engine",
      data: {
        engineType,
        scenario,
      },
    };

    this.send(payload);
    return payload.id;
  }

  /**
   * Switch to a different affect engine and wait for the server response.
   *
   * @param {"anxiety" | "burnout" | "depression"} engineType
   * @param {string | null} [scenario=null]
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<AffectPayload>}
   */
  switchEngineAndWait(engineType, scenario = null, timeoutMs = 5000) {
    if (typeof engineType !== "string" || engineType.trim() === "") {
      throw new Error(
        "switchEngineAndWait(engineType): engineType must be a non-empty string.",
      );
    }

    const payload = {
      id: crypto.randomUUID(),
      type: "switch_affect_engine",
      data: {
        engineType,
        scenario,
      },
    };

    return this._sendAndWait(payload, timeoutMs);
  }

  /**
   * Switch only the scenario for the current affect engine.
   *
   * This is also a clean-slate recreate on the server/runtime side.
   *
   * @param {string | null} scenario
   * @returns {string} request id
   */
  switchScenario(scenario) {
    const payload = {
      id: crypto.randomUUID(),
      type: "switch_affect_scenario",
      data: {
        scenario,
      },
    };

    this.send(payload);
    return payload.id;
  }

  /**
   * Switch only the scenario for the current affect engine and wait for response.
   *
   * @param {string | null} scenario
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<AffectPayload>}
   */
  switchScenarioAndWait(scenario, timeoutMs = 5000) {
    const payload = {
      id: crypto.randomUUID(),
      type: "switch_affect_scenario",
      data: {
        scenario,
      },
    };

    return this._sendAndWait(payload, timeoutMs);
  }

  /**
   * Reset the current affect engine.
   *
   * Behavior depends on server/runtime:
   * - omitted scenario: reset using current scenario
   * - null scenario: reset with no scenario override
   * - string scenario: reset with that scenario
   *
   * @param {string | null | undefined} [scenario=undefined]
   * @returns {string} request id
   */
  resetEngine(scenario = undefined) {
    const payload = {
      id: crypto.randomUUID(),
      type: "reset_affect_engine",
      data:
        scenario === undefined
          ? {}
          : {
              scenario,
            },
    };

    this.send(payload);
    return payload.id;
  }

  /**
   * Reset the current affect engine and wait for response.
   *
   * @param {string | null | undefined} [scenario=undefined]
   * @param {number} [timeoutMs=5000]
   * @returns {Promise<AffectPayload>}
   */
  resetEngineAndWait(scenario = undefined, timeoutMs = 5000) {
    const payload = {
      id: crypto.randomUUID(),
      type: "reset_affect_engine",
      data:
        scenario === undefined
          ? {}
          : {
              scenario,
            },
    };

    return this._sendAndWait(payload, timeoutMs);
  }

  /**
   * Sends an already-formed payload.
   *
   * @param {AffectPayload} payload
   */
  send(payload) {
    const encoded = JSON.stringify(payload);

    if (this.isConnected()) {
      this.ws.send(encoded);
      return;
    }

    this._sendQueue.push(encoded);
  }

  /**
   * Send payload and await a matching response by id.
   *
   * @param {AffectPayload} payload
   * @param {number} timeoutMs
   * @returns {Promise<AffectPayload>}
   */
  _sendAndWait(payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._pendingRequests.delete(payload.id);
        reject(
          new Error(`Timed out waiting for response to request ${payload.id}`),
        );
      }, timeoutMs);

      this._pendingRequests.set(payload.id, { resolve, reject, timeoutId });
      this.send(payload);
    });
  }

  /**
   * Get the latest affect/control payload received from the server.
   *
   * @returns {AffectPayload | null}
   */
  getLatestAffect() {
    return this._latestAffect;
  }

  /**
   * Convenience getter for just the VAD values.
   *
   * @returns {AffectValues | null}
   */
  getLatestValues() {
    return this._latestAffect?.data?.values ?? null;
  }

  /**
   * Convenience getter for reduced renderer-facing signals.
   *
   * @returns {AffectSignals | null}
   */
  getLatestSignals() {
    return this._latestAffect?.data?.signals ?? null;
  }

  /**
   * Convenience getter for public engine state.
   *
   * @returns {AffectPublicState | null}
   */
  getLatestPublicState() {
    return this._latestAffect?.data?.publicState ?? null;
  }

  /**
   * Convenience getter for runtime metadata.
   *
   * @returns {{ engineType?: string, scenario?: string | null, debug?: boolean } | null}
   */
  getLatestEngineMeta() {
    const data = this._latestAffect?.data;
    if (!data) return null;

    return {
      engineType: data.engineType,
      scenario: data.scenario,
      debug: data.debug,
    };
  }

  /**
   * Subscribe to internal events.
   *
   * Events:
   * - open
   * - close
   * - error
   * - message
   * - affect
   * - status
   *
   * @param {string} eventName
   * @param {(payload?: any) => void} handler
   * @returns {() => void}
   */
  on(eventName, handler) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }

    this._listeners.get(eventName).add(handler);

    return () => {
      this.off(eventName, handler);
    };
  }

  /**
   * @param {string} eventName
   * @param {(payload?: any) => void} handler
   */
  off(eventName, handler) {
    const set = this._listeners.get(eventName);
    if (!set) return;
    set.delete(handler);
  }

  /**
   * Internal message handler.
   *
   * @param {string | ArrayBuffer | Blob} rawData
   */
  _handleMessage(rawData) {
    if (typeof rawData !== "string") {
      this._emit("message", rawData);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(rawData);
    } catch (_) {
      this._emit("error", new Error(`Failed to parse server JSON: ${rawData}`));
      return;
    }

    this._emit("message", parsed);

    if (parsed?.id && this._pendingRequests.has(parsed.id)) {
      const pending = this._pendingRequests.get(parsed.id);
      this._pendingRequests.delete(parsed.id);

      if (pending.timeoutId !== null) {
        clearTimeout(pending.timeoutId);
      }

      pending.resolve(parsed);
    }

    if (this._looksLikeAffectPayload(parsed)) {
      this._latestAffect = parsed;
      this._emit("affect", parsed);
    }
  }

  /**
   * Returns true for affect analysis responses and engine-control responses
   * that carry the current runtime/engine state.
   *
   * @param {unknown} payload
   * @returns {payload is AffectPayload}
   */
  _looksLikeAffectPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    if (!("type" in payload) || typeof payload.type !== "string") {
      return false;
    }

    if (
      !("data" in payload) ||
      !payload.data ||
      typeof payload.data !== "object"
    ) {
      return false;
    }

    const allowedTypes = new Set([
      "affect_result",
      "affect_engine_switched",
      "affect_scenario_switched",
      "affect_engine_reset",
    ]);

    if (!allowedTypes.has(payload.type)) {
      return false;
    }

    const hasValuesShape =
      "values" in payload.data &&
      (payload.data.values === null ||
        (payload.data.values &&
          typeof payload.data.values === "object" &&
          typeof payload.data.values.valence === "number" &&
          typeof payload.data.values.arousal === "number" &&
          typeof payload.data.values.dominance === "number"));

    const hasRuntimeState =
      ("publicState" in payload.data && payload.data.publicState) ||
      ("signals" in payload.data && payload.data.signals);

    return Boolean(hasValuesShape || hasRuntimeState);
  }

  _flushQueue() {
    if (!this.isConnected()) return;

    while (this._sendQueue.length > 0) {
      const msg = this._sendQueue.shift();
      this.ws.send(msg);
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer !== null) return;

    this._emit("status", {
      status: "reconnecting",
      delayMs: this.reconnectDelayMs,
    });

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  /**
   * @param {string} eventName
   * @param {any} [payload]
   */
  _emit(eventName, payload) {
    const handlers = this._listeners.get(eventName);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch (error) {
        console.error(
          `AffectEngineClient listener for '${eventName}' threw:`,
          error,
        );
      }
    }
  }
}
