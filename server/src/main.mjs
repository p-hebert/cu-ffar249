import { WebSocketServer } from "ws";
import AbstractAffectEngine from "./engine/AbstractAffectEngine.mjs";
import AnxietyAffectEngine from "./engine/AnxietyAffectEngine.mjs";
import AffectStateDeltaLogger from "./engine/debug/AffectStateDeltaLogger.mjs";
import { VadBert } from "./nlp/vad-bert.js";

const PORT = 8080;

const wss = new WebSocketServer({ port: PORT });
const address = wss.address();
console.log(`LISTENING ws://[${address.address}]:${address.port}`);

const affectLogger = new AffectStateDeltaLogger({
  precision: 3,
  showUnchanged: false,
});
/**
 * Global singleton-ish engine for now.
 * Later this can be swapped via a message type.
 */
const affectEngine = new AnxietyAffectEngine({
  scenario: "anxious",
  logger: affectLogger,
  debug: true,
});

/**
 * Lazy-loaded VAD model.
 * Loaded once on first real affect request.
 *
 * @type {VadBert | null}
 */
let vadBert = null;

/**
 * @returns {Promise<VadBert>}
 */
async function getVadBert() {
  if (!vadBert) {
    vadBert = await VadBert.getInstance();
  }
  return vadBert;
}

/**
 * Normalize user-provided range.
 *
 * @param {unknown} range
 * @returns {{ min: number | null, max: number | null }}
 */
function normalizeRange(range) {
  const min = typeof range?.min === "number" ? range.min : null;
  const max = typeof range?.max === "number" ? range.max : null;

  if (min === null && max === null) {
    return { min: 0, max: 1 };
  }

  if (min !== null && max !== null && min > max) {
    return { min: max, max: min };
  }

  return { min, max };
}

/**
 * Whether caller requested output values normalized to a custom range.
 *
 * @param {{ min: number | null, max: number | null }} range
 * @returns {boolean}
 */
function hasConcreteRange(range) {
  return typeof range.min === "number" && typeof range.max === "number";
}

/**
 * Build an engine packet from text + VAD.
 *
 * Engine uses normalized [0, 1] values internally.
 *
 * @param {string} text
 * @param {{valence:number, arousal:number, dominance:number} | symbol} value
 * @param {string} requestId
 * @returns {object}
 */
function buildEnginePacket(text, value, requestId) {
  if (value === AbstractAffectEngine.NO_INPUT) {
    return {
      type: "idle",
      value: AbstractAffectEngine.NO_INPUT,
      meta: {
        requestId,
        source: "ws",
        text,
      },
    };
  }

  return {
    type: "affect",
    value,
    meta: {
      requestId,
      source: "ws",
      text,
    },
  };
}

/**
 * Broadcast JSON payload to all connected listeners.
 *
 * @param {object} payload
 */
function broadcast(payload) {
  const encoded = JSON.stringify(payload);

  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(encoded);
    }
  }
}

/**
 * Send a structured error to one socket.
 *
 * @param {import("ws").WebSocket} ws
 * @param {string | null} id
 * @param {string} message
 */
function sendError(ws, id, message) {
  ws.send(
    JSON.stringify({
      id,
      type: "error",
      data: {
        message,
      },
    }),
  );
}

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`Client connected: ${clientIp}`);

  ws.on("message", async (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      sendError(ws, null, "Invalid JSON payload");
      return;
    }

    const { id, type, data } = msg || {};

    if (!id || !type) {
      sendError(ws, id ?? null, "Missing required fields: id or type");
      return;
    }

    if (type !== "analyze_affect") {
      sendError(ws, id, `Unknown message type: ${type}`);
      return;
    }

    const text = typeof data?.text === "string" ? data.text : "";
    const trimmedText = text.trim();
    const range = normalizeRange(data?.range);

    console.log(`Affect request [${id}]:`, trimmedText);

    try {
      let rawVAD;
      let normalizedEngineVAD;
      let packet;

      if (trimmedText === "") {
        rawVAD = null;
        normalizedEngineVAD = null;

        packet = buildEnginePacket("", AbstractAffectEngine.NO_INPUT, id);
      } else {
        const model = await getVadBert();

        // Raw model domain is [1, 5]
        rawVAD = await model.predict(trimmedText);

        // Engine consumes normalized [0, 1]
        normalizedEngineVAD = VadBert.normalizeVAD(rawVAD, 0, 1);

        packet = buildEnginePacket(trimmedText, normalizedEngineVAD, id);
      }

      affectEngine.tick(packet);

      const publicState = affectEngine.getPublicState();
      const signals = affectEngine.getSignals();

      // Keep caller-facing values compatible with previous client expectations.
      // For empty text, values is null.
      const responseValues =
        rawVAD == null
          ? null
          : hasConcreteRange(range)
            ? VadBert.normalizeVAD(rawVAD, range.min, range.max)
            : rawVAD;

      const payload = {
        id,
        type: "affect_result",
        data: {
          text,
          range,
          values: responseValues,
          publicState,
          signals,
        },
      };

      // Fan out to all listeners, including requester.
      broadcast(payload);
    } catch (err) {
      console.error(`Affect request failed [${id}]:`, err);
      sendError(
        ws,
        id,
        err instanceof Error ? err.message : "Internal server error",
      );
    }
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${clientIp}`);
  });

  ws.on("error", (err) => {
    console.error("Socket error:", err);
  });
});
