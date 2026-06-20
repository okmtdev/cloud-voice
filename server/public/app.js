// Cloud Voice — browser client (upload + microphone).
// Talks to the relay over a single WebSocket. See ../protocol.md.

const $ = (id) => document.getElementById(id);

const els = {
  room: $('room'),
  token: $('token'),
  connectBtn: $('connect-btn'),
  connStatus: $('conn-status'),
  agentStatus: $('agent-status'),
  deviceCard: $('device-card'),
  deviceSelect: $('device-select'),
  refreshBtn: $('refresh-btn'),
  playCard: $('play-card'),
  fileInput: $('file-input'),
  playFileBtn: $('play-file-btn'),
  micBtn: $('mic-btn'),
  stopBtn: $('stop-btn'),
  playStatus: $('play-status'),
  log: $('log'),
};

const CHUNK_SIZE = 64 * 1024;

let ws = null;
let mediaRecorder = null;
let micStream = null;
let micStreamId = null;

function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
  els.log.textContent = `${line}\n${els.log.textContent}`.slice(0, 8000);
}

function setBadge(el, text, cls) {
  el.textContent = text;
  el.className = `badge ${cls}`;
}

function newStreamId() {
  return Math.random().toString(36).slice(2, 10);
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
  const room = els.room.value.trim();
  if (!room) {
    log('ペアリングコードを入力してください');
    return;
  }
  localStorage.setItem('cv.room', room);
  localStorage.setItem('cv.token', els.token.value.trim());

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const params = new URLSearchParams({ role: 'web', room });
  const token = els.token.value.trim();
  if (token) params.set('token', token);
  const url = `${proto}://${location.host}/ws?${params}`;

  if (ws) ws.close();
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.addEventListener('open', () => {
    setBadge(els.connStatus, '接続中', 'online');
    els.deviceCard.hidden = false;
    els.playCard.hidden = false;
    log('サーバーに接続しました');
    send({ type: 'list-devices' });
  });

  ws.addEventListener('close', () => {
    setBadge(els.connStatus, '未接続', 'offline');
    setBadge(els.agentStatus, 'スピーカー: 待機なし', 'offline');
    log('切断しました');
  });

  ws.addEventListener('error', () => log('WebSocket エラー'));

  ws.addEventListener('message', (ev) => {
    if (typeof ev.data !== 'string') return; // web client ignores binary
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    handleMessage(msg);
  });
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'hello':
      log(`room "${msg.room}" に参加`);
      break;
    case 'error':
      log(`エラー: ${msg.message}`);
      break;
    case 'peer':
      if (msg.role === 'agent') {
        setBadge(
          els.agentStatus,
          msg.online ? 'スピーカー: 接続中' : 'スピーカー: 待機なし',
          msg.online ? 'online' : 'offline'
        );
        if (msg.online) send({ type: 'list-devices' });
      }
      break;
    case 'devices':
      renderDevices(msg.devices, msg.selectedId);
      break;
    case 'status':
      setBadge(
        els.playStatus,
        msg.state,
        msg.state === 'playing' ? 'playing' : msg.state === 'error' ? 'offline' : 'idle'
      );
      if (msg.message) log(`status: ${msg.state} ${msg.message}`);
      break;
    case 'pong':
      log(`pong ${Date.now() - msg.t}ms`);
      break;
  }
}

function renderDevices(devices, selectedId) {
  els.deviceSelect.innerHTML = '';
  if (!devices || devices.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = '（デバイスなし / スピーカー未接続）';
    opt.disabled = true;
    els.deviceSelect.append(opt);
    els.playFileBtn.disabled = true;
    return;
  }
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.isDefault ? `${d.name}（既定）` : d.name;
    if (d.id === selectedId) opt.selected = true;
    els.deviceSelect.append(opt);
  }
  els.playFileBtn.disabled = false;
  log(`${devices.length} 個の出力デバイスを取得`);
}

// ---- File playback ----------------------------------------------------------

async function playFile() {
  const file = els.fileInput.files?.[0];
  if (!file) {
    log('ファイルを選んでください');
    return;
  }
  const streamId = newStreamId();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  send({
    type: 'audio-begin',
    streamId,
    format: ext,
    mode: 'file',
    filename: file.name,
    mime: file.type,
  });

  const buf = await file.arrayBuffer();
  for (let offset = 0; offset < buf.byteLength; offset += CHUNK_SIZE) {
    ws.send(buf.slice(offset, offset + CHUNK_SIZE));
  }
  send({ type: 'audio-end', streamId });
  log(`送信完了: ${file.name} (${buf.byteLength} bytes)`);
}

// ---- Microphone streaming ---------------------------------------------------

async function toggleMic() {
  if (mediaRecorder) {
    stopMic();
    return;
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    log(`マイクを使用できません: ${err}`);
    return;
  }

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  micStreamId = newStreamId();
  send({ type: 'audio-begin', streamId: micStreamId, format: 'webm', mode: 'mic', mime });

  mediaRecorder = new MediaRecorder(micStream, { mimeType: mime });
  mediaRecorder.addEventListener('dataavailable', async (e) => {
    if (e.data && e.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
      ws.send(await e.data.arrayBuffer());
    }
  });
  mediaRecorder.start(250); // emit a chunk every 250ms for low latency
  els.micBtn.textContent = '録音停止';
  els.micBtn.classList.add('danger');
  log('マイク入力を開始');
}

function stopMic() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  micStream?.getTracks().forEach((t) => t.stop());
  if (micStreamId) send({ type: 'audio-end', streamId: micStreamId });
  mediaRecorder = null;
  micStream = null;
  micStreamId = null;
  els.micBtn.textContent = '録音開始';
  els.micBtn.classList.remove('danger');
  log('マイク入力を停止');
}

// ---- Wiring -----------------------------------------------------------------

els.connectBtn.addEventListener('click', connect);
els.refreshBtn.addEventListener('click', () => send({ type: 'list-devices' }));
els.deviceSelect.addEventListener('change', () =>
  send({ type: 'select-device', deviceId: els.deviceSelect.value })
);
els.playFileBtn.addEventListener('click', playFile);
els.micBtn.addEventListener('click', toggleMic);
els.stopBtn.addEventListener('click', () => {
  stopMic();
  send({ type: 'stop' });
});

// Restore last-used room/token.
els.room.value = localStorage.getItem('cv.room') ?? '';
els.token.value = localStorage.getItem('cv.token') ?? '';
