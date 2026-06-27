// ═══════════════════════════════════════════════════════════════════════════
// TRACKING.JS — Tıklama / ziyaret takibi + Telegram raporu
// Bu dosya index.html, main.html ve shop.html'e eklenmelidir (Firebase'den SONRA).
//
// MANTIK:
// - Her tıklama/ziyaret Firestore'a "ham kayıt" olarak yazılır (analytics_events koleksiyonu)
// - Her ziyaret kaydı sırasında global ziyaretçi sayacı kontrol edilir
// - Sayaç 50'ye ulaştığında: son rapordan bu yana olan TÜM olaylar toplanır,
//   Telegram'a gönderilir, "son rapor zamanı" güncellenir, sayaç sıfırlanır
// - Admin panelindeki "Rapor Gönder" butonu da aynı fonksiyonu manuel tetikler
//   (o anda sayaç kaç olursa olsun, son rapordan bu yana olan veriyi gönderir)
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  const VISIT_THRESHOLD = 100; // kaç ziyarette bir otomatik rapor atılsın

  let tgToken = null;
  let tgChatId = null;
  let tgSettingsLoaded = false;

  function getDb() {
    if (window.__trackingDb) return window.__trackingDb;
    try {
      window.__trackingDb = firebase.firestore();
      return window.__trackingDb;
    } catch (e) {
      console.error('Tracking: Firestore alınamadı', e);
      return null;
    }
  }

  async function loadTgSettings() {
    if (tgSettingsLoaded) return;
    const db = getDb();
    if (!db) return;
    try {
      const snap = await db.collection('settings').doc('review_telegram').get();
      if (snap.exists) {
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
    const db = getDb();
    if (!db) return;
    db.collection('analytics_events').add(Object.assign({
      type: type,
      ts: Date.now()
    }, data)).then(() => {
      if (type === 'visit') checkAutoReport();
    }).catch(err => console.error('logEvent hata:', type, err));
  }

  async function checkAutoReport() {
    const db = getDb();
    if (!db) return;
    const counterRef = db.collection('analytics_meta').doc('counter');
    try {
      const newCount = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        const current = snap.exists ? (snap.data().count || 0) : 0;
        const updated = current + 1;
        tx.set(counterRef, { count: updated }, { merge: true });
        return updated;
      });
      if (newCount >= VISIT_THRESHOLD) {
        await counterRef.set({ count: 0 }, { merge: true });
        await sendReportSinceLastTime('🔔 Otomatik Rapor (50 ziyaret tamamlandı)');
      }
    } catch (e) {
      console.error('checkAutoReport hata:', e);
    }
  }

  async function sendReportSinceLastTime(titleOverride) {
    const db = getDb();
    if (!db) return false;

    const metaRef = db.collection('analytics_meta').doc('lastReport');
    let lastTs = 0;
    try {
      const snap = await metaRef.get();
      if (snap.exists) lastTs = snap.data().ts || 0;
    } catch (e) {
      console.error('lastReport okunamadı', e);
    }

    const now = Date.now();

    let events = [];
    try {
      const q = await db.collection('analytics_events')
        .where('ts', '>', lastTs)
        .get();
      events = q.docs.map(d => d.data());
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
      await metaRef.set({ ts: now }, { merge: true });
    }
    return ok;
  }

  // ── PUBLIC: Tıklama takibi ──
  // Kullanım: trackClick('instagram', 'Instagram')
  window.trackClick = function (type, label) {
    logEvent('click', { clickType: type, label: label || type });
  };

  // ── PUBLIC: Konum/mağaza tıklama takibi ──
  window.trackStoreClick = function (storeName) {
    logEvent('store_click', { storeName: storeName });
  };

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
    logEvent('duration', { page: window.__trackingPage || 'unknown', seconds: seconds });
  }

  window.addEventListener('pagehide', recordDuration);
  window.addEventListener('beforeunload', recordDuration);

  // ── PUBLIC: Admin manuel rapor butonu için ──
  // Kullanım: sendManualReport() -> Promise<boolean>
  window.sendManualReport = function () {
    return sendReportSinceLastTime('📋 تقرير يدوي (بواسطة المشرف)');
  };

  // ── BAŞLATMA ──
  // page parametresi: 'index', 'main', veya 'shop'
  window.initTracking = function (page) {
    window.__trackingPage = page;
    lastVisibleStart = Date.now();
    setTimeout(() => logEvent('visit', { page: page }), 300);
  };
})();
