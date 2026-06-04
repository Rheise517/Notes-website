const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_ANON_KEY;
const RESEND_KEY    = process.env.RESEND_API_KEY;
const CRON_SECRET   = process.env.CRON_SECRET;
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
  return { ok: res.ok, data };
}

async function sendReminderEmail(to, message) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'PlayForge Notes <onboarding@resend.dev>',
      to: [to],
      subject: `Reminder: ${message}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#111118;border-radius:12px">
          <p style="font-size:13px;font-weight:700;color:#FF5F2E;margin:0 0 16px;letter-spacing:-0.02em">PlayForge Notes</p>
          <h2 style="font-size:20px;font-weight:700;color:#EDEBE7;margin:0 0 16px;letter-spacing:-0.02em">Reminder</h2>
          <p style="font-size:15px;line-height:1.6;color:#EDEBE7;background:#18181F;padding:16px 20px;border-radius:8px;border:1px solid #26263A;margin:0">${message}</p>
          <p style="margin-top:20px;font-size:11px;color:#484763">Sent from PlayForge Notes</p>
        </div>`,
    }),
  });
}

module.exports = async function handler(req, res) {
  // Protect with CRON_SECRET if set
  if (CRON_SECRET) {
    const secret = req.query.secret || req.headers['x-cron-secret'];
    if (secret !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();

  // Fetch all active, overdue reminders
  const { ok, data } = await sbFetch(
    `${TABLE}?active=eq.true&next_fire_at=lte.${encodeURIComponent(now)}`
  );
  if (!ok) return res.status(500).json({ error: 'Supabase query failed', detail: data });

  const candidates = Array.isArray(data) ? data : [];

  // Filter out ones already sent this cycle (last_sent_at >= next_fire_at means already handled)
  const due = candidates.filter(
    r => !r.last_sent_at || new Date(r.last_sent_at) < new Date(r.next_fire_at)
  );

  let fired = 0;
  for (const reminder of due) {
    try {
      await sendReminderEmail(reminder.email, reminder.message);

      if (reminder.recurrence_days) {
        // Advance to next occurrence
        const next = new Date(reminder.next_fire_at);
        next.setDate(next.getDate() + Number(reminder.recurrence_days));
        await sbFetch(`${TABLE}?id=eq.${reminder.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ next_fire_at: next.toISOString(), last_sent_at: now }),
        });
      } else {
        // One-time — deactivate
        await sbFetch(`${TABLE}?id=eq.${reminder.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: false, last_sent_at: now }),
        });
      }
      fired++;
    } catch (e) {
      console.error('Failed to process reminder', reminder.id, e);
    }
  }

  return res.status(200).json({ checked: candidates.length, fired });
};
