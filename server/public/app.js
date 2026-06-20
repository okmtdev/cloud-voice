// Cloud Voice — browser client (3-step wizard: connect → choose → play).
// Talks to the relay over a single WebSocket. See ../protocol.md.

const $ = (id) => document.getElementById(id);

const els = {
  stepper: $('stepper'),
  viewport: $('viewport'),
  track: $('track'),
  // step 1
  room: $('room'),
  token: $('token'),
  connectBtn: $('connect-btn'),
  connStatus: $('conn-status'),
  agentStatus: $('agent-status'),
  // step 2
  deviceSelect: $('device-select'),
  deviceStatus: $('device-status'),
  refreshBtn: $('refresh-btn'),
  // step 3
  fileInput: $('file-input'),
  playFileBtn: $('play-file-btn'),
  micBtn: $('mic-btn'),
  stopBtn: $('stop-btn'),
  playStatus: $('play-status'),
  log: $('log'),
};

const CHUNK_SIZE = 64 * 1024;
const STEP_COUNT = 3;

let ws = null;
let connected = false;
let mediaRecorder = null;
let micStream = null;
let micStreamId = null;

// ---- Wizard navigation ------------------------------------------------------

let currentStep = 0;
// Steps 2 and 3 are only reachable once connected.
function maxStep() {
  return connected ? STEP_COUNT - 1 : 0;
}

function renderStep() {
  els.track.style.transition = '';
  els.track.style.transform = `translateX(-${currentStep * 100}%)`;
  [...els.stepper.children].forEach((dot, i) => {
    dot.classList.toggle('is-active', i === currentStep);
    dot.classList.toggle('is-done', i < currentStep && connected);
    dot.disabled = i > maxStep();
  });
}

function goTo(step) {
  const target = Math.max(0, Math.min(step, maxStep()));
  currentStep = target;
  renderStep();
}

function next() {
  goTo(currentStep + 1);
}
function prev() {
  goTo(currentStep - 1);
}

// Buttons with data-go="N" jump to that step.
document.querySelectorAll('[data-go]').forEach((btn) => {
  btn.addEventListener('click', () => goTo(Number(btn.dataset.go)));
});
[...els.stepper.children].forEach((dot) => {
  dot.addEventListener('click', () => goTo(Number(dot.dataset.step)));
});

// ---- Swipe (pointer drag) ---------------------------------------------------

let dragStartX = null;
let dragDX = 0;
let dragging = false;

els.viewport.addEventListener('pointerdown', (e) => {
  // Don't hijack interactions with form controls.
  if (e.target.closest('input, select, button, summary, textarea, a')) return;
  dragStartX = e.clientX;
  dragging = true;
  dragDX = 0;
  els.track.style.transition = 'none';
});

window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  dragDX = e.clientX - dragStartX;
  // Rubber-band at the edges / locked steps.
  const atStart = currentStep <= 0 && dragDX > 0;
  const atEnd = currentStep >= maxStep() && dragDX < 0;
  const dx = atStart || atEnd ? dragDX * 0.25 : dragDX;
  const w = els.viewport.clientWidth || 1;
  els.track.style.transform = `translateX(${-currentStep * w + dx}px)`;
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  const w = els.viewport.clientWidth || 1;
  if (dragDX < -w * 0.18) next();
  else if (dragDX > w * 0.18) prev();
  else renderStep();
  dragDX = 0;
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', renderStep);

// ---- Helpers ----------------------------------------------------------------

function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
  els.log.textContent = `${line}\n${els.log.textContent}`.slice(0, 8000);
}

function setBadge(el, text, variant) {
  el.textContent = text;
  el.className = `badge badge-${variant}`;
}

function newStreamId() {
  return Math.random().toString(36).slice(2, 10);
}

function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function setConnected(state) {
  connected = state;
  els.connStatus.textContent = state ? '接続中' : '未接続';
  els.connStatus.className = `badge ${state ? 'badge-on' : 'badge-off'}`;
  $('to-2').disabled = !state;
  if (!state) goTo(0); // can't stay on later steps while disconnected
  else renderStep();
}

function setAgent(online) {
  setBadge(els.agentStatus, online ? 'スピーカー 接続中' : 'スピーカー 待機なし', online ? 'on' : 'off');
}

// ---- WebSocket --------------------------------------------------------------

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

  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  els.connStatus.textContent = '接続中…';
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  ws.addEventListener('open', () => {
    setConnected(true);
    log('サーバーに接続しました');
    send({ type: 'list-devices' });
  });

  ws.addEventListener('close', () => {
    setConnected(false);
    setAgent(false);
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
      if (/unauthorized/i.test(msg.message)) setConnected(false);
      break;
    case 'peer':
      if (msg.role === 'agent') {
        setAgent(msg.online);
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
        msg.state === 'playing' ? 'playing' : msg.state === 'error' ? 'off' : 'idle'
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
    setBadge(els.deviceStatus, '未取得', 'muted');
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
  const sel = devices.find((d) => d.id === selectedId) ?? devices[0];
  setBadge(els.deviceStatus, sel ? sel.name : `${devices.length} 台`, 'on');
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
  els.micBtn.classList.add('is-recording');
  els.micBtn.classList.remove('btn-primary');
  els.micBtn.classList.add('btn-danger');
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
  els.micBtn.classList.remove('is-recording', 'btn-danger');
  els.micBtn.classList.add('btn-primary');
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

// Restore last-used room/token and auto-connect when a code is stored.
els.room.value = localStorage.getItem('cv.room') ?? '';
els.token.value = localStorage.getItem('cv.token') ?? '';
renderStep();
if (els.room.value) {
  log('保存済みのペアリングコードで自動接続します…');
  connect();
}
