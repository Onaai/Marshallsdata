// app.js — Marshall's Information
// ══════════════════════════════════════════════

// ── Config ─────────────────────────────────────
const API_URL = (() => {
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001/api';
  return 'https://marshallsdata.onrender.com/api';
})();

// GNX: imagen servida como archivo estático por Vercel (gnxegg.png en la misma carpeta)
// ── GNX Image (Referencia al archivo externo) ──
const GNX_IMG_SRC = 'gnxegg.png';

// ── Estado ─────────────────────────────────────
let selectedFiles   = [];
let currentGroupId  = null;
let currentPassword = null;

// ── DOM ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const dropzone         = $('dropzone');
const fileInput        = $('file-input');
const fileListWrap     = $('file-list-wrap');
const fileList         = $('file-list');
const upPassword       = $('up-password');
const progressWrap     = $('progress-wrap');
const progressFill     = $('progress-fill');
const progressPct      = $('progress-pct');
const progressBlocks   = $('progress-blocks');
const progressStatus   = $('progress-status');
const btnUpload        = $('btn-upload');
const uploadResult     = $('upload-result');
const acPassword       = $('ac-password');
const btnAccess        = $('btn-access');
const accessResult     = $('access-result');
const groupFilesWrap   = $('group-files-wrap');
const groupFilesLabel  = $('group-files-label');
const groupExpiryBadge = $('group-expiry-badge');
const dlFileList       = $('dl-file-list');
const shareModal       = $('share-modal');
const shareLinkText    = $('share-link-text');
const btnCopyLink      = $('btn-copy-link');
const modalClose       = $('modal-close');

// ══════════════════════════════════════════════
//  GNX EASTER EGG
//  Escribí "gnx" en cualquier parte de la página
// ══════════════════════════════════════════════

const GNX_SEQUENCE = 'gnx';
let gnxBuffer = '';
let gnxRunning = false;

document.addEventListener('keydown', e => {
  // No activar si el usuario está escribiendo en un input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  gnxBuffer += e.key.toLowerCase();
  if (gnxBuffer.length > GNX_SEQUENCE.length) {
    gnxBuffer = gnxBuffer.slice(-GNX_SEQUENCE.length);
  }

  if (gnxBuffer === GNX_SEQUENCE && !gnxRunning) {
    gnxBuffer = '';
    fireGNX();
  }
});

function fireGNX() {
  gnxRunning = true;
  const stage = $('gnx-stage');
  const car   = $('gnx-car');
  const trail = $('gnx-trail');

  car.src = GNX_IMG_SRC;

  stage.style.display = 'block';

  // Reset
  car.style.transition   = 'none';
  trail.style.transition = 'none';
  car.style.transform    = 'translateX(0)';
  trail.style.width      = '0px';
  trail.style.left       = '0px';

  const vw = window.innerWidth;
  const carW = 380;

  // Pequeño delay para que el reset se aplique
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const duration = 2200; // ms

      // Animar auto
      car.style.transition  = `transform ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
      car.style.transform   = `translateX(${vw + carW + 80}px)`;

      // Trail: crece mientras el auto avanza, luego se desvanece
      trail.style.transition = `width ${duration * 0.7}ms ease-out, opacity ${duration * 0.4}ms ease-in ${duration * 0.6}ms`;
      trail.style.width      = `${vw * 0.7}px`;
      trail.style.opacity    = '1';

      // Limpiar al terminar
      setTimeout(() => {
        trail.style.opacity = '0';
        setTimeout(() => {
          stage.style.display = 'none';
          car.style.transition = 'none';
          car.style.transform  = 'translateX(0)';
          trail.style.transition = 'none';
          trail.style.width      = '0';
          trail.style.opacity    = '1';
          gnxRunning = false;
        }, 600);
      }, duration);
    });
  });
}

// ══════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════

document.querySelectorAll('.nav-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    const tab = pill.dataset.tab;
    document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    $('tab-upload').style.display = tab === 'upload' ? '' : 'none';
    $('tab-access').style.display = tab === 'access' ? '' : 'none';
  });
});

// ══════════════════════════════════════════════
//  PASSWORD TOGGLE
// ══════════════════════════════════════════════

document.querySelectorAll('[data-toggle]').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = $(btn.dataset.toggle);
    const show  = input.type === 'password';
    input.type  = show ? 'text' : 'password';
    btn.querySelector('.icon-eye-off').style.display = show ? 'none' : '';
    btn.querySelector('.icon-eye-on').style.display  = show ? ''     : 'none';
  });
});

// ══════════════════════════════════════════════
//  DRAG & DROP + FILE SELECTION
// ══════════════════════════════════════════════

['dragenter', 'dragover'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('over'); })
);
['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('over'); })
);

dropzone.addEventListener('drop',  e => addFiles(Array.from(e.dataTransfer.files)));
dropzone.addEventListener('click', e => { if (e.target !== fileInput) fileInput.click(); });
dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

fileInput.addEventListener('change', () => {
  addFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

function addFiles(incoming) {
  const MAX = 10 * 1024 * 1024;
  const oversized = [];

  for (const f of incoming) {
    if (f.size > MAX) { oversized.push(f.name); continue; }
    if (!selectedFiles.find(sf => sf.name === f.name && sf.size === f.size)) {
      selectedFiles.push(f);
    }
  }

  if (oversized.length) {
    showResult(uploadResult, 'error',
      `RECHAZADO: ${oversized.length} archivo(s) superan el límite de 10 MB.<br><small style="opacity:.6">${oversized.join(' · ')}</small>`
    );
  }

  renderFileList();
  updateUploadButton();
}

function renderFileList() {
  if (selectedFiles.length === 0) { fileListWrap.style.display = 'none'; return; }
  fileListWrap.style.display = '';
  fileList.innerHTML = selectedFiles.map((f, i) => `
    <li class="file-list-item">
      <span class="file-name" title="${f.name}">${f.name}</span>
      <span class="file-size">${formatBytes(f.size)}</span>
      <button class="file-remove" data-idx="${i}" title="Quitar">×</button>
    </li>
  `).join('');

  fileList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderFileList();
      updateUploadButton();
    });
  });
}

function updateUploadButton() {
  btnUpload.disabled = selectedFiles.length === 0 || upPassword.value.trim().length < 4;
}

upPassword.addEventListener('input', updateUploadButton);

// ══════════════════════════════════════════════
//  PROGRESS — DIESEL BLOCKS ANIMATION
//  3 fases:
//    1 (0→30%)  tick simulado mientras arranca el request
//    2 (30→85%) mapea el XHR progress real
//    3 (85→99%) tick lento mientras Drive procesa
//    4 (100%)   completado
// ══════════════════════════════════════════════

const BLOCKS_TOTAL = 22;
const BLOCK_FILLED = '▪';
const BLOCK_EMPTY  = '□';

let _displayPct   = 0;
let _animFrame    = null;
let _phase3Timer  = null;

const STATUSES = ['transmitting...','encoding...','routing...','uploading...','securing...'];

function updateProgressUI(pct) {
  _displayPct = Math.min(100, Math.max(0, pct));
  progressPct.textContent = String(Math.floor(_displayPct)).padStart(3, '0') + '%';
  progressFill.style.width = `${_displayPct}%`;
  const filled = Math.round((_displayPct / 100) * BLOCKS_TOTAL);
  progressBlocks.textContent = BLOCK_FILLED.repeat(filled) + BLOCK_EMPTY.repeat(BLOCKS_TOTAL - filled);
  progressStatus.textContent = STATUSES[Math.floor(Date.now() / 700) % STATUSES.length];
}

function animateTo(target, duration, onDone) {
  cancelAnimationFrame(_animFrame);
  const start = _displayPct;
  const delta = target - start;
  const t0    = performance.now();
  function step(ts) {
    const p    = Math.min((ts - t0) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 2); // ease-out quad
    updateProgressUI(start + delta * ease);
    if (p < 1) _animFrame = requestAnimationFrame(step);
    else { updateProgressUI(target); if (onDone) onDone(); }
  }
  _animFrame = requestAnimationFrame(step);
}

// Fase 1: tick simulado 0→30% (1.8s)
function startPhase1() {
  _displayPct = 0;
  updateProgressUI(0);
  animateTo(30, 1800);
}

// Fase 2: XHR reporta progreso real → mapear 0-100% a 30-85%
function setXHRProgress(xhrPct) {
  cancelAnimationFrame(_animFrame);
  const mapped = 30 + (xhrPct * 0.55);
  if (mapped > _displayPct) animateTo(mapped, 250);
}

// Fase 3: Drive procesando → tick lento hasta 99%
function startPhase3() {
  cancelAnimationFrame(_animFrame);
  clearInterval(_phase3Timer);
  let cur = _displayPct;
  _phase3Timer = setInterval(() => {
    const step = (99 - cur) * 0.055;
    if (step < 0.04) return;
    cur += step;
    updateProgressUI(cur);
  }, 140);
}

// Fase 4: completar al 100%
function completeProgress(onDone) {
  clearInterval(_phase3Timer);
  cancelAnimationFrame(_animFrame);
  animateTo(100, 400, onDone);
}

function resetProgress() {
  cancelAnimationFrame(_animFrame);
  clearInterval(_phase3Timer);
  _displayPct = 0;
  updateProgressUI(0);
}

// ══════════════════════════════════════════════
//  UPLOAD
// ══════════════════════════════════════════════

btnUpload.addEventListener('click', doUpload);
upPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doUpload(); });

async function doUpload() {
  if (selectedFiles.length === 0) return;
  const pwd = upPassword.value.trim();
  if (pwd.length < 4) {
    showResult(uploadResult, 'error', 'La clave debe tener al menos 4 caracteres.');
    return;
  }

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('files', f));
  formData.append('password', pwd);

  setLoading(btnUpload, 'btn-upload-label', true, 'TRANSMITIENDO...');
  progressWrap.style.display = 'flex';
  resetProgress();
  hideResult(uploadResult);

  // Fase 1: tick simulado mientras arranca el request
  startPhase1();

  // Cycler de status
  const statusCycler = setInterval(() => {
    if (progressStatus) {
      progressStatus.textContent = STATUSES[Math.floor(Date.now() / 700) % STATUSES.length];
    }
  }, 700);

  try {
    const data = await xhrUpload(`${API_URL}/upload`, formData);
    currentGroupId  = data.groupId;
    currentPassword = pwd;

    const fileItems = data.uploaded
      .map(f => `<li>${f.originalName} <span style="opacity:.5;font-size:10px">${formatBytes(f.size)}</span></li>`)
      .join('');

    const warnFailed  = data.failed?.length
      ? `<p style="margin-top:8px;color:#c96060;font-size:11px">FALLIDOS: ${data.failed.join(' · ')}</p>` : '';
    const warnSkipped = data.skipped
      ? `<p style="font-size:11px;opacity:.6">+ ${data.skipped} archivo(s) omitidos (límite del grupo alcanzado)</p>` : '';

    showResult(uploadResult, 'success', `
      <div style="font-size:10px;letter-spacing:.15em;opacity:.6;margin-bottom:8px">TRANSMISIÓN COMPLETA</div>
      <strong style="font-family:'Barlow Condensed',sans-serif;font-size:18px;letter-spacing:.05em">
        ${data.uploaded.length} ARCHIVO${data.uploaded.length !== 1 ? 'S' : ''} SUBIDO${data.uploaded.length !== 1 ? 'S' : ''}
      </strong>
      <ul class="uploaded-list">${fileItems}</ul>
      ${warnFailed}${warnSkipped}
      <p style="margin-top:10px;font-size:10px;opacity:.5;letter-spacing:.08em">
        EXPIRA: ${formatExpiry(data.expiresAt)}
      </p>
      <div class="result-btn-row">
        <button class="result-btn" id="btn-view-my-files">VER ARCHIVOS</button>
        <button class="result-btn primary" id="btn-share-group">COMPARTIR</button>
      </div>
    `);

    $('btn-view-my-files')?.addEventListener('click', () => {
      document.querySelector('[data-tab="access"]').click();
      acPassword.value = pwd;
      btnAccess.click();
    });

    $('btn-share-group')?.addEventListener('click', () => openShareModal(data.groupId));

    selectedFiles = [];
    renderFileList();
    upPassword.value = '';
    updateUploadButton();

    // Fase 3: tick mientras Drive confirma
    startPhase3();

    // Pequeño delay dramático, luego completar
    await new Promise(r => setTimeout(r, 900));
    completeProgress();

  } catch (err) {
    showResult(uploadResult, 'error', `ERROR EN TRANSMISIÓN: ${err.message}`);
    resetProgress();
  } finally {
    clearInterval(statusCycler);
    setLoading(btnUpload, 'btn-upload-label', false, 'TRANSMITIR');
    setTimeout(() => { progressWrap.style.display = 'none'; }, 1600);
  }
}

// XHR con progreso real
function xhrUpload(url, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        // Fase 2: mapear progreso real a rango 30-85%
        setXHRProgress(pct);
      }
    });

    xhr.addEventListener('load', () => {
      let data;
      try { data = JSON.parse(xhr.responseText); } catch { data = {}; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Server error (${xhr.status})`));
    });

    xhr.addEventListener('error',   () => reject(new Error('Error de red. Verificá tu conexión.')));
    xhr.addEventListener('timeout', () => reject(new Error('Tiempo agotado. El archivo puede ser muy grande.')));

    xhr.timeout = 90_000;
    xhr.open('POST', url);
    xhr.send(formData);
  });
}

// ══════════════════════════════════════════════
//  ACCESS FILES
// ══════════════════════════════════════════════

btnAccess.addEventListener('click', doAccess);
acPassword.addEventListener('keydown', e => { if (e.key === 'Enter') doAccess(); });

async function doAccess() {
  const pwd = acPassword.value.trim();
  if (!pwd) { showResult(accessResult, 'error', 'Se requiere clave de acceso.'); return; }

  setLoading(btnAccess, 'btn-access-label', true, 'AUTENTICANDO...');
  hideResult(accessResult);
  groupFilesWrap.style.display = 'none';

  try {
    const res  = await fetch(`${API_URL}/files`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: pwd }),
    });
    const data = await res.json();

    if (!res.ok) {
      const msg = res.status === 401 ? 'ACCESO DENEGADO — clave incorrecta.'
                : res.status === 404 ? 'SIN ARCHIVOS ACTIVOS para esta clave.'
                : `ERROR: ${data.error}`;
      showResult(accessResult, res.status === 401 ? 'error' : 'info', msg);
      return;
    }

    currentGroupId  = data.groupId;
    currentPassword = pwd;
    renderDlFileList(data.files);

  } catch (err) {
    showResult(accessResult, 'error', `ERROR DE CONEXIÓN: ${err.message}`);
  } finally {
    setLoading(btnAccess, 'btn-access-label', false, 'AUTENTICAR');
  }
}

function renderDlFileList(files) {
  if (!files || files.length === 0) {
    showResult(accessResult, 'info', 'SIN ARCHIVOS ACTIVOS.');
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const minLeft = files.reduce((min, f) => {
    const secs = (f.timeRemaining.hours * 3600) + (f.timeRemaining.minutes * 60);
    return secs < min ? secs : min;
  }, Infinity);

  const hLeft = Math.floor(minLeft / 3600);
  const mLeft = Math.floor((minLeft % 3600) / 60);
  groupExpiryBadge.textContent = `EXPIRA EN ${hLeft}H ${mLeft}M`;
  groupFilesLabel.textContent  = `// ${files.length} archivo${files.length !== 1 ? 's' : ''}`;
  groupFilesWrap.style.display = '';

  dlFileList.innerHTML = files.map(f => `
    <li class="dl-file-item">
      <div class="dl-file-icon">${fileIcon(f.mimeType)}</div>
      <div class="dl-file-info">
        <div class="dl-file-name" title="${f.originalName}">${f.originalName}</div>
        <div class="dl-file-meta">${formatBytes(f.size)} · ${f.mimeType.split('/')[1] || f.mimeType}</div>
      </div>
      <div class="dl-file-time">${f.timeRemaining.hours}H ${f.timeRemaining.minutes}M</div>
      <button class="dl-btn" data-file-id="${f.id}" data-file-name="${f.originalName}">
        ↓ BAJAR
      </button>
    </li>
  `).join('');

  dlFileList.querySelectorAll('.dl-btn').forEach(btn => {
    btn.addEventListener('click', () => downloadFile(btn.dataset.fileId, btn.dataset.fileName, btn));
  });
}

async function downloadFile(fileId, fileName, btn) {
  if (!currentPassword) { alert('Sesión expirada. Ingresá la clave de nuevo.'); return; }

  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<svg class="spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;

  try {
    const res = await fetch(`${API_URL}/files/download/${fileId}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: currentPassword }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = res.status === 401 ? 'DENEGADO'
                : res.status === 410 ? 'EXPIRADO'
                : res.status === 404 ? 'NO ENCONTRADO'
                : data.error || 'ERROR';
      alert(msg);
      return;
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.innerHTML = '✓ LISTO';
    setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 2500);
  } catch (err) {
    alert(`ERROR: ${err.message}`);
    btn.innerHTML = orig;
    btn.disabled  = false;
  }
}

// ══════════════════════════════════════════════
//  SHARE MODAL
// ══════════════════════════════════════════════

function openShareModal(groupId) {
  const url = `${window.location.origin}${window.location.pathname}?group=${groupId}`;
  shareLinkText.textContent = url;
  shareModal.style.display  = 'flex';
}

modalClose.addEventListener('click', () => { shareModal.style.display = 'none'; });
shareModal.addEventListener('click', e => { if (e.target === shareModal) shareModal.style.display = 'none'; });

btnCopyLink.addEventListener('click', () => {
  navigator.clipboard.writeText(shareLinkText.textContent).then(() => {
    btnCopyLink.textContent = 'COPIADO';
    setTimeout(() => { btnCopyLink.textContent = 'COPIAR LINK'; }, 2000);
  });
});

// ── URL group param ────────────────────────────
(function checkUrlGroup() {
  const params  = new URLSearchParams(window.location.search);
  const groupId = params.get('group');
  if (!groupId) return;

  document.querySelector('[data-tab="access"]').click();

  fetch(`${API_URL}/files/${groupId}`)
    .then(r => r.json())
    .then(data => {
      if (data.fileCount) {
        showResult(accessResult, 'info',
          `GRUPO COMPARTIDO — ${data.fileCount} ARCHIVO${data.fileCount !== 1 ? 'S' : ''} ` +
          `· EXPIRES IN ${data.timeRemaining.hours}H ${data.timeRemaining.minutes}M<br>` +
          `<span style="font-size:10px;opacity:.5">Ingresá la clave para descargar.</span>`
        );
      }
    })
    .catch(() => {});
})();

// ══════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════

function formatBytes(b) {
  if (b < 1024)        return `${b} B`;
  if (b < 1048576)     return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

function formatExpiry(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fileIcon(mime) {
  if (!mime) return '▪';
  if (mime.startsWith('image/'))  return '▪';
  if (mime.startsWith('video/'))  return '▪';
  if (mime.startsWith('audio/'))  return '▪';
  if (mime.includes('pdf'))       return '▪';
  if (mime.includes('zip') || mime.includes('rar')) return '▪';
  if (mime.includes('word') || mime.includes('document')) return '▪';
  if (mime.includes('sheet') || mime.includes('excel'))   return '▪';
  return '▪';
}

function showResult(el, type, html) {
  el.className     = `result-area ${type}`;
  el.innerHTML     = html;
  el.style.display = '';
}

function hideResult(el) { el.style.display = 'none'; }

function setLoading(btn, labelId, loading, label) {
  btn.disabled           = loading;
  $(labelId).textContent = label;
}
