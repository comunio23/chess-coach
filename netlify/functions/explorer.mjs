export const handler = async (event) => {
  const fen = event.queryStringParameters?.fen;
  if (!fen) {
    return { statusCode: 400, body: JSON.stringify({ error: 'FEN fehlt' }) };
  }

  const token = process.env.LICHESS_TOKEN;
  const url = `https://explorer.lichess.ovh/lichess?variant=standard` +
    `&speeds[]=blitz&speeds[]=rapid&speeds[]=classical` +
    `&ratings[]=1600&ratings[]=1800&ratings[]=2000&ratings[]=2200` +
    `&fen=${encodeURIComponent(fen)}`;

  try {
    const headers = { 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const r = await fetch(url, { headers });

    if (r.status === 401) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'LICHESS_TOKEN fehlt oder ungültig' }),
      };
    }
    if (!r.ok) {
      return {
        statusCode: r.status,
        body: JSON.stringify({ error: `Explorer Fehler ${r.status}` }),
      };
    }

    const data = await r.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
