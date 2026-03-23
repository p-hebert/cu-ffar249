const path = require("path");
const WebSocket = require("ws");
const { LRUCache } = require("lru-cache");

let Max;
try {
  Max = require("max-api");
} catch (err) {
  if (process.env.MAX_ENV !== undefined) {
    throw err;
  }
  // Create a dummy if we are not in MAX_ENV, just for testing purposes
  Max = {
    outlet(...args) {
      console.debug("Max.outlet:", args);
    },
    post(...args) {
      console.debug("Max.post:", args);
    },
    addHandler() {
      // do nothing
    },
  };
}

// Websocket Server
/** @type {WebSocket.Server} */
let wss;

// Websocket table
/** @type {Set<WebSocket>} */
const CLIENTS = new Set();

// Websocket message id deduplication table
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

  #_format(message, { level = "INFO" }) {
    return `${MaxLogger.#_ts()} | ${level.padEnd(8, " ")} | node.script ${MaxLogger.#_BASENAME}: ${message}`;
  }

  debug(message) {
    const line = this.#_format(message, { level: "DEBUG" });
    console.debug(line);
  }

  log(message) {
    const line = this.#_format(message, { level: "INFO" });
    Max.post(line);
    console.debug(line);
  }

  error(message) {
    const line = this.#_format(message, { level: "ERROR" });
    console.debug(line);
  }
}

const logger = new MaxLogger();

/**
 * Message handler factory
 * @param {WebSocket} ws
 * @returns {({ id: string, type: string, data: Object }) => void}
 */
function makeMessageHandler(ws) {
  /**
   * On "message" handler
   * @param {{ id: string, type: string, data: Object }} message
   */
  return function handleMessage(message) {
    logger.debug(message);
    const { id, type, data } = JSON.parse(message);
    // dedup potential duplicate messages
    // ids sent should be idempotent
    if (CACHE.has(id)) {
      return;
    }

    switch (type) {
      case "vad-results": {
        try {
          const [v, a, d] = data.values;
          const out = `vad:${v},${a},${d}`;
          Max.outlet(out);

          logger.log(`[${id.substring(0, 8)}] ${out}`);
          // Marking request as OK (exit code 0)
          CACHE.set(id, 0);
          // Sending HTTP 200 back to client
          ws.send(JSON.stringify({ id, status: 200 }));
        } catch (err) {
          logger.error(`[${id.substring(0, 8)}] ${err.toString()}`);
          // Marking request as not OK
          CACHE.set(id, 1);
          // Sending HTTP 500 back to client
          ws.send(JSON.stringify({ id, status: 500, code: null }));
        }
        return;
      }
      default:
        logger.error(`[${id.substring(0, 8)}] UNKNOWN`);
        // Marking request as not OK
        CACHE.set(id, 1);
        // Sending HTTP 400 back to client
        ws.send(JSON.stringify({ id, status: 400, code: "INVALID_TYPE" }));
        return; // drop unknown messages
    }
  };
}

/**
 * Error handler factory
 * @param {WebSocket} ws
 * @returns {(Error) => void}
 */
function makeErrorHandler(ws) {
  /**
   * On "error" handler
   * @param {Error} err
   */
  return function handleError(err) {
    logger.error(err.toString());
    ws.send(JSON.stringify({ status: 500 }));
  };
}

function main() {
  logger.log("LOADED");

  wss = new WebSocket.Server({ port: 6452 });
  wss.on("connection", (ws) => {
    CLIENTS.add(ws);
    ws.on("error", makeErrorHandler(ws));
    ws.on("message", makeMessageHandler(ws));
    ws.on("close", () => CLIENTS.delete(ws));
  });

  const address = wss.address();
  logger.log(`LISTENING [${address.address}]:${address.port}`);

  // Free up resources on 'stop' event
  Max.addHandler("stop", () => {
    wss.close();
  });
}

main();

// // Use the 'addHandler' function to register a function for a particular message
// Max.addHandler("bang", () => {
// 	Max.post("Who you think you bangin'?");
// });

// // Use the 'outlet' function to send messages out of node.script's outlet
// Max.addHandler("echo", (msg) => {
// 	Max.outlet(msg);
// });

// Max.addHandler("miaow", (msg) => {
//   Max.outlet(msg);
// })

// Max.addHandler("signal", (signal) => {
//   Max.post("i hear" + signal);
// })
