const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY;
const REMINDER_EMAIL = process.env.REMINDER_EMAIL;
const TABLE = 'reminders';

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // GET — list active reminders
  if (req.method === 'GET') {
    const r = await sbFetch(`${TABLE}?active=eq.true&order=next_fire_at.asc`);
    return res.status(r.status).json(r.data || []);
  }

  // POST — create a reminder
  if (req.method === 'POST') {
    const { message, remind_at, recurrence_days } = req.body || {};
    if (!message || !remind_at) {
      return res.status(400).json({ error: 'message and remind_at are required' });
    }
    const r = await sbFetch(TABLE, {
      method: 'POST',
      body: JSON.stringify({
        message,
        next_fire_at: remind_at,
        recurrence_days: recurrence_days || null,
        active: true,
        email: REMINDER_EMAIL,
      }),
    });
    return res.status(r.status).json(r.data);
  }

  // PATCH ?id=xxx — cancel a reminder
  if (req.method === 'PATCH') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const r = await sbFetch(`${TABLE}?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    });
    return res.status(r.status).json(r.data);
  }

  return res.status(405).end();
};
