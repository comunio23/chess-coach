import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.Lichess,
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Claude API Proxy ──────────────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  try {
    const { messages, system, max_tokens = 2000 } = req.body;
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens,
      ...(system ? { system } : {}),
      messages,
    });
    const text = response.content.find(b => b.type === 'text')?.text || '';
    res.json({ text });
  } catch (err) {
    console.error('Claude API Fehler:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Stockfish.js als Web Worker bereitstellen ────────────────────────
app.get('/stockfish.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/stockfish.js/stockfish.js'));
});

// ── Lichess Opening Explorer Proxy ───────────────────────────────────
app.get('/api/explorer', async (req, res) => {
  const token = process.env.LICHESS_TOKEN;
  const fen = req.query.fen;
  const minRating = parseInt(req.query.minRating) || 1600;
  if (!fen) return res.status(400).json({ error: 'FEN fehlt' });

  const allRatings = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
  const ratings = allRatings.filter(r => r >= minRating);
  const ratingPart = ratings.map(r => `ratings[]=${r}`).join('&');

  const url = `https://explorer.lichess.ovh/lichess?variant=standard` +
    `&speeds[]=blitz&speeds[]=rapid&speeds[]=classical` +
    `&${ratingPart}` +
    `&fen=${encodeURIComponent(fen)}`;

  try {
    const headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const r = await fetch(url, { headers });
    if (r.status === 401) return res.status(401).json({ error: 'LICHESS_TOKEN fehlt oder ungültig' });
    if (!r.ok) return res.status(r.status).json({ error: `Explorer Fehler ${r.status}` });
    res.json(await r.json());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Lichess User-Existenz prüfen ──────────────────────────────────────
app.get('/api/lichess/user/:username', async (req, res) => {
  try {
    const r = await fetch(`https://lichess.org/api/user/${encodeURIComponent(req.params.username)}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (r.status === 404) return res.status(404).json({ error: 'Spieler nicht gefunden' });
    if (!r.ok) return res.status(r.status).json({ error: `Lichess Fehler ${r.status}` });
    const data = await r.json();
    res.json({ id: data.id, username: data.username, nbGames: data.count?.all || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Lichess Partien laden (Proxy) ─────────────────────────────────────
app.get('/api/lichess/games/:username', async (req, res) => {
  const max = Math.min(parseInt(req.query.max) || 100, 300);
  try {
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(req.params.username)}` +
      `?max=${max}&opening=true&clocks=false&evals=false`;
    const r = await fetch(url, {
      headers: {
        'Accept': 'application/x-ndjson',
        'User-Agent': 'ChessCoach/1.0 (local)'
      }
    });
    if (!r.ok) return res.status(r.status).json({ error: `Lichess Fehler ${r.status}` });
    const text = await r.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  const key = process.env.ANTHROPIC_API_KEY || process.env.Lichess;
  console.log(`\n♟  Chess Coach laeuft auf http://localhost:${PORT}`);
  console.log(`   API Key: ${key ? `gesetzt (${key.slice(0, 10)}...)` : 'FEHLT'}\n`);
});
