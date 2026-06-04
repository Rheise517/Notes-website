const SYSTEM_PROMPT = `You are Forge AI, a note assistant built into PlayForge Notes.

Current date and time: {DATETIME}

Always reply with ONLY valid JSON — no text outside it, no markdown fences:
{"message":"...","actions":[]}

Actions (include only when modifying notes):
{"type":"create_note","title":"...","content":"..."}
{"type":"update_note","id":"...","title":"...","content":"..."}
{"type":"delete_note","id":"..."}

Tone: Direct and plain. No emojis. No filler phrases. Confirm changes in one sentence.

Logging and tracking notes (sessions, finances, workouts, daily logs, etc.):
- Format with labeled time blocks when tracking events over time.
- If the user mentions a time (e.g. "1 PM", "this morning", "around 4"), use it as the block header.
- When adding new entries, always append a new time block — never silently merge with or overwrite prior blocks. Preserve the full history.
- Keep a Summary section at the end with running totals; update it with every new entry.
- If no time is given but it is clearly a new session or continuation later in the day, use the current time from the date/time above, or label it "Later" if ambiguous.

Log structure example:
June 3, 2026

1:00 PM
[details]

4:00 PM
[details]

Summary
[running totals]

General:
- When asked to read a note, include its full content in the message field.
- Use the exact note id for update and delete actions.
- Use actions:[] when only chatting or reading.`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set — add it in Vercel environment variables' });
  }

  const { messages = [], notes = [], clientDateTime = '' } = req.body || {};

  const notesCtx = notes.length
    ? `\n\nCurrent notes (${notes.length}):\n${JSON.stringify(
        notes.map(n => ({ id: n.id, title: n.title, content: n.content })),
        null, 2
      )}`
    : '\n\nNo notes yet.';
  const system = SYSTEM_PROMPT.replace('{DATETIME}', clientDateTime || new Date().toLocaleString()) + notesCtx;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system,
        messages: messages.slice(-12),
      }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
