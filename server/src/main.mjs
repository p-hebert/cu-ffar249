// server.js
const WebSocket = require('ws');

const PORT = 8080;

// Create a WebSocket server
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server running on ws://localhost:${PORT}`);

// Handle new connections
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`Client connected: ${clientIp}`);

  // Send a welcome message
  ws.send(
    JSON.stringify({
      type: 'connection',
      message: 'Connected to server',
    }),
  );

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('Received:', message);

      // Echo back (example behavior)
      ws.send(
        JSON.stringify({
          type: 'echo',
          received: message,
        }),
      );
    } catch (err) {
      console.error('Invalid JSON:', data.toString());
    }
  });

  // Handle disconnect
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientIp}`);
  });

  // Handle errors
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});
