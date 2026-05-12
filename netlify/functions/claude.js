exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY ist nicht gesetzt.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Ungültiger Request-Body.' }) };
  }

  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: body.system,
          messages: body.messages,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 529 || response.status === 503) {
        if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 2500)); continue; }
        return { statusCode: 503, body: JSON.stringify({ error: 'API überlastet. Bitte erneut versuchen.' }) };
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return { statusCode: response.status, body: JSON.stringify({ error: err?.error?.message || `HTTP ${response.status}` }) };
      }

      const data = await response.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      };

    } catch (err) {
      if (err.name === 'AbortError') {
        if (attempt < maxRetries) continue;
        return { statusCode: 504, body: JSON.stringify({ error: 'Zeitüberschreitung. Bitte erneut versuchen.' }) };
      }
      return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Unbekannter Fehler.' }) };
    }
  }

  return { statusCode: 503, body: JSON.stringify({ error: 'Maximale Versuche erreicht.' }) };
};
