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
      display_name: meta.display_name || fallbackName || ''
    };
  }

  async function signUp(email, password, displayName) {
    const r = await call('/auth/v1/signup', {
      method: 'POST', auth: false,
      body: { email, password, data: { display_name: displayName } }
    });
    if (!r.access_token) {
      /* הפרויקט דורש אישור מייל – ראו את הערת ההגדרה ב-README */
      const e = new Error('נדרש אישור מייל. כבו "Confirm email" בהגדרות Supabase.');
      e.needsConfirm = true;
      throw e;
    }
    saveSession(unpack(r, displayName));
    await ensureProfile(displayName);
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

  /* ----------------------------------------------- פרופיל -- */
  async function ensureProfile(displayName) {
    if (!session) return;
    await withAuth(() => call('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [{ id: session.user_id, display_name: displayName || session.display_name || '' }]
    }));
  }

  /* מושך את השמירה מהשרת. מחזיר null אם אין עדיין */
  async function pull() {
    if (!on() || !session) return null;
    const rows = await withAuth(() => call(
      '/rest/v1/profiles?id=eq.' + session.user_id + '&select=save,display_name,xp,stars'));
    if (!rows || !rows.length) return null;
    const row = rows[0];
    if (row.display_name && row.display_name !== session.display_name) {
      saveSession({ ...session, display_name: row.display_name });
    }
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
        display_name: session.display_name || '',
        updated_at: new Date().toISOString()
      }
    }));
  }

  async function leaderboard() {
    if (!on() || !session) return [];
    return (await withAuth(() => call('/rest/v1/rpc/leaderboard', { method: 'POST', body: {} }))) || [];
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

    /* הגדרות נשארות של המכשיר הנוכחי – ערכת נושא וצליל הם
       העדפה מקומית, לא הישג שצריך לסנכרן. */
    return out;
  }

  return {
    get enabled() { return on(); },
    loadSession, current, signUp, signIn, signOut,
    pull, push, leaderboard, merge, ensureProfile
  };
})();
