# Cloud Voice WebSocket Protocol

Cloud Voice uses a single WebSocket connection per peer. The cloud **server**
acts as a relay (and never touches the audio bytes beyond forwarding them)
between two kinds of peers:

- **agent** — the always-on desktop client running on a Mac / Linux machine that
  owns the physical speakers.
- **web** — a browser tab (the upload / microphone UI) that wants to make a
  speaker talk.

Peers are grouped into a **room** identified by a *pairing code*. An agent
registers a room; web clients join the same room to reach that agent.

```
 ┌─────────┐      WebSocket       ┌──────────┐      WebSocket      ┌──────────┐
 │ Browser │  ───────────────▶    │  Server  │   ───────────────▶  │  Agent   │
 │  (web)  │   audio + control    │  (relay) │   audio + control   │ (speaker)│
 └─────────┘  ◀───────────────    └──────────┘   ◀───────────────  └──────────┘
                   status                              status
```

## Connection

```
GET /ws?role=<agent|web>&room=<pairingCode>[&token=<authToken>]
```

- `role` — `agent` or `web` (required).
- `room` — pairing code that groups peers (required).
- `token` — optional shared secret. If the server is started with
  `CLOUD_VOICE_TOKEN`, every connection must present a matching `token`.

A room may have **one** active agent at a time. A new agent registration for an
occupied room replaces the previous agent (last-writer-wins) so that restarting
the desktop client just works.

## Message framing

Two kinds of WebSocket frames are used:

1. **Text frames** — UTF-8 JSON control messages (see below).
2. **Binary frames** — raw audio payload for the stream announced by the most
   recent `audio-begin` control message on that connection.

## Control messages (JSON)

Every JSON message has a `type` field.

### web → agent

| type           | fields                                              | meaning                                            |
| -------------- | --------------------------------------------------- | -------------------------------------------------- |
| `list-devices` | —                                                   | Ask the agent to report its output devices.        |
| `select-device`| `deviceId: string`                                  | Choose which speaker future audio plays from.      |
| `audio-begin`  | `streamId, format, filename?, mime?, mode`          | A new audio stream starts. `mode` = `file`\|`mic`. |
| `audio-end`    | `streamId`                                          | The stream is complete; flush and finish playback. |
| `stop`         | —                                                   | Stop whatever is currently playing immediately.    |
| `ping`         | `t: number`                                         | Liveness / latency probe.                          |

`format` is a hint such as `wav`, `mp3`, `webm`, `ogg`. The agent relies on
ffmpeg to auto-detect the real container, so the hint is advisory.

Binary frames sent after an `audio-begin` (and before its `audio-end`) are the
audio bytes for that `streamId`.

### agent → web

| type        | fields                                          | meaning                                       |
| ----------- | ----------------------------------------------- | --------------------------------------------- |
| `devices`   | `devices: Device[], selectedId: string \| null` | Current output devices and the active one.    |
| `status`    | `state: 'idle'\|'playing'\|'error', streamId?, message?` | Playback state changes.              |
| `pong`      | `t: number`                                     | Reply to `ping`.                              |

```ts
interface Device {
  id: string;       // platform device id passed back in select-device
  name: string;     // human friendly label
  isDefault: boolean;
}
```

### server → peer (any role)

| type     | fields              | meaning                                              |
| -------- | ------------------- | ---------------------------------------------------- |
| `hello`  | `role, room`        | Sent on successful connection.                       |
| `peer`   | `role, online`      | The other side of the room connected / disconnected. |
| `error`  | `message`           | Fatal protocol / auth error (connection then closes).|

## Lifecycle example (play an mp3 file)

```
web  → server → agent : {"type":"audio-begin","streamId":"a1","format":"mp3","mode":"file","filename":"hello.mp3"}
web  → server → agent : <binary chunk 1>
web  → server → agent : <binary chunk 2>
web  → server → agent : {"type":"audio-end","streamId":"a1"}
agent → server → web  : {"type":"status","state":"playing","streamId":"a1"}
agent → server → web  : {"type":"status","state":"idle","streamId":"a1"}
```

Microphone streaming is identical except `mode` is `mic`, binary chunks arrive
continuously in near real time, and the agent begins playback as soon as the
first chunks land instead of waiting for `audio-end`.
