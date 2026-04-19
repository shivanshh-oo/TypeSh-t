

'use strict';

const CHARSETS = {
  standard: ` '.\`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#WM&8%B@$`,
  blocks:   ' ░▒▓█',
  simple:   ' .:-=+*#@',
  letters:  ' :.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789WM',
  binary:   ' 01',
};


const CHAR_ASPECT = 0.55; 


const PIXEL_SIZE_MAP = {
  1:  [20,  20, 'XS'],
  2:  [30,  18, 'S' ],
  3:  [45,  15, 'S+'],
  4:  [65,  13, 'M-'],
  5:  [90,  11, 'M' ],
  6:  [120, 9,  'M+'],
  7:  [150, 8,  'L' ],
  8:  [180, 7,  'L+'],
  9:  [200, 6,  'XL'],
  10: [220, 5,  'XX'],
};

let videoStream   = null;
let animFrameId   = null;
let currentTab    = 'camera';
let uploadedImage = null;

const video          = document.getElementById('video');
const canvas         = document.getElementById('hiddenCanvas');
const ctx            = canvas.getContext('2d', { willReadFrequently: true });
const asciiOut       = document.getElementById('asciiOutput');
const dimBadge       = document.getElementById('dimBadge');
const renderDot      = document.getElementById('renderDot');
const renderStatusEl = document.getElementById('renderStatus');
const camDot         = document.getElementById('camDot');
const camStatusEl    = document.getElementById('camStatus');
const camPlaceholder = document.getElementById('camPlaceholder');

const pixelSizeEl   = document.getElementById('pixelSize');
const textColorEl   = document.getElementById('textColor');
const bgColorEl     = document.getElementById('bgColor');
const colorHexEl    = document.getElementById('colorHex');
const bgHexEl       = document.getElementById('bgHex');
const charsetEl     = document.getElementById('charset');
const customCharsEl = document.getElementById('customChars');
const invertCheck   = document.getElementById('invertCheck');

function getSettings() {
  const level  = parseInt(pixelSizeEl.value);
  const [cols, fontSize] = PIXEL_SIZE_MAP[level];

  const sel   = charsetEl.value;
  const chars = sel === 'custom' ? (customCharsEl.value || ' .:-=+*#@') : CHARSETS[sel];

  return {
    cols,
    fontSize,
    color:  textColorEl.value,
    bg:     bgColorEl.value,
    chars,
    invert: invertCheck.checked,
  };
}

function brightnessToChar(b, chars, invert) {
  const contrast = 1.4;
  let contrastLum = ((b / 255 - 0.5) * contrast + 0.5) * 255;
  
  
  contrastLum = Math.max(0, Math.min(255, contrastLum));

  // Determine index (Sparse -> Dense)
  const t   = invert ? (255 - contrastLum) : contrastLum;
  const idx = Math.floor((t / 255) * (chars.length - 1));
  
  return chars[idx];
}

// ── Core render ────────────────────────────────────────────
function imageToAscii(source) {
  const { cols, chars, invert } = getSettings();

  const srcW = source.videoWidth  || source.naturalWidth  || source.width;
  const srcH = source.videoHeight || source.naturalHeight || source.height;
  if (!srcW || !srcH) return null;

  const rows = Math.round(cols / (srcW / srcH) * CHAR_ASPECT);

  canvas.width  = cols;
  canvas.height = rows;
  ctx.drawImage(source, 0, 0, cols, rows);

  const data  = ctx.getImageData(0, 0, cols, rows).data;
  const lines = [];

  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      // Perceived luminance formula
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      line += brightnessToChar(lum, chars, invert);
    }
    lines.push(line);
  }

  return { text: lines.join('\n'), cols, rows };
}

// ── Apply to DOM ───────────────────────────────────────────
function applyAscii(result) {
  if (!result) return;
  const { fontSize, color, bg } = getSettings();
  asciiOut.textContent      = result.text;
  asciiOut.style.color      = color;
  asciiOut.style.background = bg;
  asciiOut.style.fontSize   = fontSize + 'px';
  // FIX 4: Strict CSS enforcements to prevent grid collapsing
  asciiOut.style.lineHeight = '1.0'; 
  asciiOut.style.whiteSpace = 'pre';
  asciiOut.style.fontFamily = '"IBM Plex Mono", "Courier New", monospace';
  
  dimBadge.textContent      = `${result.cols} × ${result.rows}`;
}

// ── Render single frame ────────────────────────────────────
function renderNow() {
  if (currentTab === 'camera' && videoStream) {
    applyAscii(imageToAscii(video));
    setRenderStatus('live', true);
  } else if (currentTab === 'upload' && uploadedImage) {
    applyAscii(imageToAscii(uploadedImage));
    setRenderStatus('static', true);
  } else {
    setRenderStatus('idle', false);
  }
}

// ── Animation loop ─────────────────────────────────────────
function startLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  const frame = () => {
    if (!videoStream) return;
    applyAscii(imageToAscii(video));
    animFrameId = requestAnimationFrame(frame);
  };
  animFrameId = requestAnimationFrame(frame);
}

function stopLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = null;
}

// ── Camera ─────────────────────────────────────────────────
async function startCamera() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = videoStream;
    await video.play();
    camPlaceholder.style.display = 'none';
    document.getElementById('startCamBtn').disabled = true;
    document.getElementById('stopCamBtn').disabled  = false;
    setCamStatus('camera active', true);
    setRenderStatus('live', true);
    startLoop();
  } catch (err) {
    setCamStatus('access denied', false, true);
    showToast('Camera access denied — check browser permissions');
  }
}

function stopCamera() {
  stopLoop();
  if (videoStream) { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
  video.srcObject = null;
  camPlaceholder.style.display = 'flex';
  document.getElementById('startCamBtn').disabled = false;
  document.getElementById('stopCamBtn').disabled  = true;
  setCamStatus('camera off', false);
  setRenderStatus('idle', false);
}

// ── Upload ─────────────────────────────────────────────────
function handleFileInput(e) {
  const file = e.target.files[0];
  if (file) loadImageFile(file);
}

function loadImageFile(file) {
  if (!file.type.startsWith('image/')) { showToast('Please upload a valid image file'); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img  = new Image();
    img.onload = () => {
      uploadedImage = img;
      document.getElementById('uploadPreview').src = ev.target.result;
      document.getElementById('uploadPreviewWrap').style.display = 'block';
      applyAscii(imageToAscii(img));
      setRenderStatus('static', true);
      showToast('Image loaded');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.add('drag-over');
}
function handleDragLeave() {
  document.getElementById('dropZone').classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadImageFile(file);
}

// ── Tabs ───────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  ['camera', 'upload'].forEach(t => {
    const key = t.charAt(0).toUpperCase() + t.slice(1);
    document.getElementById(`tab${key}`).classList.toggle('active', t === tab);
    document.getElementById(`panel${key}`).classList.toggle('active', t === tab);
  });
  if (tab === 'upload') { stopLoop(); if (uploadedImage) renderNow(); }
  else                  { if (videoStream) startLoop(); }
}

// ── Control handlers ───────────────────────────────────────
function onPixelSize(v) {
  const [, , label] = PIXEL_SIZE_MAP[v];
  document.getElementById('pixelSizeVal').textContent = label;
  renderNow();
}

function onColorChange(v) { colorHexEl.textContent = v; renderNow(); }
function onBgChange(v)    { bgHexEl.textContent = v;    renderNow(); }

function setColor(hex) { textColorEl.value = hex; colorHexEl.textContent = hex; renderNow(); }
function setBg(hex)    { bgColorEl.value  = hex; bgHexEl.textContent    = hex; renderNow(); }

function onCharsetChange() {
  customCharsEl.style.display = charsetEl.value === 'custom' ? 'block' : 'none';
  renderNow();
}

customCharsEl.addEventListener('input', renderNow);

// ── Status ─────────────────────────────────────────────────
function setCamStatus(msg, active, error = false) {
  camStatusEl.textContent = msg;
  camDot.className = 'status-dot' + (active ? ' active' : error ? ' error' : '');
}
function setRenderStatus(msg, active) {
  renderStatusEl.textContent = msg;
  renderDot.className = 'status-dot' + (active ? ' active' : '');
}

// ── Export: PNG ────────────────────────────────────────────
function downloadImage() {
  const text = asciiOut.textContent;
  if (!text.trim()) { showToast('Nothing to export yet'); return; }

  const { fontSize, color, bg } = getSettings();
  const lines   = text.split('\n');
  const ec      = document.createElement('canvas');
  const ectx    = ec.getContext('2d');
  const fs      = Math.max(fontSize, 8);
  const pad     = 20;

  ectx.font   = `${fs}px "IBM Plex Mono", "Courier New", monospace`;
  const charW = ectx.measureText('M').width;
  const charH = fs * 1.15;

  ec.width  = Math.ceil((lines[0]?.length || 0) * charW) + pad * 2;
  ec.height = Math.ceil(lines.length * charH) + pad * 2;

  ectx.fillStyle    = bg;
  ectx.fillRect(0, 0, ec.width, ec.height);
  ectx.font         = `${fs}px "IBM Plex Mono", "Courier New", monospace`;
  ectx.fillStyle    = color;
  ectx.textBaseline = 'top';

  lines.forEach((line, i) => ectx.fillText(line, pad, pad + i * charH));

  const a     = document.createElement('a');
  a.download  = `ascii-art-${Date.now()}.png`;
  a.href      = ec.toDataURL('image/png');
  a.click();
  showToast('PNG saved');
}

// ── Export: Copy ───────────────────────────────────────────
function copyToClipboard() {
  const text = asciiOut.textContent;
  if (!text.trim()) { showToast('Nothing to copy yet'); return; }
  navigator.clipboard.writeText(text)
    .then(()  => showToast('Copied to clipboard'))
    .catch(()  => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Copied to clipboard');
    });
}

// ── Toast ──────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Responsive ─────────────────────────────────────────────
function applyLayout() {
  const grid = document.querySelector('.main-grid');
  if (grid) grid.style.gridTemplateColumns = window.innerWidth < 900 ? '1fr' : '320px 1fr';
}
window.addEventListener('resize', applyLayout);
applyLayout();

// ── Slider track fill ──────────────────────────────────────
function updateTrack(input) {
  const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.background =
    `linear-gradient(90deg, rgba(200,150,60,0.55) ${pct}%, rgba(200,150,60,0.12) ${pct}%)`;
}
document.querySelectorAll('input[type=range]').forEach(el => {
  updateTrack(el);
  el.addEventListener('input', () => updateTrack(el));
});

// ── Init placeholder ───────────────────────────────────────
(function init() {
  asciiOut.textContent = [
    '                                          ',
    '  ██████╗  ██████╗ ██╗██╗                ',
    '  ██╔══██╗██╔════╝██║██║                ',
    '  ███████║╚█████╗ ██║██║                ',
    '  ██╔══██║ ╚═══██╗██║██║                ',
    '  ██║  ██║██████╔╝██║██████╗            ',
    '  ╚═╝  ╚═╝╚═════╝ ╚═╝╚═════╝            ',
    '                                          ',
    '  ┌──────────────────────────────────┐   ',
    '  │  Start camera or upload image    │   ',
    '  │  to begin real-time conversion   │   ',
    '  │                                  │   ',
    '  │  Pixel Size slider controls      │   ',
    '  │  both detail and character size  │   ',
    '  │  simultaneously — drag left for  │   ',
    '  │  blocky pixels, right for fine   │   ',
    '  └──────────────────────────────────┘   ',
    '                                          ',
  ].join('\n');
  asciiOut.style.color      = '#c8963c';
  asciiOut.style.background = '#000000';
  asciiOut.style.fontSize   = '9px';
  asciiOut.style.whiteSpace = 'pre';
})();