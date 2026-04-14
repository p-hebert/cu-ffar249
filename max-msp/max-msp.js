const path = require('path');
const WebSocket = require('ws');
const { LRUCache } = require('lru-cache');

let Max;
try {
  Max = require('max-api');
} catch (err) {
  if (process.env.MAX_ENV !== undefined) {
    throw err;
  }

  // Dummy shim for local testing outside Max
  Max = {
    outlet(...args) {
      console.debug('Max.outlet:', args);
    },
    post(...args) {
      console.debug('Max.post:', args);
    },
    addHandler() {
      // no-op
    },
    setDict(name, value) {
      console.debug(`Max.setDict(${name}):`, JSON.stringify(value, null, 2));
    },
  };
}

const WS_URL = 'ws://127.0.0.1:8080';
const RECONNECT_DELAY_MS = 2000;

/** @type {WebSocket | null} */
let ws = null;

/** @type {NodeJS.Timeout | null} */
let reconnectTimer = null;

/**
 * Deduplicate inbound messages by message id.
 */
const CACHE = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes
});

/**
 * Simple wrapper for convenient logging semantics back in Max MSP.
 */
class MaxLogger {
  static #_BASENAME = path.basename(__filename);
  static #_ts = () => new Date().toISOString().substring(11, 19);

  #_format(message, { level = 'INFO' } = {}) {
    return `${MaxLogger.#_ts()} | ${level.padEnd(8, ' ')} | node.script ${MaxLogger.#_BASENAME}: ${message}`;
  }

  debug(message) {
    const line = this.#_format(message, { level: 'DEBUG' });
    console.debug(line);
  }

  log(message) {
    const line = this.#_format(message, { level: 'INFO' });
    Max.post(line);
    console.debug(line);
  }

  error(message) {
    const line = this.#_format(message, { level: 'ERROR' });
    Max.post(line);
    console.error(line);
  }
}

const logger = new MaxLogger();

/**
 * Emit a typed event to Max while storing the payload in a named dict.
 *
 * Pattern:
 *   Max.outlet("<eventType>", "<dictName>");
 *
 * @param {string} eventType
 * @param {string} dictName
 * @param {object} payload
 */
function emitTypedDictEvent(eventType, payload) {
  console.log(JSON.stringify(payload, null, 2));
  Max.outlet(eventType, payload);
}

/**
 * Emit the legacy event format for VAD values
 *
 * @param {string} eventType
 * @param {string} dictName
 * @param {object} payload
 */
function emitLegacyVADEvent(payload) {
  const { valence: v = 0, arousal: a = 0, dominance: d = 0 } = payload.data?.signals ?? {};
  Max.outlet('legacy_vad', `vad:${v},${a},${d}`);
}

/**
 * Schedule a reconnect attempt unless one is already scheduled.
 */
function scheduleReconnect() {
  if (reconnectTimer !== null) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}

/**
 * Close and clear the current websocket safely.
 */
function cleanupSocket() {
  if (!ws) {
    return;
  }

  ws.removeAllListeners();

  try {
    ws.close();
  } catch {
    // ignore cleanup errors
  }

  ws = null;
}

/**
 * Handle a parsed inbound message from the affect server.
 *
 * @param {{ id?: string, type?: string, data?: any }} message
 */
function handleParsedMessage(message) {
  const { id, type } = message || {};

  if (id && CACHE.has(id)) {
    return;
  }

  switch (type) {
    case 'affect_result': {
      emitTypedDictEvent('affect_result', message);
      emitLegacyVADEvent(message);

      if (id) {
        CACHE.set(id, 0);
      }

      logger.log(`[${String(id || 'no-id').substring(0, 8)}] affect_result -> dict affect_result`);
      return;
    }

    case 'error': {
      emitTypedDictEvent('engine_error', message);

      if (id) {
        CACHE.set(id, 1);
      }

      const errorMessage =
        typeof message?.data?.message === 'string' ? message.data.message : 'Unknown server error';

      logger.error(`[${String(id || 'no-id').substring(0, 8)}] engine_error: ${errorMessage}`);
      return;
    }

    default: {
      emitTypedDictEvent('unhandled_event', message);

      if (id) {
        CACHE.set(id, 1);
      }

      logger.error(
        `[${String(id || 'no-id').substring(0, 8)}] unhandled event type: ${String(type)}`,
      );
    }
  }
}

/**
 * Connect to the affect-engine websocket server.
 */
function connect() {
  cleanupSocket();

  logger.log(`CONNECTING ${WS_URL}`);
  Max.outlet('ws_status', 'connecting');

  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    logger.log(`CONNECTED ${WS_URL}`);
    Max.outlet('ws_status', 'connected');
  });

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      handleParsedMessage(message);
    } catch (err) {
      const errorPayload = {
        type: 'parse_error',
        data: {
          message: err instanceof Error ? err.message : 'Failed to parse incoming JSON',
          raw: raw.toString(),
        },
      };

      emitTypedDictEvent('engine_error', errorPayload);
      logger.error(`Failed to parse incoming message: ${errorPayload.data.message}`);
    }
  });

  ws.on('close', () => {
    logger.log(`DISCONNECTED ${WS_URL}`);
    Max.outlet('ws_status', 'disconnected');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    const errorPayload = {
      type: 'socket_error',
      data: {
        message: err instanceof Error ? err.message : String(err),
      },
    };

    emitTypedDictEvent('engine_error', errorPayload);
    logger.error(`Socket error: ${errorPayload.data.message}`);
  });
}

function main() {
  logger.log('LOADED');

  connect();

  Max.addHandler('stop', () => {
    logger.log('STOP');
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    cleanupSocket();
    Max.outlet('ws_status', 'stopped');
  });

  Max.addHandler('reconnect', () => {
    logger.log('MANUAL RECONNECT');
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    connect();
  });
}

main();
