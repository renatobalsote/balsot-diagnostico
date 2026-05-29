export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey        = process.env.ANTHROPIC_API_KEY;
  const sheetsWebhook = process.env.GOOGLE_SHEETS_WEBHOOK;

  if (!apiKey) return res.status(500).json({ error: 'API key nao configurada no servidor.' });

  try {
    const body    = req.body;
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
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
    } catch(e) { report = {}; }

    // 3. SALVAR NO GOOGLE SHEETS
    if (sheetsWebhook) {
      try {
        const oportunidades = (report.oportunidades || [])
          .map(o => (o.titulo || '') + ' [' + (o.urgencia || '') + ']')
          .join(' | ');

        const rowData = {
          data:             new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
          nome:             report.nome             || (answers && answers.nome)        || '',
          empresa:          report.empresa          || (answers && answers.empresa)     || '',
          whatsapp:         report.whatsapp         || (answers && answers.whatsapp)    || '',
          email:            report.email            || (answers && answers.email)       || '',
          nicho:            report.nicho            || (answers && answers.nicho)       || '',
          faturamento:      (answers && answers.fat)   || '',
          funcionarios:     (answers && answers.func)  || '',
          score:            String(report.score     || ''),
          nivel:            report.nivel            || '',
          resumo:           report.resumo           || '',
          oportunidades:    oportunidades,
          spin_situacao:    (report.spin && report.spin.situacao)    || '',
          spin_problema:    (report.spin && report.spin.problema)    || '',
          spin_implicacao:  (report.spin && report.spin.implicacao)  || '',
          spin_necessidade: (report.spin && report.spin.necessidade) || '',
          plano_30dias:     (report.plano && report.plano[0] && report.plano[0].acoes || []).join(' | '),
          plano_90dias:     (report.plano && report.plano[1] && report.plano[1].acoes || []).join(' | '),
          potencial:        report.potencial        || '',
          prospeccao:       Array.isArray(answers && answers.prosp) ? answers.prosp.join(', ') : ((answers && answers.prosp) || ''),
          crm:              (answers && answers.crm)   || '',
          dificuldade:      (answers && answers.dif)   || '',
          ia:               (answers && answers.ia)    || '',
          automacoes:       (answers && answers.auto)  || '',
          objetivo:         (answers && answers.obj)   || '',
          prioridade:       (answers && answers.prior) || '',
        };

        console.log('Sheets webhook URL:', sheetsWebhook ? 'configurada' : 'NAO configurada');
        console.log('Enviando para Sheets:', rowData.nome, rowData.empresa);

        // Usar GET com parâmetros para evitar problema de CORS/redirect do Apps Script
        const params = new URLSearchParams(rowData).toString();
        const getUrl = sheetsWebhook + '?' + params;

        const sheetsRes = await fetch(getUrl, {
          method: 'GET',
          redirect: 'follow',
        });

        const sheetsText = await sheetsRes.text();
        console.log('Sheets resposta status:', sheetsRes.status);
        console.log('Sheets resposta body:', sheetsText.substring(0, 200));

      } catch(e) {
        console.error('Sheets erro:', e.message);
      }
    } else {
      console.log('GOOGLE_SHEETS_WEBHOOK nao configurado');
    }

    return res.status(200).json({ text: reportText });

  } catch(e) {
    return res.status(500).json({ error: 'Excecao: ' + e.message });
  }
}