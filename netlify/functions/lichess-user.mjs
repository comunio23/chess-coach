export const handler = async (event) => {
  // Extract username from path: /api/lichess/user/{username}
  const segments = event.path.split('/').filter(Boolean);
  const username = segments[segments.length - 1];

  if (!username || username === 'lichess-user') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Username fehlt' }) };
  }

  try {
    const r = await fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (r.status === 404) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Spieler nicht gefunden' }) };
    }
    if (!r.ok) {
      return { statusCode: r.status, body: JSON.stringify({ error: `Lichess Fehler ${r.status}` }) };
    }

    const data = await r.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: data.id,
        username: data.username,
        nbGames: data.count?.all || 0,
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
