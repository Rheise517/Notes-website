import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Local dev only: bypass TLS inspection from corporate proxies / antivirus
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3001;

// Load .env.local for local dev (never committed to git)
try {
  const lines = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (k) process.env[k] = v;
  }
} catch (_) {}

const MIME = {
  '.html': 'text/html', '.css': 'text/css',
  '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

function buildDayCalendar() {
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today = new Date();
  today.setHours(0,0,0,0);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getTime() + i * 86400000);
    return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}${i === 0 ? ' (today)' : ''}`;
  }).join('\n');
}

const SYSTEM_PROMPT = `You are Forge AI, a note assistant built into PlayForge Notes.

Current date and time: {DATETIME}

Day-of-week reference for the next 14 days — use these exact dates when scheduling reminders, never calculate dates yourself:
{CALENDAR}

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

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Add ANTHROPIC_API_KEY=sk-ant-... to your .env.local file' }));
        return;
      }
      try {
        const { messages = [], notes = [], clientDateTime = '' } = JSON.parse(body);
        const notesCtx = notes.length
          ? `\n\nCurrent notes (${notes.length}):\n${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, content: n.content })), null, 2)}`
          : '\n\nNo notes yet.';
        const system = SYSTEM_PROMPT
          .replace('{DATETIME}', clientDateTime || new Date().toLocaleString())
          .replace('{CALENDAR}', buildDayCalendar())
          + notesCtx;

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
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  const urlPath = req.url.split('?')[0];
  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  const ext = path.extname(filePath);
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`PlayForge Notes → http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('  ⚠  ANTHROPIC_API_KEY missing — create .env.local (see .env.example)');
  }
});
