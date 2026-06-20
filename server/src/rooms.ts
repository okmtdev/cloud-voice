import type { WebSocket } from 'ws';
import type { Role } from './types.js';

export interface Peer {
  ws: WebSocket;
  role: Role;
  room: string;
}

/**
 * A room pairs exactly one agent with any number of web clients.
 * Audio + control frames are relayed between them; the server never
 * inspects the binary audio payload.
 */
class Room {
  agent: Peer | null = null;
  web = new Set<Peer>();

  isEmpty(): boolean {
    return this.agent === null && this.web.size === 0;
  }
}

export class RoomRegistry {
  private rooms = new Map<string, Room>();

  private get(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new Room();
      this.rooms.set(roomId, room);
    }
    return room;
  }

  /** Register a peer. Returns the previous agent if it was evicted. */
  add(peer: Peer): Peer | null {
    const room = this.get(peer.room);
    if (peer.role === 'agent') {
      const previous = room.agent;
      room.agent = peer;
      return previous && previous !== peer ? previous : null;
    }
    room.web.add(peer);
    return null;
  }

  remove(peer: Peer): void {
    const room = this.rooms.get(peer.room);
    if (!room) return;
    if (peer.role === 'agent' && room.agent === peer) {
      room.agent = null;
    } else {
      room.web.delete(peer);
    }
    if (room.isEmpty()) this.rooms.delete(peer.room);
  }

  agentOf(roomId: string): Peer | null {
    return this.rooms.get(roomId)?.agent ?? null;
  }

  webPeersOf(roomId: string): Peer[] {
    const room = this.rooms.get(roomId);
    return room ? [...room.web] : [];
  }

  /** All peers in the room except `from`. */
  others(from: Peer): Peer[] {
    const room = this.rooms.get(from.room);
    if (!room) return [];
    const out: Peer[] = [];
    if (from.role === 'web') {
      if (room.agent) out.push(room.agent);
    } else {
      out.push(...room.web);
    }
    return out;
  }
}
