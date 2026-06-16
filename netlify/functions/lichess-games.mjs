export const handler = async (event) => {
  // Extract username from path: /api/lichess/games/{username}
  const segments = event.path.split('/').filter(Boolean);
  const username = segments[segments.length - 1];
  const max = Math.min(parseInt(event.queryStringParameters?.max) || 100, 200);

  if (!username || username === 'lichess-games') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Username fehlt' }) };
  }

  try {
    const url = `https://lichess.org/api/games/user/${encodeURIComponent(username)}` +
      `?max=${max}&opening=true&clocks=false&evals=false`;

    const r = await fetch(url, {
      headers: {
        'Accept': 'application/x-ndjson',
        'User-Agent': 'ChessCoach/1.0 (netlify)',
      },
    });

    if (!r.ok) {
      return { statusCode: r.status, body: JSON.stringify({ error: `Lichess Fehler ${r.status}` }) };
    }

    const text = await r.text();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: text,
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
