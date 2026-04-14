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
 * @typedef {Object} AffectPayload
 * @property {string} id
 * @property {string} type
 * @property {{
 *   text?: string,
 *   range?: AffectRange,
 *   values?: AffectValues,
 *   [key: string]: any
 * }} data
 */

import WebSocket from "ws";

/**
 * Browser-side WebSocket client for an affect engine.
 *
 * Expected outbound shape:
 * {
 *   id,
 *   type,
 *   data: {
 *     text,
 *     range: { min, max }
 *   }
 * }
 *
 * Expected inbound affect result shape:
 * {
 *   id,
 *   type: "affect_result",
 *   data: {
 *     text,
 *     range: { min, max },
 *     values: {
 *       valence,
 *       arousal,
 *       dominance
 *     }
 *   }
 * }
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

    // Only delete if the cache still points to this exact instance
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

    /** @type {boolean} */
    this._manuallyClosed = false;

    /** @type {number | null} */
    this._reconnectTimer = null;

    /** @type {Array<string>} */
    this._sendQueue = [];

    /**
     * Latest affect state received from server.
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
   */
  connect() {
    // If already open → resolve immediately
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // If already connecting → reuse same promise
    if (this._connectPromise) {
      return this._connectPromise;
    }

    this._manuallyClosed = false;
    this._emit("status", { status: "connecting" });

    this._connectPromise = new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      const cleanup = () => {
        if (!this.ws) return;

        this.ws.removeEventListener("open", handleOpen);
        this.ws.removeEventListener("error", handleError);
        this.ws.removeEventListener("close", handleClose);
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

        // Build the most precise message possible
        let message = "WebSocket connection error";

        if (error instanceof Error) {
          message = error.message || message;
        } else if (error?.message) {
          message = error.message;
        } else if (error?.type === "error") {
          // Browser WebSocket errors are often generic Event objects
          message =
            "WebSocket error event (connection may have failed, been refused, or blocked)";
        }

        // Add contextual hints (very useful in browser)
        if (this.url) {
          try {
            const urlObj = new URL(this.url);

            if (
              urlObj.protocol === "ws:" &&
              window.location.protocol === "https:"
            ) {
              message +=
                " — Mixed content: cannot connect to ws:// from https://";
            }

            if (
              urlObj.hostname === "localhost" ||
              urlObj.hostname === "127.0.0.1" ||
              urlObj.hostname === "[::]" ||
              urlObj.hostname === "[::1]"
            ) {
              message +=
                " — Check that the local server is running and reachable";
            }
          } catch (_) {
            // ignore URL parsing issues
          }
        }

        const enrichedError = new Error(message);
        enrichedError.data = error;

        AffectEngineClient.#_purgeCachedInstance(this);

        reject(enrichedError);
      };

      const handleClose = (event) => {
        const wasNeverOpened = this.ws?.readyState !== WebSocket.OPEN;

        if (wasNeverOpened) {
          // Initial connection failed → reject + purge
          cleanup();

          this._connectPromise = null;
          AffectEngineClient.#_purgeCachedInstance(this);

          reject(new Error(`Connection closed: ${event.code} ${event.reason}`));
          return;
        }

        // Connection was previously open → runtime close
        if (!this.autoReconnect) {
          // No reconnect strategy → this instance is effectively dead
          AffectEngineClient.#_purgeCachedInstance(this);
        }
        // else autoReconnect === true:
        // DO NOT purge (instance is still logically alive)
      };

      this.ws.addEventListener("open", handleOpen);
      this.ws.addEventListener("error", handleError);
      this.ws.addEventListener("close", handleClose);

      // --- existing listeners (keep these) ---
      this.ws.addEventListener("message", (event) => {
        this._handleMessage(event.data);
      });

      this.ws.addEventListener("error", (error) => {
        this._emit("error", error);
      });

      this.ws.addEventListener("close", (event) => {
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
    });

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
   * Assumes server echoes the same request id back.
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
    const id = crypto.randomUUID();

    const payload = {
      id,
      type,
      data: {
        text,
        range: { min, max },
      },
    };

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this._pendingRequests.delete(id);
        reject(new Error(`Timed out waiting for response to request ${id}`));
      }, timeoutMs);

      this._pendingRequests.set(id, { resolve, reject, timeoutId });
      this.send(payload);
    });
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
   * Get the latest affect payload received from the server.
   *
   * @returns {AffectPayload | null}
   */
  getLatestAffect() {
    return this._latestAffect;
  }

  /**
   * Convenience getter for just the values.
   *
   * @returns {AffectValues | null}
   */
  getLatestValues() {
    return this._latestAffect?.data?.values ?? null;
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
   * @returns {() => void} unsubscribe function
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
   * @param {unknown} payload
   * @returns {payload is AffectPayload}
   */
  _looksLikeAffectPayload(payload) {
    return Boolean(
      payload &&
      typeof payload === "object" &&
      "data" in payload &&
      payload.data &&
      typeof payload.data === "object" &&
      "values" in payload.data &&
      (payload.data.values === null ||
        (payload.data.values &&
          typeof payload.data.values === "object" &&
          typeof payload.data.values.valence === "number" &&
          typeof payload.data.values.arousal === "number" &&
          typeof payload.data.values.dominance === "number")),
    );
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

    this._reconnectTimer = window.setTimeout(() => {
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
