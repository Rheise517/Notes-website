import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const SYSTEM_PROMPT = `You are Forge AI — a note assistant for PlayForge Notes.

Always respond with ONLY valid JSON:
{"message":"your reply","actions":[]}

Actions (only include when modifying notes):
- {"type":"create_note","title":"...","content":"..."}
- {"type":"update_note","id":"...","title":"...","content":"..."}
- {"type":"delete_note","id":"..."}

Rules: Be concise and friendly. Confirm changes. Include note content when asked to read. Use exact note id for updates/deletes. Empty actions array if just chatting or summarizing.`;

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
        const { messages = [], notes = [] } = JSON.parse(body);
        const notesCtx = notes.length
          ? `\n\nCurrent notes (${notes.length}):\n${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, content: n.content })), null, 2)}`
          : '\n\nNo notes yet.';

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
            messages: messages.slice(-10),
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
