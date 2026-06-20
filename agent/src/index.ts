import { WebSocket, type RawData } from 'ws';
import { loadConfig, assertConfig, type Config } from './config.js';
import { listOutputDevices } from './devices.js';
import { Player } from './player.js';

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

function log(...args: unknown[]): void {
  console.log(`[cloud-voice-agent ${new Date().toISOString()}]`, ...args);
}

async function printDevices(): Promise<void> {
  const devices = await listOutputDevices();
  console.log('利用可能な出力デバイス:');
  for (const d of devices) {
    console.log(`  id=${JSON.stringify(d.id)}  ${d.name}${d.isDefault ? '  (既定)' : ''}`);
  }
}

class Agent {
  private ws: WebSocket | null = null;
  private player: Player;
  private reconnectDelay = RECONNECT_MIN_MS;
  private stopping = false;

  constructor(private cfg: Config) {
    this.player = new Player(cfg.device, (state, streamId, message) => {
      this.sendJson({ type: 'status', state, streamId, message });
      if (message) log(`playback ${state}:`, message);
    });
  }

  start(): void {
    this.connect();
    const shutdown = () => {
      this.stopping = true;
      this.player.stop();
      this.ws?.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  private url(): string {
    const base = this.cfg.server.replace(/\/+$/, '');
    const params = new URLSearchParams({ role: 'agent', room: this.cfg.room });
    if (this.cfg.token) params.set('token', this.cfg.token);
    return `${base}/ws?${params}`;
  }

  private connect(): void {
    if (this.stopping) return;
    log(`connecting to ${this.cfg.server} (room: ${this.cfg.room}) …`);
    const ws = new WebSocket(this.url());
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectDelay = RECONNECT_MIN_MS;
      log('connected — standing by for audio.');
      void this.reportDevices();
    });

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        this.player.write(data as Buffer);
      } else {
        this.handleControl(data.toString());
      }
    });

    ws.on('close', () => {
      this.ws = null;
      this.player.stop();
      if (this.stopping) return;
      log(`disconnected — retrying in ${Math.round(this.reconnectDelay / 1000)}s`);
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    });

    ws.on('error', (err) => log('ws error:', (err as Error).message));
  }

  private handleControl(text: string): void {
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'hello':
        log(`joined room "${msg.room as string}"`);
        break;
      case 'peer':
        if (msg.role === 'web' && msg.online) void this.reportDevices();
        break;
      case 'error':
        log('server error:', msg.message);
        break;
      case 'list-devices':
        void this.reportDevices();
        break;
      case 'select-device':
        this.player.setDevice(String(msg.deviceId));
        log('output device set to', msg.deviceId);
        void this.reportDevices();
        break;
      case 'audio-begin':
        log(`audio-begin: ${msg.mode} ${msg.format} ${msg.filename ?? ''}`.trim());
        this.player.begin(String(msg.streamId));
        break;
      case 'audio-end':
        this.player.end();
        break;
      case 'stop':
        this.player.stop();
        this.sendJson({ type: 'status', state: 'idle' });
        break;
      case 'ping':
        this.sendJson({ type: 'pong', t: msg.t as number });
        break;
    }
  }

  private async reportDevices(): Promise<void> {
    const devices = await listOutputDevices();
    // Ensure the player's current device still exists; otherwise fall back.
    const selectedId = devices.some((d) => d.id === this.player.getDeviceId())
      ? this.player.getDeviceId()
      : (devices.find((d) => d.isDefault)?.id ?? devices[0]?.id ?? null);
    if (selectedId) this.player.setDevice(selectedId);
    this.sendJson({ type: 'devices', devices, selectedId });
  }

  private sendJson(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (cfg.listDevices) {
    await printDevices();
    return;
  }
  assertConfig(cfg);
  new Agent(cfg).start();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
