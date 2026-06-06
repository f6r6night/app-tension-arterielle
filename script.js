/* ============================================
   SUIVI ARTÉRIEL — Script principal
   ============================================ */

// ---- Blood Pressure Categories (AHA-based) ----
const BP_CATEGORIES = [
  { key: 'normal',  label: 'Normal',           color: '#34D399', sysMax: 119, diaMax: 79  },
  { key: 'prehyp',  label: 'Préhypertension',  color: '#FBBF24', sysMax: 139, diaMax: 89  },
  { key: 'hta1',    label: 'Hypertension N1',   color: '#F59E0B', sysMax: 159, diaMax: 99  },
  { key: 'hta2',    label: 'Hypertension N2',   color: '#EF4444', sysMax: 999, diaMax: 999 },
];

function getCategory(sys, dia) {
  if (sys >= 160 || dia >= 100) return BP_CATEGORIES[3];
  if (sys >= 140 || dia >= 90)  return BP_CATEGORIES[2];
  if (sys >= 120 || dia >= 80)  return BP_CATEGORIES[1];
  return BP_CATEGORIES[0];
}

// ---- French month names ----
const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// ---- LocalStorage helpers ----
const STORAGE_KEY = 'ma_tension_data';

function loadAllData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

function saveAllData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getMonthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function getMonthData(year, month) {
  const data = loadAllData();
  return data[getMonthKey(year, month)] || {};
}

function setDayData(year, month, day, entry) {
  const data = loadAllData();
  const mk = getMonthKey(year, month);
  if (!data[mk]) data[mk] = {};
  data[mk][String(day)] = entry;
  // Keep only last 3 months of data
  const keys = Object.keys(data).sort();
  while (keys.length > 3) {
    delete data[keys.shift()];
  }
  saveAllData(data);
}

function deleteDayData(year, month, day) {
  const data = loadAllData();
  const mk = getMonthKey(year, month);
  if (data[mk]) {
    delete data[mk][String(day)];
    if (Object.keys(data[mk]).length === 0) delete data[mk];
  }
  saveAllData(data);
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function formatDateFR(day, month, year) {
  return `${String(day).padStart(2,'0')}/${String(month+1).padStart(2,'0')}/${year}`;
}

// ---- State ----
const now = new Date();
let currentYear = now.getFullYear();
let currentMonth = now.getMonth();
let calYear = currentYear;
let calMonth = currentMonth;
let chartYear = currentYear;
let chartMonth = currentMonth;
let currentPage = 'dashboard';

// ---- DOM refs ----
const $ = id => document.getElementById(id);

// ---- Dynamic Greeting ----
function updateGreeting() {
  const hour = new Date().getHours();
  const textEl = $('greeting-text');
  if (hour >= 5 && hour < 12) {
    textEl.textContent = "Bonjour !";
  } else if (hour >= 12 && hour < 18) {
    textEl.textContent = "Bon après-midi !";
  } else {
    textEl.textContent = "Bonsoir !";
  }
}

// ---- Navigation ----
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    switchPage(page);
  });
});

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  if (page === 'dashboard') refreshDashboard();
  if (page === 'calendar') refreshCalendar();
  if (page === 'chart') refreshChart();
  window.scrollTo(0,0);
}

// ---- Toast ----
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ---- Form ----
$('input-date').value = new Date().toISOString().split('T')[0];

$('measurement-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const sys = parseInt($('input-systolique').value);
  const dia = parseInt($('input-diastolique').value);
  const pouls = $('input-pouls').value ? parseInt($('input-pouls').value) : null;
  const dateVal = $('input-date').value;
  if (!sys || !dia || !dateVal) return;
  if (sys <= dia) { showToast('⚠️ La systolique doit être > diastolique'); return; }

  const d = new Date(dateVal);
  const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
  setDayData(y, m, day, { sys, dia, pouls, time: new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) });
  showToast('✅ Mesure enregistrée avec succès !');
  $('input-systolique').value = '';
  $('input-diastolique').value = '';
  $('input-pouls').value = '';
  refreshDashboard();
});

// ============================
// DASHBOARD
// ============================
function refreshDashboard() {
  const md = getMonthData(currentYear, currentMonth);
  $('header-month').textContent = `${MONTHS_FR[currentMonth]} ${currentYear}`;
  updateGreeting();

  // Find latest entry
  const days = Object.keys(md).map(Number).sort((a,b) => b - a);
  const latest = days.length > 0 ? md[String(days[0])] : null;

  // Stats
  $('stat-sys-value').textContent = latest ? latest.sys : '--';
  $('stat-dia-value').textContent = latest ? latest.dia : '--';
  $('stat-pouls-value').textContent = latest && latest.pouls ? latest.pouls : '--';

  // Gauge
  drawGauge(latest);

  // Entries list
  renderEntries(md);
}

function renderEntries(md) {
  const list = $('entries-list');
  const days = Object.keys(md).map(Number).sort((a,b) => b - a);
  if (days.length === 0) {
    list.innerHTML = '<p class="empty-message">Aucune mesure enregistrée ce mois-ci. Vous pouvez commencer dès maintenant.</p>';
    return;
  }
  list.innerHTML = '';
  days.forEach(day => {
    const e = md[String(day)];
    const cat = getCategory(e.sys, e.dia);
    const div = document.createElement('div');
    div.className = `entry-item level-${cat.key}`;
    div.innerHTML = `
      <span class="entry-date">${formatDateFR(day, currentMonth, currentYear)}</span>
      <span class="entry-values">${e.sys}/${e.dia} <small>${e.pouls ? e.pouls + ' bpm' : ''}</small></span>
      <span class="entry-category cat-${cat.key}">${cat.label}</span>
      <button class="entry-delete" data-day="${day}" title="Supprimer la mesure">&times;</button>
    `;
    list.appendChild(div);
  });
  // Delete handlers
  list.querySelectorAll('.entry-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = parseInt(btn.dataset.day);
      deleteDayData(currentYear, currentMonth, d);
      showToast('🗑️ Mesure supprimée');
      refreshDashboard();
    });
  });
}

// ============================
// GAUGE DRAWING
// ============================
function drawGauge(entry) {
  const canvas = $('gauge-canvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 320 * dpr;
  canvas.height = 200 * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, 320, 200);

  const cx = 160, cy = 160, r = 120, lw = 22;
  const startAngle = Math.PI, endAngle = 2 * Math.PI;

  // Sections: green, yellow, orange, red (matching CSS)
  const sections = [
    { color: '#34D399', frac: 0.30 }, // Normal
    { color: '#FBBF24', frac: 0.25 }, // Prehyp
    { color: '#F59E0B', frac: 0.25 }, // HTA1
    { color: '#EF4444', frac: 0.20 }, // HTA2
  ];

  let angle = startAngle;
  sections.forEach(s => {
    const sweep = (endAngle - startAngle) * s.frac;
    ctx.beginPath();
    ctx.arc(cx, cy, r, angle, angle + sweep);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'butt';
    ctx.stroke();
    angle += sweep;
  });

  // Needle
  if (entry) {
    // Map sys 80-200 to 0-1
    const norm = Math.min(1, Math.max(0, (entry.sys - 80) / (200 - 80)));
    const needleAngle = startAngle + norm * (endAngle - startAngle);
    const nr = r - 8;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needleAngle);
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(nr - 10, -3);
    ctx.lineTo(nr, 0);
    ctx.lineTo(nr - 10, 3);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#D4A843'; // Gold
    ctx.fill();

    const cat = getCategory(entry.sys, entry.dia);
    $('gauge-value').textContent = `${entry.sys}/${entry.dia}`;
    $('gauge-label').textContent = cat.label;
    $('gauge-label').style.background = cat.color + '25';
    $('gauge-label').style.color = cat.color;
  } else {
    // No data - center dot only
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
    $('gauge-value').textContent = '--/--';
    $('gauge-label').textContent = 'Aucune mesure';
    $('gauge-label').style.background = 'rgba(255,255,255,0.08)';
    $('gauge-label').style.color = 'rgba(255,255,255,0.5)';
  }

  // Tick labels
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '11px Barlow';
  ctx.textAlign = 'center';
  const labels = [80, 100, 120, 140, 160, 180, 200];
  labels.forEach(val => {
    const norm = (val - 80) / (200 - 80);
    const a = startAngle + norm * (endAngle - startAngle);
    const tr = r + 18;
    const tx = cx + tr * Math.cos(a);
    const ty = cy + tr * Math.sin(a);
    ctx.fillText(val, tx, ty);
  });
}

// ============================
// CALENDAR
// ============================
$('cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } refreshCalendar(); });
$('cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } refreshCalendar(); });

function refreshCalendar() {
  $('cal-month-title').textContent = `${MONTHS_FR[calMonth]} ${calYear}`;
  const grid = $('calendar-grid');
  // Remove old day cells
  grid.querySelectorAll('.cal-day').forEach(el => el.remove());

  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
  const md = getMonthData(calYear, calMonth);
  const todayDay = (calYear === currentYear && calMonth === currentMonth) ? now.getDate() : -1;

  // Empty cells
  for (let i = 0; i < startOffset; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const el = document.createElement('div');
    el.className = 'cal-day';
    if (d === todayDay) el.classList.add('today');

    const entry = md[String(d)];
    if (entry) {
      const cat = getCategory(entry.sys, entry.dia);
      el.classList.add('has-data', `bg-${cat.key === 'normal' ? 'green' : cat.key === 'prehyp' ? 'yellow' : cat.key === 'hta1' ? 'orange' : 'red'}`);
      el.innerHTML = `<span>${d}</span><span class="cal-sys">${entry.sys}/${entry.dia}</span>`;
    } else {
      el.innerHTML = `<span>${d}</span>`;
    }

    el.addEventListener('click', () => showDayDetail(d, calYear, calMonth));
    grid.appendChild(el);
  }
}

function showDayDetail(day, year, month) {
  const overlay = $('day-detail-overlay');
  const md = getMonthData(year, month);
  const entry = md[String(day)];
  $('day-detail-title').textContent = `${String(day).padStart(2,'0')} ${MONTHS_FR[month]} ${year}`;

  if (entry) {
    const cat = getCategory(entry.sys, entry.dia);
    $('day-detail-content').innerHTML = `
      <div class="detail-row"><span class="detail-label">Systolique</span><span class="detail-value">${entry.sys} mmHg</span></div>
      <div class="detail-row"><span class="detail-label">Diastolique</span><span class="detail-value">${entry.dia} mmHg</span></div>
      <div class="detail-row"><span class="detail-label">Pouls</span><span class="detail-value">${entry.pouls ? entry.pouls + ' bpm' : '—'}</span></div>
      <div class="detail-row"><span class="detail-label">Catégorie</span><span class="detail-value" style="color:${cat.color}">${cat.label}</span></div>
      ${entry.time ? `<div class="detail-row"><span class="detail-label">Heure</span><span class="detail-value">${entry.time}</span></div>` : ''}
    `;
  } else {
    $('day-detail-content').innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px 0;">Aucune mesure ce jour.</p>';
  }
  overlay.classList.add('show');
}

$('day-detail-close').addEventListener('click', () => $('day-detail-overlay').classList.remove('show'));
$('day-detail-overlay').addEventListener('click', e => { if (e.target === $('day-detail-overlay')) $('day-detail-overlay').classList.remove('show'); });

// ============================
// CHART
// ============================
$('chart-prev').addEventListener('click', () => { chartMonth--; if (chartMonth < 0) { chartMonth = 11; chartYear--; } refreshChart(); });
$('chart-next').addEventListener('click', () => { chartMonth++; if (chartMonth > 11) { chartMonth = 0; chartYear++; } refreshChart(); });

function refreshChart() {
  $('chart-month-title').textContent = `${MONTHS_FR[chartMonth]} ${chartYear}`;
  const md = getMonthData(chartYear, chartMonth);
  const daysInMonth = getDaysInMonth(chartYear, chartMonth);
  drawChart(md, daysInMonth);
  renderSummary(md);
}

function drawChart(md, totalDays) {
  const canvas = $('chart-canvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32;
  const H = 260;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const padL = 40, padR = 10, padT = 20, padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const minY = 40, maxY = 200;

  // Background zones (matching CSS)
  const zones = [
    { min: 40, max: 80, color: 'rgba(52,211,153,0.06)' }, // green
    { min: 80, max: 90, color: 'rgba(251,191,36,0.06)' }, // yellow
    { min: 120, max: 140, color: 'rgba(251,191,36,0.06)' }, // yellow
    { min: 140, max: 160, color: 'rgba(245,158,11,0.06)' }, // orange
    { min: 160, max: 200, color: 'rgba(239,68,68,0.06)' }, // red
  ];
  zones.forEach(z => {
    const y1 = padT + chartH * (1 - (z.max - minY) / (maxY - minY));
    const y2 = padT + chartH * (1 - (z.min - minY) / (maxY - minY));
    ctx.fillStyle = z.color;
    ctx.fillRect(padL, Math.max(padT, y1), chartW, y2 - y1);
  });

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let v = 60; v <= 200; v += 20) {
    const y = padT + chartH * (1 - (v - minY) / (maxY - minY));
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px Barlow';
    ctx.textAlign = 'right';
    ctx.fillText(v, padL - 6, y + 4);
  }

  // Reference lines at 120 and 80
  [120, 80].forEach(v => {
    const y = padT + chartH * (1 - (v - minY) / (maxY - minY));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(212,168,67,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.setLineDash([]);
  });

  // Collect data points
  const sysPoints = [], diaPoints = [], pulsePoints = [];
  for (let d = 1; d <= totalDays; d++) {
    const x = padL + ((d - 1) / (totalDays - 1)) * chartW;
    const entry = md[String(d)];
    if (entry) {
      sysPoints.push({ x, y: padT + chartH * (1 - (entry.sys - minY) / (maxY - minY)), val: entry.sys, day: d });
      diaPoints.push({ x, y: padT + chartH * (1 - (entry.dia - minY) / (maxY - minY)), val: entry.dia, day: d });
      if (entry.pouls) {
        pulsePoints.push({ x, y: padT + chartH * (1 - (entry.pouls - minY) / (maxY - minY)), val: entry.pouls, day: d });
      }
    }
  }

  // Draw line helper
  function drawLine(pts, color, dashed) {
    if (pts.length < 2) {
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fillStyle = color; ctx.fill(); });
      return;
    }
    ctx.beginPath();
    ctx.setLineDash(dashed ? [5, 5] : []);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.setLineDash([]);
    // Dots
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    });
  }

  drawLine(pulsePoints, '#a78bfa', true);
  drawLine(diaPoints, '#3b82f6', false);
  drawLine(sysPoints, '#E30613', false);

  // X-axis labels (every 5 days)
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '10px Barlow';
  ctx.textAlign = 'center';
  for (let d = 1; d <= totalDays; d += (totalDays > 20 ? 5 : 3)) {
    const x = padL + ((d - 1) / (totalDays - 1)) * chartW;
    ctx.fillText(d, x, H - 6);
  }
  // Always show last day
  const lastX = padL + ((totalDays - 1) / (totalDays - 1)) * chartW;
  ctx.fillText(totalDays, lastX, H - 6);

  // Empty state
  if (sysPoints.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px Barlow';
    ctx.textAlign = 'center';
    ctx.fillText('Aucune donnée enregistrée ce mois-ci', W / 2, H / 2);
  }
}

function renderSummary(md) {
  const entries = Object.values(md);
  const grid = $('summary-grid');
  if (entries.length === 0) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:10px;">Aucune donnée</p>';
    return;
  }
  const sysList = entries.map(e => e.sys);
  const diaList = entries.map(e => e.dia);
  const avgSys = Math.round(sysList.reduce((a,b) => a+b, 0) / sysList.length);
  const avgDia = Math.round(diaList.reduce((a,b) => a+b, 0) / diaList.length);
  const maxSys = Math.max(...sysList);
  const minSys = Math.min(...sysList);

  grid.innerHTML = `
    <div class="summary-item"><span class="s-label">Mesures</span><span class="s-val">${entries.length}</span><span class="s-sub">ce mois</span></div>
    <div class="summary-item"><span class="s-label">Moyenne</span><span class="s-val">${avgSys}/${avgDia}</span><span class="s-sub">mmHg</span></div>
    <div class="summary-item"><span class="s-label">Sys. max</span><span class="s-val">${maxSys}</span><span class="s-sub">mmHg</span></div>
    <div class="summary-item"><span class="s-label">Sys. min</span><span class="s-val">${minSys}</span><span class="s-sub">mmHg</span></div>
  `;
}

// ============================
// INIT
// ============================
refreshDashboard();
// Pre-set calendar and chart to current month
refreshCalendar();

// Handle resize for chart
window.addEventListener('resize', () => { if (currentPage === 'chart') refreshChart(); });

// ============================
// EXPORT — Email with CSV
// ============================

// --- Helper: flatten all data into a sorted array of entries ---
function getAllEntriesFlat() {
  const data = loadAllData();
  const entries = [];
  Object.keys(data).sort().forEach(monthKey => {
    const [year, month] = monthKey.split('-').map(Number);
    const md = data[monthKey];
    Object.keys(md).map(Number).sort((a,b) => a - b).forEach(day => {
      const e = md[String(day)];
      const cat = getCategory(e.sys, e.dia);
      entries.push({
        date: `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`,
        sys: e.sys,
        dia: e.dia,
        pouls: e.pouls || '',
        categorie: cat.label,
        heure: e.time || ''
      });
    });
  });
  return entries;
}

// --- Generate and download CSV file ---
function generateCSV(entries) {
  const header = 'Date;Systolique (mmHg);Diastolique (mmHg);Pouls (bpm);Catégorie;Heure';
  const rows = entries.map(e => `${e.date};${e.sys};${e.dia};${e.pouls};${e.categorie};${e.heure}`);
  const csv = [header, ...rows].join('\n');
  // BOM for correct accents in Excel
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().split('T')[0];
  a.download = `mesures_tension_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Send by Email button ---
$('btn-export-email').addEventListener('click', () => {
  const entries = getAllEntriesFlat();
  if (entries.length === 0) {
    showToast('⚠️ Aucune donnée à envoyer.');
    return;
  }

  // Step 1: Download the CSV file
  generateCSV(entries);

  // Step 2: Build email body with a readable summary
  const today = new Date();
  const monthLabel = `${MONTHS_FR[today.getMonth()]} ${today.getFullYear()}`;
  const subject = encodeURIComponent(`Suivi de Tension — Relevés ${monthLabel}`);

  let body = `Bonjour,\n\n`;
  body += `Veuillez trouver ci-joint mes relevés de tension artérielle.\n\n`;
  body += `Résumé de la période — ${monthLabel}\n`;
  body += `${'—'.repeat(30)}\n\n`;
  body += `Nombre total de mesures : ${entries.length}\n\n`;

  entries.forEach(e => {
    const poulsStr = e.pouls ? ` | Pouls: ${e.pouls} bpm` : '';
    body += `${e.date}  →  ${e.sys}/${e.dia} mmHg${poulsStr}  (${e.categorie})\n`;
  });

  // Averages
  const avgSys = Math.round(entries.reduce((s, e) => s + e.sys, 0) / entries.length);
  const avgDia = Math.round(entries.reduce((s, e) => s + e.dia, 0) / entries.length);
  body += `\nMoyenne sur l'ensemble : ${avgSys}/${avgDia} mmHg\n`;
  body += `\n${'—'.repeat(30)}\n`;
  body += `(Le fichier CSV détaillé est en pièce jointe de ce mail)\n`;
  body += `\nBien cordialement`;

  // Step 3: Open email client
  const mailto = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;

  showToast('📧 Fichier généré. Joignez-le au mail !');
});
