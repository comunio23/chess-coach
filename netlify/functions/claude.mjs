import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.Lichess,
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { messages, system, max_tokens = 2000 } = JSON.parse(event.body || '{}');
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens,
      ...(system ? { system } : {}),
      messages,
    });
    const text = response.content.find(b => b.type === 'text')?.text || '';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
