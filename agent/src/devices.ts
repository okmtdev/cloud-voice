import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

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

// ---- macOS (CoreAudio via ffmpeg's audiotoolbox output) ---------------------
//
// `ffmpeg -f audiotoolbox -list_devices true -i ""` prints the output devices
// and their indices to stderr. The index is what we pass to ffmpeg later via
// `-audio_device_index`, so listing through ffmpeg keeps the ids consistent.
async function listMacDevices(): Promise<Device[]> {
  let stderr = '';
  try {
    await exec('ffmpeg', ['-hide_banner', '-f', 'audiotoolbox', '-list_devices', 'true', '-i', '']);
  } catch (err) {
    // ffmpeg exits non-zero because the dummy input fails — the device list is
    // still written to stderr, which we read from the thrown error.
    stderr = (err as { stderr?: string }).stderr ?? '';
  }

  const devices: Device[] = [];
  for (const line of stderr.split('\n')) {
    // Example: "[AudioToolbox @ 0x..] [0] Built-in Output"
    const m = line.match(/\[(\d+)\]\s+(.+?)\s*$/);
    if (m) {
      devices.push({ id: m[1], name: m[2], isDefault: devices.length === 0 });
    }
  }
  return devices.length > 0 ? devices : [DEFAULT_DEVICE];
}

// ---- Linux (PulseAudio / PipeWire sinks) ------------------------------------
async function listLinuxDevices(): Promise<Device[]> {
  let defaultSink = '';
  try {
    const { stdout } = await exec('pactl', ['get-default-sink']);
    defaultSink = stdout.trim();
  } catch {
    // older pactl: ignore
  }

  const { stdout } = await exec('pactl', ['list', 'short', 'sinks']);
  const devices: Device[] = [];
  for (const line of stdout.split('\n')) {
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
