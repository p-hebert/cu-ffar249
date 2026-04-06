import { WebSocketServer } from "ws";

const PORT = 8080;

const wss = new WebSocketServer({ port: PORT });
const address = wss.address();
console.log(`LISTENING ws://[${address.address}]:${address.port}`);

/**
 * Generate dummy affect values.
 * Keeps shape consistent with client expectations.
 */
function getDummyAffect(range = { min: null, max: null }) {
  const base = {
    valence: 0.2,
    arousal: 0.5,
    dominance: 0.3,
  };

  // Optional normalization if range provided
  if (range && typeof range.min === "number" && typeof range.max === "number") {
    const { min, max } = range;

    const scale = (v) => min + (v + 1) * 0.5 * (max - min);

    return {
      valence: scale(base.valence),
      arousal: scale(base.arousal),
      dominance: scale(base.dominance),
    };
  }

  return base;
}

wss.on("connection", (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`Client connected: ${clientIp}`);

  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      ws.send(
        JSON.stringify({
          type: "error",
          data: {
            message: "Invalid JSON payload",
          },
        }),
      );
      return;
    }

    const { id, type, data } = msg || {};

    // Basic validation
    if (!id || !type) {
      ws.send(
        JSON.stringify({
          type: "error",
          data: {
            message: "Missing required fields: id or type",
          },
        }),
      );
      return;
    }

    // --- Handle affect analysis ---
    if (type === "analyze_affect") {
      const text = data?.text ?? "";
      const range = data?.range ?? { min: null, max: null };

      console.log(`Affect request [${id}]:`, text);

      const values = getDummyAffect(range);

      const response = {
        id,
        type: "affect_result",
        data: {
          text,
          range,
          values,
        },
      };

      ws.send(JSON.stringify(response));
      return;
    }

    // --- Unknown type fallback ---
    ws.send(
      JSON.stringify({
        id,
        type: "error",
        data: {
          message: `Unknown message type: ${type}`,
        },
      }),
    );
  });

  ws.on("close", () => {
    console.log(`Client disconnected: ${clientIp}`);
  });

  ws.on("error", (err) => {
    console.error("Socket error:", err);
  });
});
