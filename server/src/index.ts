import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { RoomRegistry, type Peer } from './rooms.js';
import type { Role, ServerMsg } from './types.js';
import { loadDotEnv } from './env.js';

loadDotEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8080);
const AUTH_TOKEN = process.env.CLOUD_VOICE_TOKEN ?? '';
// Cloud Run / proxies idle-timeout silent sockets; ping keeps them warm.
const HEARTBEAT_MS = 30_000;

const app = express();
app.disable('x-powered-by');

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Serve the browser UI (upload + microphone).
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const rooms = new RoomRegistry();

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function notifyPeers(peer: Peer, online: boolean): void {
  const message = JSON.stringify({ type: 'peer', role: peer.role, online });
  for (const other of rooms.others(peer)) {
    if (other.ws.readyState === WebSocket.OPEN) other.ws.send(message);
  }
}

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  const role = url.searchParams.get('role') as Role | null;
  const room = url.searchParams.get('room')?.trim();
  const token = url.searchParams.get('token') ?? '';

  const reject = (message: string) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      send(ws, { type: 'error', message });
      ws.close(1008, message);
    });
  };

  if (role !== 'agent' && role !== 'web') return reject('invalid role');
  if (!room) return reject('missing room');
  if (AUTH_TOKEN && token !== AUTH_TOKEN) return reject('unauthorized');

  wss.handleUpgrade(req, socket, head, (ws) => {
    handleConnection(ws, role, room);
  });
});

function handleConnection(ws: WebSocket, role: Role, room: string): void {
  const peer: Peer = { ws, role, room };

  const evicted = rooms.add(peer);
  if (evicted) {
    send(evicted.ws, { type: 'error', message: 'replaced by a new agent' });
    evicted.ws.close(1000, 'replaced');
  }

  send(ws, { type: 'hello', role, room });
  notifyPeers(peer, true);

  // Tell a freshly connected web client whether an agent is already present.
  if (role === 'web') {
    const agent = rooms.agentOf(room);
    send(ws, { type: 'peer', role: 'agent', online: agent !== null });
  } else {
    // Tell the agent how many web clients are waiting.
    if (rooms.webPeersOf(room).length > 0) {
      send(ws, { type: 'peer', role: 'web', online: true });
    }
  }

  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });

  ws.on('message', (data: RawData, isBinary: boolean) => {
    // Pure relay: forward every frame to the other side of the room as-is.
    const targets = rooms.others(peer);
    for (const target of targets) {
      if (target.ws.readyState === WebSocket.OPEN) {
        target.ws.send(data, { binary: isBinary });
      }
    }
  });

  const closeDown = () => {
    rooms.remove(peer);
    notifyPeers(peer, false);
  };

  ws.on('close', closeDown);
  ws.on('error', () => ws.close());

  // Per-connection heartbeat.
  const timer = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, HEARTBEAT_MS);
  ws.on('close', () => clearInterval(timer));
}

httpServer.listen(PORT, () => {
  console.log(`[cloud-voice] relay listening on :${PORT}`);
  if (AUTH_TOKEN) console.log('[cloud-voice] auth token required');
});
