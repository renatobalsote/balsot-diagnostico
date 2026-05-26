
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key não configurada no servidor.' });

  try {
    const body = req.body;
    const prompt = typeof body === 'string' ? JSON.parse(body).prompt : body.prompt;

    if (!prompt) return res.status(400).json({ error: 'Prompt não enviado.' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    // Lê a resposta como texto primeiro para debug
    const rawText = await response.text();

    // Tenta fazer parse
    let data;
    try {
      data = JSON.parse(rawText);
    } catch(parseErr) {
      // Se não for JSON, retorna o texto raw para debug
      return res.status(500).json({
        error: 'Anthropic retornou resposta inválida: ' + rawText.substring(0, 200)
      });
    }

    if (data.error) {
      return res.status(400).json({ error: data.error.message || JSON.stringify(data.error) });
    }

    const text = data.content?.[0]?.text || '{}';
    return res.status(200).json({ text });

  } catch (e) {
    return res.status(500).json({ error: 'Exceção: ' + e.message });
  }
}
