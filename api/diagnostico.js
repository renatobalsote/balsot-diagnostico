export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key nao configurada.' });

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { prompt, answers } = payload;
    if (!prompt) return res.status(400).json({ error: 'Prompt nao enviado.' });

    // 1. GERAR DIAGNOSTICO
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
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

    const rawText = await aiRes.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: 'Resposta invalida: ' + rawText.substring(0, 200) }); }
    if (data.error) return res.status(400).json({ error: data.error.message || JSON.stringify(data.error) });

    const reportText = data.content?.[0]?.text || '{}';

    // 2. PARSE DO RELATORIO
    let report = {};
    try {
      let cleaned = reportText.replace(/```json/g,'').replace(/```/g,'').trim();
      const js = cleaned.indexOf('{'), je = cleaned.lastIndexOf('}');
      if (js !== -1 && je !== -1) cleaned = cleaned.slice(js, je+1);
      report = JSON.parse(cleaned);
    } catch(e) {}

    // 3. SALVAR NO GOOGLE SHEETS via Apps Script
    const webhook = process.env.GOOGLE_SHEETS_WEBHOOK;
    if (webhook) {
      try {
        const row = {
          data:             new Date().toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}),
          nome:             report.nome        || (answers||{}).nome        || '',
          empresa:          report.empresa     || (answers||{}).empresa     || '',
          whatsapp:         report.whatsapp    || (answers||{}).whatsapp    || '',
          email:            report.email       || (answers||{}).email       || '',
          nicho:            report.nicho       || (answers||{}).nicho       || '',
          faturamento:      (answers||{}).fat  || '',
          funcionarios:     (answers||{}).func || '',
          score:            String(report.score || ''),
          nivel:            report.nivel       || '',
          resumo:           report.resumo      || '',
          oportunidades:    (report.oportunidades||[]).map(o=>o.titulo+'['+o.urgencia+']').join('|'),
          spin_situacao:    (report.spin||{}).situacao    || '',
          spin_problema:    (report.spin||{}).problema    || '',
          spin_implicacao:  (report.spin||{}).implicacao  || '',
          spin_necessidade: (report.spin||{}).necessidade || '',
          plano_30dias:     ((report.plano||[])[0]?.acoes||[]).join('|'),
          plano_90dias:     ((report.plano||[])[1]?.acoes||[]).join('|'),
          potencial:        report.potencial   || '',
          prospeccao:       Array.isArray((answers||{}).prosp) ? answers.prosp.join(',') : ((answers||{}).prosp||''),
          crm:              (answers||{}).crm  || '',
          dificuldade:      (answers||{}).dif  || '',
          ia:               (answers||{}).ia   || '',
          automacoes:       (answers||{}).auto || '',
          objetivo:         (answers||{}).obj  || '',
          prioridade:       (answers||{}).prior|| '',
        };

        // Tentar POST primeiro
        const postRes = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(row),
          redirect: 'follow',
        });
        const postText = await postRes.text();
        console.log('Sheets POST status:', postRes.status, postText.substring(0,100));

        // Se POST falhar, tentar GET
        if (!postText.includes('"ok"')) {
          const params = new URLSearchParams(row).toString();
          const getRes = await fetch(webhook + '?' + params, { redirect: 'follow' });
          const getText = await getRes.text();
          console.log('Sheets GET status:', getRes.status, getText.substring(0,100));
        }

      } catch(e) {
        console.error('Sheets erro:', e.message);
      }
    }

    return res.status(200).json({ text: reportText });

  } catch(e) {
    return res.status(500).json({ error: 'Excecao: ' + e.message });
  }
}
