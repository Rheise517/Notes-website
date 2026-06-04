const SYSTEM_PROMPT = `You are Forge AI — a note assistant for PlayForge Notes.

Always respond with ONLY valid JSON:
{"message":"your reply","actions":[]}

Actions (only include when modifying notes):
- {"type":"create_note","title":"...","content":"..."}
- {"type":"update_note","id":"...","title":"...","content":"..."}
- {"type":"delete_note","id":"..."}

Rules: Be concise and friendly. Confirm changes. Include note content when asked to read. Use exact note id for updates/deletes. Empty actions array if just chatting or summarizing.`;

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

  const { messages = [], notes = [] } = req.body || {};

  const notesCtx = notes.length
    ? `\n\nCurrent notes (${notes.length}):\n${JSON.stringify(
        notes.map(n => ({ id: n.id, title: n.title, content: n.content })),
        null, 2
      )}`
    : '\n\nNo notes yet.';

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
        max_tokens: 1024,
        system: SYSTEM_PROMPT + notesCtx,
        messages: messages.slice(-10), // keep last 5 exchanges to save tokens
      }),
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
