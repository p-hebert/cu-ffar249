import { WebSocketServer } from "ws";
import AbstractAffectEngine from "./engine/affect/AbstractAffectEngine.mjs";
import AffectEngineRuntime from "./engine/AffectEngineRuntime.mjs";
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

const affectRuntime = new AffectEngineRuntime({
  engineType: "anxiety",
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
 * Defaults to [0, 1] when absent.
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
 * Whether caller requested output values normalized to a concrete range.
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
 * @returns {{
 *   type: "affect" | "idle",
 *   value: unknown,
 *   meta: {
 *     requestId: string,
 *     source: string,
 *     text: string
 *   }
 * }}
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

/**
 * Build a shared payload describing current runtime state.
 *
 * @returns {{
 *   engineType: string,
 *   scenario: string | null,
 *   debug: boolean,
 *   publicState: ReturnType<typeof affectRuntime.getPublicState>,
 *   signals: ReturnType<typeof affectRuntime.getSignals>
 * }}
 */
function getRuntimeData() {
  const snapshot = affectRuntime.getSnapshot();

  return {
    engineType: snapshot.engineType,
    scenario: snapshot.scenario,
    debug: snapshot.debug,
    publicState: snapshot.publicState,
    signals: snapshot.signals,
  };
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

    try {
      // ---------------------------------------------------------------------
      // GET CURRENT ENGINE/RUNTIME STATE
      // ---------------------------------------------------------------------
      if (type === "get_affect_state") {
        console.log(
          `Get affect state [${id}]: engineType=${affectRuntime.engineType}, scenario=${affectRuntime.scenario}`,
        );

        const payload = {
          id,
          type: "affect_state",
          data: {
            ...getRuntimeData(),
          },
        };

        // For get_state, reply only to requester.
        ws.send(JSON.stringify(payload));
        return;
      }

      // ---------------------------------------------------------------------
      // ANALYZE AFFECT
      // ---------------------------------------------------------------------
      if (type === "analyze_affect") {
        const text = typeof data?.text === "string" ? data.text : "";
        const trimmedText = text.trim();
        const range = normalizeRange(data?.range);

        console.log(`Affect request [${id}]:`, trimmedText);

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

        const publicState = affectRuntime.tick(packet);
        const signals = affectRuntime.getSignals();

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
            ...getRuntimeData(),
            publicState,
            signals,
          },
        };

        broadcast(payload);
        return;
      }

      // ---------------------------------------------------------------------
      // SWITCH ENGINE
      // ---------------------------------------------------------------------
      if (type === "switch_affect_engine") {
        const engineType =
          typeof data?.engineType === "string" ? data.engineType : null;
        const scenario =
          typeof data?.scenario === "string" ? data.scenario : null;

        if (!engineType) {
          sendError(ws, id, "switch_affect_engine requires data.engineType");
          return;
        }

        console.log(
          `Switch affect engine [${id}]: engineType=${engineType}, scenario=${scenario}`,
        );

        const result = affectRuntime.switchEngine(engineType, scenario);

        const payload = {
          id,
          type: "affect_engine_switched",
          data: {
            engineType: result.engineType,
            scenario: result.scenario,
            publicState: result.publicState,
            signals: result.signals,
          },
        };

        broadcast(payload);
        return;
      }

      // ---------------------------------------------------------------------
      // SWITCH SCENARIO
      // ---------------------------------------------------------------------
      if (type === "switch_affect_scenario") {
        const scenario =
          typeof data?.scenario === "string" ? data.scenario : null;

        console.log(
          `Switch affect scenario [${id}]: engineType=${affectRuntime.engineType}, scenario=${scenario}`,
        );

        const result = affectRuntime.switchScenario(scenario);

        const payload = {
          id,
          type: "affect_scenario_switched",
          data: {
            engineType: result.engineType,
            scenario: result.scenario,
            publicState: result.publicState,
            signals: result.signals,
          },
        };

        broadcast(payload);
        return;
      }

      // ---------------------------------------------------------------------
      // RESET ENGINE
      // ---------------------------------------------------------------------
      if (type === "reset_affect_engine") {
        const scenario =
          typeof data?.scenario === "string"
            ? data.scenario
            : data?.scenario === null
              ? null
              : undefined;

        console.log(
          `Reset affect engine [${id}]: engineType=${affectRuntime.engineType}, scenario=${scenario}`,
        );

        const result = affectRuntime.reset(scenario);

        const payload = {
          id,
          type: "affect_engine_reset",
          data: {
            engineType: result.engineType,
            scenario: result.scenario,
            publicState: result.publicState,
            signals: result.signals,
          },
        };

        broadcast(payload);
        return;
      }

      // ---------------------------------------------------------------------
      // UNKNOWN
      // ---------------------------------------------------------------------
      sendError(ws, id, `Unknown message type: ${type}`);
    } catch (err) {
      console.error(`Request failed [${id}] type=${type}:`, err);
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
