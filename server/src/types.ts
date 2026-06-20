// Shared protocol types for the Cloud Voice relay.
// See protocol.md for the full specification.

export type Role = 'agent' | 'web';

export interface Device {
  id: string;
  name: string;
  isDefault: boolean;
}

export type PlaybackState = 'idle' | 'playing' | 'error';

// web -> agent
export interface ListDevicesMsg {
  type: 'list-devices';
}
export interface SelectDeviceMsg {
  type: 'select-device';
  deviceId: string;
}
export interface AudioBeginMsg {
  type: 'audio-begin';
  streamId: string;
  format: string;
  mode: 'file' | 'mic';
  filename?: string;
  mime?: string;
}
export interface AudioEndMsg {
  type: 'audio-end';
  streamId: string;
}
export interface StopMsg {
  type: 'stop';
}
export interface PingMsg {
  type: 'ping';
  t: number;
}

// agent -> web
export interface DevicesMsg {
  type: 'devices';
  devices: Device[];
  selectedId: string | null;
}
export interface StatusMsg {
  type: 'status';
  state: PlaybackState;
  streamId?: string;
  message?: string;
}
export interface PongMsg {
  type: 'pong';
  t: number;
}

// server -> peer
export interface HelloMsg {
  type: 'hello';
  role: Role;
  room: string;
}
export interface PeerMsg {
  type: 'peer';
  role: Role;
  online: boolean;
}
export interface ErrorMsg {
  type: 'error';
  message: string;
}

export type WebToAgent =
  | ListDevicesMsg
  | SelectDeviceMsg
  | AudioBeginMsg
  | AudioEndMsg
  | StopMsg
  | PingMsg;

export type AgentToWeb = DevicesMsg | StatusMsg | PongMsg;

export type ServerMsg = HelloMsg | PeerMsg | ErrorMsg;

export type AnyMessage = WebToAgent | AgentToWeb | ServerMsg;
