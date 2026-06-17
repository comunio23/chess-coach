export const handler = async (event) => {
  const fen = event.queryStringParameters?.fen;
  const minRating = parseInt(event.queryStringParameters?.minRating) || 2000;

  if (!fen) {
    return { statusCode: 400, body: JSON.stringify({ error: 'FEN fehlt' }) };
  }

  const token = process.env.LICHESS_TOKEN;

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
