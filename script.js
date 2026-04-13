/* ============================================================
   NoorVerse – script.js
   Complete SPA Logic: Routing, Quran, Qibla, Prayer, Install
   ============================================================ */

'use strict';

/* ── State ── */
const State = {
  currentView: 'dashboard',
  surahList: [],        // Array of { number, name, englishName, numberOfAyahs, revelationType }
  currentSurah: null,   // { number, name, englishName, numberOfAyahs, ayahs[] }
  quranData: null,      // Full Uthmani quran (cached)
  qiblaActive: false,
  audioQueue: [],
  audioIndex: 0,
  audioPlaying: false,
  deferredInstallPrompt: null,
};

/* ── DOM helpers ── */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* ── API Endpoints ── */
const API = {
  surahList:   'https://api.alquran.cloud/v1/surah',
  fullQuran:   'https://api.alquran.cloud/v1/quran/quran-uthmani',
  search:      (q) => `https://api.alquran.cloud/v1/search/${encodeURIComponent(q)}/all/quran-uthmani`,
  surahEdition:(num, ed) => `https://api.alquran.cloud/v1/surah/${num}/${ed}`,
  prayerCity:  (city, country) => `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=2`,
  prayerCoord: (lat, lng) => `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=2`,
};

/* ============================================================
   ROUTING
   ============================================================ */
function navigateTo(viewId, opts = {}) {
  const current = $(`#view-${State.currentView}`);
  const next    = $(`#view-${viewId}`);
  if (!next) return;

  if (current) current.classList.remove('active');
  next.classList.add('active');
  State.currentView = viewId;
  window.scrollTo(0, 0);

  /* On-enter hooks */
  if (viewId === 'surah-list' && State.surahList.length === 0) fetchSurahList();
  if (viewId === 'qibla')  initQibla();
  if (viewId === 'prayer') initPrayerTimes();
  if (viewId === 'reader' && opts.surahNumber) loadSurahReader(opts.surahNumber);

  /* FAB visibility */
  const fabGroup = $('.fab-group');
  if (fabGroup) {
    fabGroup.classList.toggle('visible', viewId === 'reader');
  }
}

/* Back button */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-back]');
  if (btn) navigateTo(btn.dataset.back);

  const card = e.target.closest('[data-view]');
  if (card) navigateTo(card.dataset.view);
});

/* ============================================================
   HEADER MENU
   ============================================================ */
const menuToggleBtn = $('#menu-toggle-btn');
const sideMenu      = $('#side-menu');
const menuOverlay   = $('#menu-overlay');
const closeMenuBtn  = $('#close-menu-btn');

function openMenu()  {
  sideMenu.classList.add('open');
  menuOverlay.classList.add('active');
  sideMenu.setAttribute('aria-hidden', 'false');
}

function closeMenu() {
  sideMenu.classList.remove('open');
  menuOverlay.classList.remove('active');
  sideMenu.setAttribute('aria-hidden', 'true');
}

menuToggleBtn?.addEventListener('click', openMenu);
closeMenuBtn?.addEventListener('click', closeMenu);
menuOverlay?.addEventListener('click', closeMenu);

$$('.menu-item').forEach(btn => {
  btn.addEventListener('click', () => {
    closeMenu();
    const action = btn.dataset.action;
    if (action === 'home')    navigateTo('dashboard');
    if (action === 'install') triggerInstall();
    if (action === 'about')   openModal('modal-about');
    if (action === 'contact') openModal('modal-contact');
  });
});

/* ============================================================
   MODALS
   ============================================================ */
function openModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* Close buttons */
$$('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

/* Click outside modal-box */
$$('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      const id = overlay.id;
      closeModal(id);
    }
  });
});

/* ============================================================
   INSTALL BANNER & PWA
   ============================================================ */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  State.deferredInstallPrompt = e;
  const headerBtn = $('#install-btn-header');
  if (headerBtn) headerBtn.style.display = 'flex';
});

function triggerInstall() {
  if (State.deferredInstallPrompt) {
    State.deferredInstallPrompt.prompt();
    State.deferredInstallPrompt.userChoice.then(() => {
      State.deferredInstallPrompt = null;
    });
  } else {
    window.open('https://drive.google.com/uc?id=1io4qGGLfmK3XIA_KFbffTpPbcS2SziG0', '_blank');
  }
}

$('#install-btn-header')?.addEventListener('click', triggerInstall);

/* Install Banner show/hide */
function initInstallBanner() {
  if (localStorage.getItem('nv_banner_dismissed')) return;
  const banner = $('#install-banner');
  if (!banner) return;
  setTimeout(() => { banner.style.display = 'block'; }, 2000);
}

$('#install-dismiss-btn')?.addEventListener('click', () => {
  $('#install-banner').style.display = 'none';
  localStorage.setItem('nv_banner_dismissed', '1');
});

/* ============================================================
   SURAH LIST
   ============================================================ */
async function fetchSurahList() {
  const container = $('#surah-list-container');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading Surahs…</p></div>';

  try {
    const res  = await fetch(API.surahList);
    const json = await res.json();
    if (json.code !== 200) throw new Error('API error');
    State.surahList = json.data;
    renderSurahList(State.surahList);
  } catch (err) {
    container.innerHTML = `<div class="error-state">⚠️ Failed to load Surahs. Check your internet connection.<br><button onclick="fetchSurahList()" style="margin-top:10px;padding:8px 16px;background:rgba(212,175,55,0.2);border:1px solid #D4AF37;border-radius:8px;color:#D4AF37;cursor:pointer;">Retry</button></div>`;
  }
}

function renderSurahList(list) {
  const container = $('#surah-list-container');
  if (!list.length) {
    container.innerHTML = '<div class="empty-state">No Surahs found.</div>';
    return;
  }

  container.innerHTML = list.map(s => `
    <button class="surah-card" data-surah="${s.number}" aria-label="Open Surah ${s.englishName}">
      <div class="surah-num">${s.number}</div>
      <div class="surah-info">
        <div class="surah-english">${s.englishName}</div>
        <div class="surah-meta">${s.englishNameTranslation} · ${s.numberOfAyahs} Ayahs · ${s.revelationType}</div>
      </div>
      <div class="surah-arabic">${s.name}</div>
    </button>
  `).join('');

  /* Attach click */
  $$('.surah-card', container).forEach(card => {
    card.addEventListener('click', () => {
      navigateTo('reader', { surahNumber: parseInt(card.dataset.surah) });
    });
  });
}

/* ── Surah Search ── */
let searchDebounceTimer = null;

$('#surah-search-input')?.addEventListener('input', (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchDebounceTimer);

  if (!q) {
    renderSurahList(State.surahList);
    return;
  }

  /* Detect Arabic */
  const isArabic = /[\u0600-\u06FF]/.test(q);

  if (isArabic) {
    const spinner = $('#search-spinner');
    if (spinner) spinner.style.display = 'block';
    searchDebounceTimer = setTimeout(() => searchArabic(q, spinner), 500);
  } else {
    /* Local filter: by number or English name */
    const lower = q.toLowerCase();
    const filtered = State.surahList.filter(s =>
      s.number.toString().includes(q) ||
      s.englishName.toLowerCase().includes(lower) ||
      s.englishNameTranslation.toLowerCase().includes(lower)
    );
    renderSurahList(filtered);
  }
});

async function searchArabic(q, spinner) {
  try {
    const res  = await fetch(API.search(q));
    const json = await res.json();
    if (json.code !== 200 || !json.data || !json.data.matches) throw new Error('No matches');

    /* Extract unique surah numbers */
    const nums = [...new Set(json.data.matches.map(m => m.surah.number))];
    const filtered = State.surahList.filter(s => nums.includes(s.number));
    renderSurahList(filtered);
  } catch {
    const container = $('#surah-list-container');
    container.innerHTML = '<div class="empty-state">No matches found for that Arabic text.</div>';
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

/* ============================================================
   QURAN READER
   ============================================================ */
async function loadSurahReader(surahNumber) {
  const surahMeta = State.surahList.find(s => s.number === surahNumber);
  const title     = $('#reader-title');
  const content   = $('#reader-content');
  const trBlock   = $('#translation-block');

  if (title && surahMeta) title.textContent = `${surahMeta.englishName}`;
  content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading Surah…</p></div>';
  trBlock.style.display = 'none';
  trBlock.innerHTML = '';

  /* Stop any playing audio */
  stopAudio();

  try {
    /* Try cache first */
    let surahData = null;
    const cacheKey = `nv_surah_${surahNumber}`;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      surahData = JSON.parse(cached);
    } else {
      const res  = await fetch(`https://api.alquran.cloud/v1/surah/${surahNumber}/quran-uthmani`);
      const json = await res.json();
      if (json.code !== 200) throw new Error('API error');
      surahData = json.data;
      try { sessionStorage.setItem(cacheKey, JSON.stringify(surahData)); } catch {}
    }

    State.currentSurah = surahData;
    renderReader(surahData, surahMeta);

    /* Set modal max ayah */
    const maxAyah = surahData.ayahs.length;
    ['rec-end', 'tr-end'].forEach(id => {
      const el = $(`#${id}`);
      if (el) { el.max = maxAyah; el.value = maxAyah; }
    });
    ['rec-start', 'tr-start'].forEach(id => {
      const el = $(`#${id}`);
      if (el) { el.max = maxAyah; }
    });

  } catch (err) {
    content.innerHTML = `<div class="error-state">⚠️ Failed to load this Surah. Please check your connection.</div>`;
  }
}

function renderReader(surah, meta) {
  const content = $('#reader-content');
  const isFatiha = surah.number === 1;
  const isTawbah = surah.number === 9; // No Bismillah

  let html = `
    <div class="surah-title-card">
      <div class="surah-title-arabic">${surah.name}</div>
      <div class="surah-title-english">${surah.englishName} — ${surah.englishNameTranslation}</div>
      <div class="surah-title-details">${surah.numberOfAyahs} Ayahs · ${surah.revelationType} · Surah #${surah.number}</div>
    </div>
  `;

  /* Bismillah (not for Fatiha ayah-embedded, and not for At-Tawbah) */
  if (!isFatiha && !isTawbah) {
    html += `<div class="bismillah-text">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</div>`;
  }

  /* Mushaf-style: continuous flowing text */
  let mushafText = '';
  surah.ayahs.forEach(ayah => {
    const numCircle = `<span class="ayah-number" data-ayah="${ayah.numberInSurah}">${ayah.numberInSurah}</span>`;
    mushafText += ` ${ayah.text} ${numCircle} `;
  });

  html += `<div class="mushaf-text" dir="rtl">${mushafText}</div>`;
  content.innerHTML = html;
}

/* ── FAB Buttons ── */
$('#fab-play')?.addEventListener('click', () => openModal('modal-recitation'));
$('#fab-translation')?.addEventListener('click', () => openModal('modal-translation'));

/* ── Full Surah buttons in modals ── */
$('#rec-full-btn')?.addEventListener('click', () => {
  const s = State.currentSurah;
  if (!s) return;
  $('#rec-start').value = 1;
  $('#rec-end').value = s.ayahs.length;
});

$('#tr-full-btn')?.addEventListener('click', () => {
  const s = State.currentSurah;
  if (!s) return;
  $('#tr-start').value = 1;
  $('#tr-end').value = s.ayahs.length;
});

/* ============================================================
   RECITATION AUDIO
   ============================================================ */
const audioEl = $('#quran-audio');

$('#rec-start-btn')?.addEventListener('click', startRecitation);
$('#rec-stop-btn')?.addEventListener('click', stopAudio);

async function startRecitation() {
  const surah = State.currentSurah;
  if (!surah) return;

  const edition = $('#reciter-select').value;
  let start = parseInt($('#rec-start').value) || 1;
  let end   = parseInt($('#rec-end').value)   || surah.ayahs.length;

  /* Validate */
  start = Math.max(1, Math.min(start, surah.ayahs.length));
  end   = Math.max(start, Math.min(end, surah.ayahs.length));
  $('#rec-start').value = start;
  $('#rec-end').value   = end;

  const statusEl = $('#rec-status');
  statusEl.textContent = 'Fetching audio…';
  stopAudio();

  try {
    const res  = await fetch(API.surahEdition(surah.number, edition));
    const json = await res.json();
    if (json.code !== 200) throw new Error('API error');

    const ayahs = json.data.ayahs.slice(start - 1, end);
    State.audioQueue = ayahs.map(a => a.audio).filter(Boolean);
    State.audioIndex = 0;
    State.audioPlaying = true;

    statusEl.textContent = `Playing Ayah ${start}–${end} | ${json.data.edition.englishName}`;
    playNextAudio(statusEl, start);
  } catch {
    statusEl.textContent = '⚠️ Failed to load audio. Check connection.';
  }
}

function playNextAudio(statusEl, startAyahNum) {
  if (!State.audioPlaying || State.audioIndex >= State.audioQueue.length) {
    if (State.audioPlaying) {
      if (statusEl) statusEl.textContent = '✓ Recitation complete.';
      State.audioPlaying = false;
    }
    return;
  }

  const url = State.audioQueue[State.audioIndex];
  const ayahNum = startAyahNum + State.audioIndex;
  if (statusEl) statusEl.textContent = `▶ Playing Ayah ${ayahNum}…`;

  audioEl.src = url;
  audioEl.load();
  audioEl.play().catch(() => {});

  audioEl.onended = () => {
    if (!State.audioPlaying) return;
    State.audioIndex++;
    playNextAudio(statusEl, startAyahNum);
  };

  audioEl.onerror = () => {
    if (!State.audioPlaying) return;
    State.audioIndex++;
    playNextAudio(statusEl, startAyahNum);
  };
}

function stopAudio() {
  State.audioPlaying = false;
  State.audioQueue = [];
  State.audioIndex = 0;
  if (audioEl) {
    audioEl.pause();
    audioEl.src = '';
  }
  const statusEl = $('#rec-status');
  if (statusEl) statusEl.textContent = '';
}

/* ============================================================
   TRANSLATION
   ============================================================ */
$('#tr-show-btn')?.addEventListener('click', showTranslation);

async function showTranslation() {
  const surah = State.currentSurah;
  if (!surah) return;

  const lang  = $('#lang-select').value;
  let start = parseInt($('#tr-start').value) || 1;
  let end   = parseInt($('#tr-end').value)   || surah.ayahs.length;
  start = Math.max(1, Math.min(start, surah.ayahs.length));
  end   = Math.max(start, Math.min(end, surah.ayahs.length));
  $('#tr-start').value = start;
  $('#tr-end').value   = end;

  const trBlock = $('#translation-block');
  trBlock.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading translation…</p></div>';
  trBlock.style.display = 'block';
  closeModal('modal-translation');

  try {
    const cacheKey = `nv_tr_${surah.number}_${lang}`;
    let ayahsData;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      ayahsData = JSON.parse(cached);
    } else {
      const res  = await fetch(API.surahEdition(surah.number, lang));
      const json = await res.json();
      if (json.code !== 200) throw new Error('API error');
      ayahsData = json.data.ayahs;
      try { sessionStorage.setItem(cacheKey, JSON.stringify(ayahsData)); } catch {}
    }

    const slice = ayahsData.slice(start - 1, end);
    const langLabels = {
      'en.asad':     'English — Muhammad Asad',
      'ur.jalandhry':'Urdu — Jalandhry',
      'bn.bengali':  'Bengali',
    };

    let html = `<div class="translation-header">📖 ${langLabels[lang] || lang} | Ayah ${start}–${end}</div>`;
    slice.forEach((a, i) => {
      const ayahNum = start + i;
      const isUrdu = lang.startsWith('ur');
      const isBengali = lang.startsWith('bn');
      const dir = (isUrdu || isBengali) ? 'rtl' : 'ltr';
      html += `
        <div class="translation-item">
          <div class="translation-ayah-num">Ayah ${ayahNum}</div>
          <div class="translation-text" dir="${dir}">${a.text}</div>
        </div>
      `;
    });

    trBlock.innerHTML = html;
    trBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    trBlock.innerHTML = '<div class="error-state">⚠️ Failed to load translation.</div>';
  }
}

/* ============================================================
   QIBLA COMPASS
   ============================================================ */
function initQibla() {
  if (State.qiblaActive) return;
  State.qiblaActive = true;

  const info    = $('#qibla-info');
  const wrapper = $('#compass-wrapper');
  const needle  = $('#qibla-needle');
  const bearingDisplay = $('#qibla-bearing-display');
  const hint    = $('#qibla-hint');

  /* Mecca coords */
  const MECCA_LAT = 21.422487;
  const MECCA_LNG = 39.826206;

  function toRad(deg) { return deg * Math.PI / 180; }

  function calcQiblaBearing(userLat, userLng) {
    const dLng = toRad(MECCA_LNG - userLng);
    const lat1 = toRad(userLat);
    const lat2 = toRad(MECCA_LAT);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  if (!navigator.geolocation) {
    info.innerHTML = '<div class="error-state">Geolocation is not supported by your browser.</div>';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const qiblaBearing = calcQiblaBearing(pos.coords.latitude, pos.coords.longitude);
      bearingDisplay.textContent = `${Math.round(qiblaBearing)}°`;
      info.style.display  = 'none';
      wrapper.style.display = 'flex';

      /* Device orientation – physical compass */
      let orientationSupported = false;

      function handleOrientation(e) {
        let compassHeading = null;

        if (typeof e.webkitCompassHeading !== 'undefined') {
          compassHeading = e.webkitCompassHeading;
        } else if (e.absolute && typeof e.alpha === 'number') {
          compassHeading = (360 - e.alpha) % 360;
        }

        if (compassHeading !== null) {
          orientationSupported = true;
          const rotation = (qiblaBearing - compassHeading + 360) % 360;
          needle.style.transform = `rotate(${rotation}deg)`;
          hint.textContent = 'Align the needle with the Kaaba ✦';
        }
      }

      /* iOS 13+ requires permission */
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(perm => {
            if (perm === 'granted') {
              window.addEventListener('deviceorientationabsolute', handleOrientation, true);
              window.addEventListener('deviceorientation', handleOrientation, true);
            } else {
              hint.textContent = `Qibla is at ${Math.round(qiblaBearing)}° from North`;
              needle.style.transform = `rotate(${qiblaBearing}deg)`;
            }
          })
          .catch(() => {
            needle.style.transform = `rotate(${qiblaBearing}deg)`;
          });
      } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);

        /* Fallback: show static bearing if no orientation event in 1.5s */
        setTimeout(() => {
          if (!orientationSupported) {
            hint.textContent = `Static bearing: ${Math.round(qiblaBearing)}° from North`;
            needle.style.transform = `rotate(${qiblaBearing}deg)`;
          }
        }, 1500);
      }
    },
    (err) => {
      info.innerHTML = `<div class="error-state">⚠️ Location access denied.<br>Please allow location to use Qibla Compass.</div>`;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* ============================================================
   PRAYER TIMES
   ============================================================ */
const PRAYER_META = [
  { key: 'Fajr',    nameAr: 'الفجر',    emoji: '🌙', label: 'Fajr' },
  { key: 'Sunrise', nameAr: 'الشروق',   emoji: '🌅', label: 'Sunrise' },
  { key: 'Dhuhr',   nameAr: 'الظهر',    emoji: '☀️',  label: 'Dhuhr' },
  { key: 'Asr',     nameAr: 'العصر',    emoji: '🌤️', label: 'Asr' },
  { key: 'Maghrib', nameAr: 'المغرب',   emoji: '🌇', label: 'Maghrib' },
  { key: 'Isha',    nameAr: 'العشاء',   emoji: '🌃', label: 'Isha' },
];

async function initPrayerTimes() {
  const content = $('#prayer-content');
  content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Getting location…</p></div>';

  if (!navigator.geolocation) {
    content.innerHTML = '<div class="error-state">Geolocation not supported.</div>';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      content.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Fetching prayer times…</p></div>';

      try {
        /* Reverse geocode using Nominatim for city name */
        let city = 'Your Location', country = '';
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
          const geoJson = await geoRes.json();
          city    = geoJson.address.city || geoJson.address.town || geoJson.address.village || geoJson.address.county || 'Your Location';
          country = geoJson.address.country || '';
        } catch {}

        const url  = API.prayerCoord(latitude, longitude);
        const res  = await fetch(url);
        const json = await res.json();
        if (json.code !== 200) throw new Error('API error');

        const timings = json.data.timings;
        const date    = json.data.date?.readable || '';
        renderPrayerTimes(timings, city, country, date);
      } catch {
        content.innerHTML = '<div class="error-state">⚠️ Failed to fetch prayer times.</div>';
      }
    },
    () => {
      content.innerHTML = `
        <div class="error-state">
          ⚠️ Location access denied.<br>
          <small>Allow location permission to get accurate prayer times.</small>
        </div>`;
    },
    { timeout: 10000 }
  );
}

function renderPrayerTimes(timings, city, country, date) {
  const content = $('#prayer-content');

  /* Determine next prayer */
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let nextPrayer = null;
  let minDiff = Infinity;

  PRAYER_META.forEach(p => {
    const t = timings[p.key];
    if (!t) return;
    const [h, m] = t.split(':').map(Number);
    const pMins = h * 60 + m;
    const diff  = pMins - nowMins;
    if (diff > 0 && diff < minDiff) {
      minDiff   = diff;
      nextPrayer = p.key;
    }
  });

  let html = `
    <div class="prayer-location-card">
      <div class="prayer-location-title">📍 ${city}${country ? ', ' + country : ''}</div>
      <div class="prayer-location-sub">${date}</div>
    </div>
    <div class="prayer-grid">
  `;

  PRAYER_META.forEach(p => {
    const t = timings[p.key];
    if (!t) return;
    const isNext = p.key === nextPrayer;
    html += `
      <div class="prayer-card ${isNext ? 'next-prayer' : ''}">
        <div class="prayer-emoji">${p.emoji}</div>
        <div class="prayer-name">
          <div class="prayer-name-en">${p.label}</div>
          <div class="prayer-name-ar">${p.nameAr}</div>
        </div>
        <div class="prayer-time">${t}</div>
      </div>
    `;
  });

  html += `</div>`;
  content.innerHTML = html;
}

/* ============================================================
   SEARCH TOGGLE (Header icon)
   ============================================================ */
$('#search-toggle-btn')?.addEventListener('click', () => {
  navigateTo('surah-list');
  setTimeout(() => {
    const inp = $('#surah-search-input');
    if (inp) inp.focus();
  }, 350);
});

/* ============================================================
   SERVICE WORKER REGISTRATION
   ============================================================ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('[NoorVerse] SW registered:', reg.scope))
      .catch(err => console.warn('[NoorVerse] SW failed:', err));
  });
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  /* Show dashboard */
  navigateTo('dashboard');
  /* Show install banner after delay */
  initInstallBanner();
}

document.addEventListener('DOMContentLoaded', init);
