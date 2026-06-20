import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomRegistry, type Peer } from '../src/rooms.ts';

// RoomRegistry never touches the socket itself, so a stub is enough.
function peer(role: 'agent' | 'web', room = 'r1'): Peer {
  return { ws: {} as Peer['ws'], role, room };
}

test('a web peer joins a room and is discoverable', () => {
  const reg = new RoomRegistry();
  const web = peer('web');
  reg.add(web);

  assert.equal(reg.agentOf('r1'), null);
  assert.deepEqual(reg.webPeersOf('r1'), [web]);
});

test('an agent registers and is returned by agentOf', () => {
  const reg = new RoomRegistry();
  const agent = peer('agent');
  const evicted = reg.add(agent);

  assert.equal(evicted, null);
  assert.equal(reg.agentOf('r1'), agent);
});

test('a second agent evicts the first (last-writer-wins)', () => {
  const reg = new RoomRegistry();
  const first = peer('agent');
  const second = peer('agent');

  reg.add(first);
  const evicted = reg.add(second);

  assert.equal(evicted, first);
  assert.equal(reg.agentOf('r1'), second);
});

test('others() relays web -> agent and agent -> web', () => {
  const reg = new RoomRegistry();
  const agent = peer('agent');
  const web1 = peer('web');
  const web2 = peer('web');
  reg.add(agent);
  reg.add(web1);
  reg.add(web2);

  // A web peer's audio should reach only the agent.
  assert.deepEqual(reg.others(web1), [agent]);

  // The agent's status should reach every web peer.
  const targets = reg.others(agent);
  assert.equal(targets.length, 2);
  assert.ok(targets.includes(web1));
  assert.ok(targets.includes(web2));
});

test('removing peers cleans the room up', () => {
  const reg = new RoomRegistry();
  const agent = peer('agent');
  const web = peer('web');
  reg.add(agent);
  reg.add(web);

  reg.remove(agent);
  assert.equal(reg.agentOf('r1'), null);

  reg.remove(web);
  assert.deepEqual(reg.webPeersOf('r1'), []);
});

test('rooms are isolated from each other', () => {
  const reg = new RoomRegistry();
  const a1 = peer('agent', 'room-a');
  const w2 = peer('web', 'room-b');
  reg.add(a1);
  reg.add(w2);

  // A web peer in room-b has no agent, so nothing to relay to.
  assert.deepEqual(reg.others(w2), []);
  assert.equal(reg.agentOf('room-a'), a1);
  assert.equal(reg.agentOf('room-b'), null);
});
