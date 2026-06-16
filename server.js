import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const client = new Anthropic(); // liest ANTHROPIC_API_KEY aus process.env

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/claude', async (req, res) => {
  try {
    const { messages, system, max_tokens = 1500 } = req.body;
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

const PORT = 3000;
app.listen(PORT, () => {
  const key = process.env.ANTHROPIC_API_KEY;
  console.log(`\n♟  Chess Coach laeuft auf http://localhost:${PORT}`);
  console.log(`   API Key: ${key ? `gesetzt (${key.slice(0, 10)}...)` : 'FEHLT — setze ANTHROPIC_API_KEY als Umgebungsvariable'}\n`);
});
