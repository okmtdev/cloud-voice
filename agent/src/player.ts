import { spawn, type ChildProcess } from 'node:child_process';
import { DEFAULT_DEVICE } from './devices.js';

export type PlayerEvent = 'playing' | 'idle' | 'error';

/**
 * Streams audio to a chosen output device using ffmpeg.
 *
 * ffmpeg is used as both the decoder (it auto-detects wav/mp3/webm/opus/…) and
 * the output sink with explicit device selection:
 *   - macOS: `-f audiotoolbox -audio_device_index <id>`
 *   - Linux: `-f pulse -device <sink-name>`
 *
 * Audio bytes are fed to ffmpeg's stdin, so a stream can start playing before
 * it has fully arrived — which is what makes near-real-time mic playback work.
 */
export class Player {
  private proc: ChildProcess | null = null;
  private deviceId: string;
  private currentStreamId: string | null = null;

  constructor(
    deviceId: string | null,
    private onEvent: (event: PlayerEvent, streamId: string | null, message?: string) => void
  ) {
    this.deviceId = deviceId ?? DEFAULT_DEVICE.id;
  }

  setDevice(deviceId: string): void {
    this.deviceId = deviceId;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  /** Begin a new playback stream; any current stream is stopped first. */
  begin(streamId: string): void {
    this.stop();
    this.currentStreamId = streamId;

    const args = ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...this.outputArgs()];
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.proc = proc;

    proc.on('spawn', () => this.onEvent('playing', streamId));

    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      const hint =
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'ffmpeg が見つかりません。ffmpeg をインストールしてください。'
          : err.message;
      this.onEvent('error', streamId, hint);
      this.cleanup(proc);
    });

    proc.on('close', (code) => {
      if (this.proc !== proc) return; // superseded by a newer stream
      if (code && code !== 0 && stderr.trim()) {
        this.onEvent('error', streamId, stderr.trim().split('\n').slice(-1)[0]);
      } else {
        this.onEvent('idle', streamId);
      }
      this.cleanup(proc);
    });
  }

  /** Feed audio bytes for the current stream into ffmpeg. */
  write(chunk: Buffer): void {
    const stdin = this.proc?.stdin;
    if (stdin && stdin.writable) {
      stdin.write(chunk);
    }
  }

  /** Signal end-of-stream; ffmpeg flushes remaining audio then exits. */
  end(): void {
    const stdin = this.proc?.stdin;
    if (stdin && stdin.writable) stdin.end();
  }

  /** Stop playback immediately. */
  stop(): void {
    const proc = this.proc;
    if (!proc) return;
    this.proc = null;
    this.currentStreamId = null;
    try {
      proc.stdin?.destroy();
    } catch {
      /* ignore */
    }
    proc.kill('SIGKILL');
  }

  private cleanup(proc: ChildProcess): void {
    if (this.proc === proc) {
      this.proc = null;
      this.currentStreamId = null;
    }
  }

  private outputArgs(): string[] {
    const isDefault = !this.deviceId || this.deviceId === DEFAULT_DEVICE.id;
    if (process.platform === 'darwin') {
      // ffmpeg's audiotoolbox output device cannot enumerate devices, and its
      // -audio_device_index maps to an opaque CoreAudio ordering. So on macOS
      // we always render to the *current default* output device; choosing a
      // speaker is done by switching the system default (see devices.ts /
      // activateDevice, backed by SwitchAudioSource).
      return ['-f', 'audiotoolbox', '-'];
    }
    if (process.platform === 'linux') {
      const args = ['-f', 'pulse'];
      if (!isDefault) args.push('-device', this.deviceId);
      args.push('CloudVoice'); // pulse "output" = stream/app name
      return args;
    }
    // Fallback for other platforms: let ffmpeg pick a default output via SDL.
    return ['-f', 'sdl', 'CloudVoice'];
  }
}
