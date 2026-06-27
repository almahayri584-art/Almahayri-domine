// ═══════════════════════════════════════════════════════════════════════════
// TRACKING-MODULE.JS — main.html için (Firebase v9+ modüler SDK uyumlu)
// Bu dosya, main.html'in <script type="module"> bloğu İÇİNE import edilmelidir.
// Compat (firebase.firestore()) kullanan index.html / shop.html'de KULLANILMAZ,
// onlar için ayrı "tracking.js" (compat versiyon) kullanılır.
//
// KULLANIM (main.html içinde, db oluşturulduktan SONRA):
//   import { initTrackingModule } from './tracking-module.js';
//   const T = initTrackingModule(db, 'main');
//   // Sonra butonlarda: T.trackClick('buy_now','اشترِ الآن')  T.trackStoreClick('Ad')
// ═══════════════════════════════════════════════════════════════════════════

import {
  collection, doc, addDoc, getDoc, setDoc, getDocs, query, where, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const VISIT_THRESHOLD = 50;

export function initTrackingModule(db, pageName) {
  let tgToken = null;
  let tgChatId = null;
  let tgSettingsLoaded = false;

  async function loadTgSettings() {
    if (tgSettingsLoaded) return;
    try {
      const snap = await getDoc(doc(db, 'settings', 'review_telegram'));
      if (snap.exists()) {
        const d = snap.data();
        tgToken = d.token || null;
        tgChatId = d.chatId || null;
      }
    } catch (e) {
      console.error('Tracking: TG ayarları okunamadı', e);
    }
    tgSettingsLoaded = true;
  }

  async function sendTelegram(text) {
    await loadTgSettings();
    if (!tgToken || !tgChatId) {
      console.warn('Tracking: Telegram ayarları yok, rapor gönderilemedi');
      return false;
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChatId, text, parse_mode: 'HTML' })
      });
      const d = await res.json();
      return d.ok;
    } catch (e) {
      console.error('Tracking: Telegram gönderme hatası', e);
      return false;
    }
  }

  function logEvent(type, data) {
    addDoc(collection(db, 'analytics_events'), Object.assign({
      type: type,
      ts: Date.now()
    }, data)).then(() => {
      if (type === 'visit') checkAutoReport();
    }).catch(err => console.error('logEvent hata:', type, err));
  }

  async function checkAutoReport() {
    const counterRef = doc(db, 'analytics_meta', 'counter');
    try {
      const newCount = await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists() ? (snap.data().count || 0) : 0;
        const updated = current + 1;
        tx.set(counterRef, { count: updated }, { merge: true });
        return updated;
      });
      if (newCount >= VISIT_THRESHOLD) {
        await setDoc(counterRef, { count: 0 }, { merge: true });
        await sendReportSinceLastTime('🔔 Otomatik Rapor (50 ziyaret tamamlandı)');
      }
    } catch (e) {
      console.error('checkAutoReport hata:', e);
    }
  }

  async function sendReportSinceLastTime(titleOverride) {
    const metaRef = doc(db, 'analytics_meta', 'lastReport');
    let lastTs = 0;
    try {
      const snap = await getDoc(metaRef);
      if (snap.exists()) lastTs = snap.data().ts || 0;
    } catch (e) {
      console.error('lastReport okunamadı', e);
    }

    const now = Date.now();

    let events = [];
    try {
      const q = query(collection(db, 'analytics_events'), where('ts', '>', lastTs));
      const snap = await getDocs(q);
      events = snap.docs.map(d => d.data());
    } catch (e) {
      console.error('analytics_events okunamadı', e);
      return false;
    }

    const visitsByPage = {};
    const clicksByType = {};
    const storeClicksByName = {};
    let durationTotal = 0;
    let durationCount = 0;

    events.forEach(ev => {
      if (ev.type === 'visit') {
        const p = ev.page || 'bilinmeyen';
        visitsByPage[p] = (visitsByPage[p] || 0) + 1;
      } else if (ev.type === 'click') {
        const label = ev.label || ev.clickType || 'bilinmeyen';
        clicksByType[label] = (clicksByType[label] || 0) + 1;
      } else if (ev.type === 'store_click') {
        const name = ev.storeName || 'bilinmeyen';
        storeClicksByName[name] = (storeClicksByName[name] || 0) + 1;
      } else if (ev.type === 'duration') {
        if (typeof ev.seconds === 'number') {
          durationTotal += ev.seconds;
          durationCount++;
        }
      }
    });

    const totalVisits = Object.values(visitsByPage).reduce((a, b) => a + b, 0);
    const avgDuration = durationCount > 0 ? Math.round(durationTotal / durationCount) : 0;

    const periodStart = lastTs ? new Date(lastTs).toLocaleString('ar-EG') : 'البداية';
    const periodEnd = new Date(now).toLocaleString('ar-EG');

    let msg = (titleOverride || '📊 تقرير الموقع') + '\n\n';
    msg += `🗓 من: ${periodStart}\n🗓 إلى: ${periodEnd}\n\n`;

    msg += `👥 <b>الزيارات:</b> ${totalVisits}\n`;
    Object.entries(visitsByPage).forEach(([page, count]) => {
      msg += `   • ${page}: ${count}\n`;
    });

    msg += `\n🖱 <b>الضغطات على الأزرار:</b>\n`;
    const clickEntries = Object.entries(clicksByType);
    if (clickEntries.length === 0) {
      msg += `   لا توجد ضغطات\n`;
    } else {
      clickEntries.sort((a, b) => b[1] - a[1]).forEach(([label, count]) => {
        msg += `   • ${label}: ${count}\n`;
      });
    }

    msg += `\n📍 <b>ضغطات المواقع/المتاجر:</b>\n`;
    const storeEntries = Object.entries(storeClicksByName);
    if (storeEntries.length === 0) {
      msg += `   لا توجد ضغطات\n`;
    } else {
      storeEntries.sort((a, b) => b[1] - a[1]).forEach(([name, count]) => {
        msg += `   • ${name}: ${count}\n`;
      });
    }

    msg += `\n⏱ <b>متوسط مدة البقاء في الصفحة:</b> ${avgDuration} ثانية (${durationCount} زيارة محسوبة)`;

    const ok = await sendTelegram(msg);
    if (ok) {
      await setDoc(metaRef, { ts: now }, { merge: true });
    }
    return ok;
  }

  // ── SAYFADA GEÇİRİLEN SÜRE ──
  let visibilityAccum = 0;
  let lastVisibleStart = Date.now();
  let sentDuration = false;

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      visibilityAccum += Date.now() - lastVisibleStart;
    } else {
      lastVisibleStart = Date.now();
    }
  });

  function recordDuration() {
    if (sentDuration) return;
    sentDuration = true;
    if (document.visibilityState === 'visible') {
      visibilityAccum += Date.now() - lastVisibleStart;
    }
    const seconds = Math.round(visibilityAccum / 1000);
    if (seconds < 2) return;
    logEvent('duration', { page: pageName, seconds: seconds });
  }

  window.addEventListener('pagehide', recordDuration);
  window.addEventListener('beforeunload', recordDuration);

  // İlk ziyareti kaydet
  setTimeout(() => logEvent('visit', { page: pageName }), 300);

  // Public API
  const api = {
    trackClick: (type, label) => logEvent('click', { clickType: type, label: label || type }),
    trackStoreClick: (storeName) => logEvent('store_click', { storeName: storeName }),
    sendManualReport: () => sendReportSinceLastTime('📋 تقرير يدوي (بواسطة المشرف)')
  };

  // Global olarak da erişilebilir yap (HTML'deki onclick="trackClick(...)" gibi kullanım için)
  window.trackClick = api.trackClick;
  window.trackStoreClick = api.trackStoreClick;
  window.sendManualReport = api.sendManualReport;

  return api;
}
