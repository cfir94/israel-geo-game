/* =============================================================
   Cloud – חשבונות וסנכרון התקדמות מול Supabase.

   מדבר ישירות מול ה-REST API ב-fetch, בלי SDK ובלי CDN,
   כדי שהמשחק יישאר בלי תלויות חיצוניות.

   אם config.js ריק – כל הפונקציות כאן שקטות והמשחק עובד
   מקומית בדיוק כמו קודם.
   ============================================================= */

const Cloud = (() => {
  const TOKEN_KEY = 'israel-geo-game-session';
  const on = () => !!(CLOUD && CLOUD.url && CLOUD.anonKey);

  let session = null;   // { access_token, refresh_token, user_id, email, display_name }

  /* ------------------------------------------- אחסון הסשן -- */
  function loadSession() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      session = raw ? JSON.parse(raw) : null;
    } catch (e) { session = null; }
    return session;
  }
  function saveSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* אחסון חסום – הסשן יחזיק רק לזמן הביקור */ }
  }

  /* ------------------------------------------------- HTTP -- */
  async function call(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
    const h = {
      apikey: CLOUD.anonKey,
      'Content-Type': 'application/json',
      ...headers
    };
    if (auth && session) h.Authorization = 'Bearer ' + session.access_token;
    const res = await fetch(CLOUD.url.replace(/\/$/, '') + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (res.status === 204) return null;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) {
      const err = new Error((data && (data.msg || data.message || data.error_description || data.error)) ||
        ('שגיאת שרת ' + res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* מרענן טוקן שפג ומנסה שוב, פעם אחת */
  async function withAuth(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e.status !== 401 || !session || !session.refresh_token) throw e;
      const r = await call('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', auth: false, body: { refresh_token: session.refresh_token }
      });
      saveSession({ ...session, access_token: r.access_token, refresh_token: r.refresh_token });
      return await fn();
    }
  }

  /* ------------------------------------------------- אימות -- */
  function unpack(r, fallbackName) {
    const meta = (r.user && r.user.user_metadata) || {};
    return {
      access_token: r.access_token,
      refresh_token: r.refresh_token,
      user_id: r.user ? r.user.id : null,
      email: r.user ? r.user.email : '',
      display_name: meta.display_name || fallbackName || '',
      class_code: meta.class_code || ''
    };
  }

  async function signUp(email, password, displayName, classCode) {
    const r = await call('/auth/v1/signup', {
      method: 'POST', auth: false,
      body: { email, password, data: { display_name: displayName, class_code: classCode || '' } }
    });
    if (!r.access_token) {
      /* הפרויקט דורש אישור מייל – ראו את הערת ההגדרה ב-README */
      const e = new Error('נדרש אישור מייל. כבו "Confirm email" בהגדרות Supabase.');
      e.needsConfirm = true;
      throw e;
    }
    saveSession(unpack(r, displayName));
    if (classCode) saveSession({ ...session, class_code: classCode });
    await ensureProfile(displayName, classCode);
    return session;
  }

  async function signIn(email, password) {
    const r = await call('/auth/v1/token?grant_type=password', {
      method: 'POST', auth: false, body: { email, password }
    });
    saveSession(unpack(r));
    return session;
  }

  function signOut() { saveSession(null); }
  const current = () => session;

  /* ---------------------------------------- כניסה בלי סיסמה --
     Supabase דורש סיסמה, ולכן היא נגזרת מהאימייל עצמו: אותו
     אימייל נותן תמיד את אותה סיסמה, ולכן אפשר להיכנס מכל מכשיר
     בלי לזכור דבר.

     המשמעות: האימייל הוא האסמכתה היחידה. מי שיודע את האימייל של
     מישהו אחר יכול להיכנס לחשבונו ולראות או לדרוס את ההתקדמות
     שלו. בשביל משחק תרגול שמחזיק נקודות וכוכבים בלבד זה מקובל,
     ולא היינו עושים את זה במערכת עם מידע רגיש.            */
  /* אזהרה: המלח הזה קובע את הסיסמה של כל חשבון. שינוי שלו – גם
     סתם התאמה לשם חדש של המשחק – ינתק כל משתמש קיים מהחשבון שלו
     לצמיתות. הוא נשאר בשמו ההיסטורי בכוונה. */
  const SALT = 'mapat-haaretz/v1';
  async function derivePass(email) {
    const data = new TextEncoder().encode(email.trim().toLowerCase() + '|' + SALT);
    const buf = await crypto.subtle.digest('SHA-256', data);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    /* אותיות, ספרות וסימן – עומד בדרישות המורכבות של Supabase */
    return 'Gg1!' + b64.replace(/[^A-Za-z0-9]/g, '').slice(0, 28);
  }

  /* נרשם אם זו הפעם הראשונה, ומתחבר אם החשבון כבר קיים */
  async function quickAuth(email, displayName, classCode) {
    const pass = await derivePass(email);
    try {
      return await signUp(email, pass, displayName, classCode);
    } catch (e) {
      if (e.needsConfirm) throw e;
      const s = await signIn(email, pass);
      /* שם וכיתה מתעדכנים אם הוקלדו מחדש */
      if ((displayName && displayName !== s.display_name) || classCode) {
        saveSession({ ...s, display_name: displayName || s.display_name,
          class_code: classCode || s.class_code });
        await ensureProfile(displayName, classCode);
      }
      return session;
    }
  }

  /* ----------------------------------------------- פרופיל -- */
  async function ensureProfile(displayName, classCode) {
    if (!session) return;
    const row = { id: session.user_id, display_name: displayName || session.display_name || '' };
    if (classCode || session.class_code) row.class_code = classCode || session.class_code;
    await withAuth(() => call('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [row]
    }));
  }

  /* מושך את השמירה מהשרת. מחזיר null אם אין עדיין */
  async function pull() {
    if (!on() || !session) return null;
    const rows = await withAuth(() => call('/rest/v1/profiles?id=eq.' + session.user_id +
      '&select=save,display_name,class_code,is_teacher,xp,stars'));
    if (!rows || !rows.length) return null;
    const row = rows[0];
    const patch = {};
    if (row.display_name && row.display_name !== session.display_name) patch.display_name = row.display_name;
    if (row.class_code && row.class_code !== session.class_code) patch.class_code = row.class_code;
    if (!!row.is_teacher !== !!session.is_teacher) patch.is_teacher = !!row.is_teacher;
    if (Object.keys(patch).length) saveSession({ ...session, ...patch });
    return row.save && Object.keys(row.save).length ? row.save : null;
  }

  /* דוחף את השמירה לשרת */
  async function push(save, stats) {
    if (!on() || !session) return;
    await withAuth(() => call('/rest/v1/profiles?id=eq.' + session.user_id, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        save,
        xp: (stats && stats.xp) || 0,
        stars: (stats && stats.stars) || 0,
        streak: (stats && stats.streak) || 0,
        best_streak: (stats && stats.bestStreak) || 0,
        shields: (stats && stats.shields) || 0,
        last_active: (stats && stats.lastActive) || null,
        display_name: session.display_name || '',
        class_code: session.class_code || '',
        updated_at: new Date().toISOString()
      }
    }));
  }

  const rpc = (name, body = {}) => withAuth(() =>
    call('/rest/v1/rpc/' + name, { method: 'POST', body }));

  async function leaderboard(period = 'all') {
    if (!on() || !session) return [];
    return (await rpc('leaderboard', { p_period: period })) || [];
  }
  async function classWeek() {
    if (!on() || !session) return null;
    const r = await rpc('class_week');
    return Array.isArray(r) ? r[0] : r;
  }
  async function classFeed(limit = 30) {
    if (!on() || !session) return [];
    return (await rpc('class_feed', { p_limit: limit })) || [];
  }
  async function classRoster() {
    if (!on() || !session) return [];
    return (await rpc('class_roster')) || [];
  }

  /* יומן הפעילות: שורה ליום, נדרסת בכל דחיפה */
  async function pushActivity(log) {
    if (!on() || !session || !log) return;
    const rows = Object.keys(log).sort().slice(-14).map(day => ({
      user_id: session.user_id, day,
      xp: log[day].xp | 0, questions: log[day].q | 0
    }));
    if (!rows.length) return;
    await withAuth(() => call('/rest/v1/activity?on_conflict=user_id,day', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: rows
    }));
  }

  /* אירוע הישג לפיד. תווית מרשימה סגורה, בלי טקסט חופשי. */
  async function logEvent(kind, label, value) {
    if (!on() || !session || !session.class_code) return;
    try {
      await withAuth(() => call('/rest/v1/events', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: [{ user_id: session.user_id, class_code: session.class_code,
                 kind, label: String(label).slice(0, 80), value: value | 0 }]
      }));
    } catch (e) { /* הפיד הוא בונוס – לא מפיל כלום */ }
  }

  /* ------------------------------------------------- מיזוג --
     כשמתחברים ממכשיר חדש, או אחרי משחק במצב אורח, מאחדים את
     שתי ההתקדמויות במקום לבחור אחת ולאבד את השנייה.
     הכלל: לכל הישג נלקח הערך הגבוה מבין השניים.           */
  function maxMap(a = {}, b = {}) {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      out[k] = Math.max(a[k] || 0, b[k] || 0);
    }
    return out;
  }

  function merge(local, remote) {
    if (!remote) return local;
    const out = { ...local };
    out.coins = Math.max(local.coins || 0, remote.coins || 0);
    out.xp = Math.max(local.xp || 0, remote.xp || 0);
    out.best = maxMap(local.best, remote.best);
    out.seen = maxMap(local.seen, remote.seen);

    out.stars = {};
    const keys = new Set([...Object.keys(local.stars || {}), ...Object.keys(remote.stars || {})]);
    for (const k of keys) {
      out.stars[k] = maxMap((local.stars || {})[k], (remote.stars || {})[k]);
    }

    /* אתגר יומי: המאוחר מבין השניים */
    const ld = local.daily || {}, rd = remote.daily || {};
    out.daily = (ld.key || '') >= (rd.key || '') ? ld : rd;

    /* רצף – לא מקסימום! אם בטלפון רצף 5 מהיום ובמחשב רצף 3
       מלפני שבוע, הנכון הוא 5. מנצחת הרשומה שפעילה יותר לאחרונה. */
    const fresh = (local.lastActive || '') >= (remote.lastActive || '') ? local : remote;
    out.streak = fresh.streak || 0;
    out.lastActive = fresh.lastActive || '';
    out.bestStreak = Math.max(local.bestStreak || 0, remote.bestStreak || 0);
    out.shields = Math.max(local.shields || 0, remote.shields || 0);

    /* יומן הפעילות: איחוד לפי יום, והגבוה מנצח בכל יום */
    out.log = {};
    const days = new Set([...Object.keys(local.log || {}), ...Object.keys(remote.log || {})]);
    for (const d of days) {
      const a = (local.log || {})[d] || { xp: 0, q: 0 };
      const b = (remote.log || {})[d] || { xp: 0, q: 0 };
      out.log[d] = { xp: Math.max(a.xp || 0, b.xp || 0), q: Math.max(a.q || 0, b.q || 0) };
    }

    /* הגדרות נשארות של המכשיר הנוכחי – ערכת נושא וצליל הם
       העדפה מקומית, לא הישג שצריך לסנכרן. */
    return out;
  }

  return {
    get enabled() { return on(); },
    loadSession, current, signUp, signIn, signOut, quickAuth,
    pull, push, leaderboard, merge, ensureProfile,
    classWeek, classFeed, classRoster, pushActivity, logEvent
  };
})();
