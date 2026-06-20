import { execFile } from 'node:child_process';

/**
 * Run a command and return its combined stdout + stderr **regardless of exit
 * code**. Many discovery tools (notably `ffmpeg -list_devices`) print to stderr
 * and/or exit non-zero, so we must not rely on a clean exit. Returns `null`
 * when the binary itself is missing (ENOENT) so callers can warn helpfully.
 */
function runCapture(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve(null);
        return;
      }
      resolve(`${stdout ?? ''}\n${stderr ?? ''}`);
    });
  });
}

export interface Device {
  id: string;
  name: string;
  isDefault: boolean;
}

/** A synthetic device meaning "let the OS pick the default output". */
export const DEFAULT_DEVICE: Device = {
  id: 'default',
  name: 'システム既定の出力',
  isDefault: true,
};

/**
 * Enumerate output (playback) devices for the current platform.
 * Always returns at least the synthetic "default" device so the UI is usable
 * even when enumeration tools are unavailable.
 */
export async function listOutputDevices(): Promise<Device[]> {
  try {
    if (process.platform === 'darwin') return await listMacDevices();
    if (process.platform === 'linux') return await listLinuxDevices();
  } catch {
    // Fall through to the default-only list.
  }
  return [DEFAULT_DEVICE];
}

// ---- macOS (CoreAudio via SwitchAudioSource) --------------------------------
//
// ffmpeg's audiotoolbox output device cannot list devices ("Cannot list sinks:
// Function not implemented"), so we enumerate and switch output devices with
// SwitchAudioSource (`brew install switchaudio-osx`). Playback always targets
// the current default device; selecting a speaker switches that default.
async function listMacDevices(): Promise<Device[]> {
  const out = await runCapture('SwitchAudioSource', ['-a', '-t', 'output']);
  if (out === null) {
    console.warn(
      '[cloud-voice-agent] 複数スピーカーの列挙には SwitchAudioSource が必要です。' +
        '`brew install switchaudio-osx` を実行してください（未導入でも既定の出力先には再生できます）。'
    );
    return [DEFAULT_DEVICE];
  }

  const current = (await runCapture('SwitchAudioSource', ['-c', '-t', 'output']))?.trim() ?? '';
  const devices: Device[] = [];
  for (const line of out.split('\n')) {
    const name = line.trim();
    if (!name) continue;
    // `-c` may print "Current audio device: <name>"; match either form.
    const isDefault = name === current || current.endsWith(name);
    devices.push({ id: name, name, isDefault });
  }
  if (devices.length > 0 && !devices.some((d) => d.isDefault)) {
    devices[0].isDefault = true;
  }
  return devices.length > 0 ? devices : [DEFAULT_DEVICE];
}

/**
 * Make `deviceId` the active output device. On macOS this switches the system
 * default output (via SwitchAudioSource) since ffmpeg renders to the default.
 * On Linux selection happens at playback time (pulse `-device`), so this is a
 * no-op there.
 */
export async function activateDevice(deviceId: string): Promise<boolean> {
  if (process.platform !== 'darwin') return true;
  if (!deviceId || deviceId === DEFAULT_DEVICE.id) return true;
  const result = await runCapture('SwitchAudioSource', ['-s', deviceId, '-t', 'output']);
  return result !== null;
}

// ---- Linux (PulseAudio / PipeWire, with ALSA fallback) ----------------------

export type LinuxBackend = 'pulse' | 'alsa';
let linuxBackend: LinuxBackend | null = null;

/** Which audio backend the player should target. `null` until first detected. */
export function getLinuxBackend(): LinuxBackend | null {
  return linuxBackend;
}

// Prefer PulseAudio/PipeWire when a sound server is actually running; otherwise
// fall back to ALSA (common on headless Raspberry Pi / server installs).
async function detectLinuxBackend(): Promise<LinuxBackend> {
  if (linuxBackend) return linuxBackend;
  const info = await runCapture('pactl', ['info']);
  const running = info !== null && /Server (Name|String|Version)|Default Sink/i.test(info);
  linuxBackend = running ? 'pulse' : 'alsa';
  return linuxBackend;
}

async function listLinuxDevices(): Promise<Device[]> {
  const backend = await detectLinuxBackend();
  return backend === 'pulse' ? listPulseDevices() : listAlsaDevices();
}

async function listPulseDevices(): Promise<Device[]> {
  const defaultSink = (await runCapture('pactl', ['get-default-sink']))?.trim() ?? '';
  const out = await runCapture('pactl', ['list', 'short', 'sinks']);
  if (out === null) return [DEFAULT_DEVICE];

  const devices: Device[] = [];
  for (const line of out.split('\n')) {
    const cols = line.split('\t');
    if (cols.length < 2) continue;
    const name = cols[1].trim();
    if (!name) continue;
    devices.push({ id: name, name, isDefault: name === defaultSink });
  }
  if (devices.length > 0 && !devices.some((d) => d.isDefault)) {
    devices[0].isDefault = true;
  }
  return devices.length > 0 ? devices : [DEFAULT_DEVICE];
}

// Parse `aplay -l`. Device ids are ALSA `plughw:CARD,DEV` strings (plughw lets
// ALSA convert sample formats, which is more forgiving than raw hw:). The
// synthetic "default" device is kept first since the ALSA default may route
// elsewhere (e.g. HDMI) and the user often wants to pick a specific card.
async function listAlsaDevices(): Promise<Device[]> {
  const out = await runCapture('aplay', ['-l']);
  if (out === null) {
    console.warn(
      '[cloud-voice-agent] ALSA の `aplay` が見つかりません。`sudo apt install alsa-utils` を実行してください。'
    );
    return [DEFAULT_DEVICE];
  }

  const devices: Device[] = [{ ...DEFAULT_DEVICE }];
  const re = /^card (\d+):\s+[^[]*\[([^\]]+)\],\s*device (\d+):\s+[^[]*\[([^\]]+)\]/;
  for (const line of out.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    const [, card, cardName, dev, devName] = m;
    const label = cardName === devName ? cardName : `${cardName} — ${devName}`;
    devices.push({ id: `plughw:${card},${dev}`, name: label, isDefault: false });
  }
  return devices;
}
