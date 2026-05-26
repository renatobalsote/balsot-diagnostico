
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey    = process.env.ANTHROPIC_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const emailTo   = process.env.EMAIL_DESTINO; // seu e-mail para receber os leads

  if (!apiKey) return res.status(500).json({ error: 'API key não configurada no servidor.' });

  try {
    const body   = req.body;
    const payload = typeof body === 'string' ? JSON.parse(body) : body;
    const { prompt, answers } = payload;

    if (!prompt) return res.status(400).json({ error: 'Prompt não enviado.' });

    // ── 1. GERAR DIAGNÓSTICO ──────────────────────────────────────
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
    catch { return res.status(500).json({ error: 'Anthropic retornou resposta inválida: ' + rawText.substring(0, 300) }); }

    if (data.error) return res.status(400).json({ error: data.error.message || JSON.stringify(data.error) });

    const reportText = data.content?.[0]?.text || '{}';

    // Parse do relatório para montar e-mail estruturado
    let report = {};
    try {
      let cleaned = reportText.replace(/```json/g,'').replace(/```/g,'').trim();
      const js = cleaned.indexOf('{'), je = cleaned.lastIndexOf('}');
      if (js !== -1 && je !== -1) cleaned = cleaned.slice(js, je+1);
      report = JSON.parse(cleaned);
    } catch(e) { report = {}; }

    // ── 2. ENVIAR E-MAIL VIA RESEND ───────────────────────────────
    if (resendKey && emailTo) {
      const leadName    = report.nome     || answers?.nome     || 'Lead';
      const leadEmpresa = report.empresa  || answers?.empresa  || '—';
      const leadWpp     = report.whatsapp || answers?.whatsapp || '—';
      const leadEmail   = report.email    || answers?.email    || '—';
      const leadNicho   = report.nicho    || answers?.nicho    || '—';
      const score       = report.score    || '—';
      const nivel       = report.nivel    || '—';
      const resumo      = report.resumo   || '—';

      // Monta tabela de respostas
      const answersRows = answers
        ? Object.entries(answers).map(([k,v]) =>
            `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;color:#666;font-size:13px;width:40%">${k}</td>
             <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px">${Array.isArray(v)?v.join(', '):v||'—'}</td></tr>`
          ).join('')
        : '';

      // Monta oportunidades
      const opps = (report.oportunidades||[]).map(o =>
        `<div style="background:#f0fdfa;border-left:3px solid #0d9488;padding:10px 14px;margin-bottom:8px;border-radius:4px">
          <strong style="color:#0f766e">${o.titulo||''}</strong>
          <span style="background:${o.urgencia==='Alta'?'#fef2f2':o.urgencia==='Média'?'#fff7ed':'#f0fdf4'};
            color:${o.urgencia==='Alta'?'#991b1b':o.urgencia==='Média'?'#9a3412':'#166534'};
            font-size:11px;padding:2px 8px;border-radius:10px;margin-left:8px">${o.urgencia||''} urgência</span>
          <p style="margin:4px 0 0;font-size:13px;color:#555">${o.descricao||''}</p>
          ${o.servico?`<p style="margin:4px 0 0;font-size:12px;color:#c9a84c">→ ${o.servico}</p>`:''}
        </div>`
      ).join('');

      // Monta SPIN
      const spin = report.spin ? `
        <div style="margin-bottom:6px;background:#eff6ff;border-left:3px solid #3b82f6;padding:8px 12px;border-radius:4px">
          <strong style="color:#1e40af;font-size:12px">S — SITUAÇÃO</strong>
          <p style="margin:3px 0 0;font-size:13px;color:#374151">${report.spin.situacao||''}</p>
        </div>
        <div style="margin-bottom:6px;background:#fef2f2;border-left:3px solid #ef4444;padding:8px 12px;border-radius:4px">
          <strong style="color:#991b1b;font-size:12px">P — PROBLEMA</strong>
          <p style="margin:3px 0 0;font-size:13px;color:#374151">${report.spin.problema||''}</p>
        </div>
        <div style="margin-bottom:6px;background:#fff7ed;border-left:3px solid #f97316;padding:8px 12px;border-radius:4px">
          <strong style="color:#9a3412;font-size:12px">I — IMPLICAÇÃO</strong>
          <p style="margin:3px 0 0;font-size:13px;color:#374151">${report.spin.implicacao||''}</p>
        </div>
        <div style="background:#fffbeb;border-left:3px solid #c9a84c;padding:8px 12px;border-radius:4px">
          <strong style="color:#92400e;font-size:12px">N — NECESSIDADE</strong>
          <p style="margin:3px 0 0;font-size:13px;color:#374151">${report.spin.necessidade||''}</p>
        </div>` : '';

      const scoreColor = score >= 70 ? '#16a34a' : score >= 40 ? '#ea580c' : '#dc2626';

      const emailHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">

  <!-- HEADER -->
  <tr><td style="background:#0e1117;padding:24px 32px;border-bottom:3px solid #c9a84c">
    <table width="100%"><tr>
      <td><span style="font-size:22px;font-weight:900;color:#c9a84c;letter-spacing:2px">BALSOT</span><br>
        <span style="font-size:11px;color:#8892b0;letter-spacing:1px;text-transform:uppercase">Consultoria Estratégica</span></td>
      <td align="right"><span style="font-size:11px;color:#5a6180">Novo Lead Qualificado</span><br>
        <span style="font-size:11px;color:#c9a84c">${new Date().toLocaleDateString('pt-BR')}</span></td>
    </tr></table>
  </td></tr>

  <!-- ALERTA DE NOVO LEAD -->
  <tr><td style="background:#fffbeb;padding:14px 32px;border-bottom:1px solid #fde68a">
    <span style="font-size:14px;font-weight:700;color:#92400e">🔔 Novo lead preencheu o diagnóstico estratégico</span>
  </td></tr>

  <!-- DADOS DO LEAD -->
  <tr><td style="padding:24px 32px">
    <h2 style="margin:0 0 16px;font-size:16px;color:#0e1117;border-bottom:2px solid #c9a84c;padding-bottom:8px">📋 Dados do Lead</h2>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:8px 12px;background:#f8f9fa;border-radius:8px;margin-bottom:8px" width="48%">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Nome</div>
          <div style="font-size:15px;font-weight:700;color:#0e1117;margin-top:2px">${leadName}</div>
        </td>
        <td width="4%"></td>
        <td style="padding:8px 12px;background:#f8f9fa;border-radius:8px" width="48%">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Empresa</div>
          <div style="font-size:15px;font-weight:700;color:#0e1117;margin-top:2px">${leadEmpresa}</div>
        </td>
      </tr>
      <tr><td colspan="3" style="height:8px"></td></tr>
      <tr>
        <td style="padding:8px 12px;background:#f0fdf4;border-radius:8px" width="48%">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">WhatsApp</div>
          <div style="font-size:15px;font-weight:700;color:#16a34a;margin-top:2px">${leadWpp}</div>
        </td>
        <td width="4%"></td>
        <td style="padding:8px 12px;background:#eff6ff;border-radius:8px" width="48%">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">E-mail</div>
          <div style="font-size:15px;font-weight:700;color:#1d4ed8;margin-top:2px">${leadEmail}</div>
        </td>
      </tr>
      <tr><td colspan="3" style="height:8px"></td></tr>
      <tr>
        <td colspan="3" style="padding:8px 12px;background:#fdf6e3;border-radius:8px">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px">Nicho de Mercado</div>
          <div style="font-size:15px;font-weight:700;color:#c9a84c;margin-top:2px">${leadNicho}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- SCORE -->
  <tr><td style="padding:0 32px 24px">
    <table width="100%" style="background:#0e1117;border-radius:10px;overflow:hidden">
      <tr>
        <td style="padding:20px 24px" width="30%" align="center">
          <div style="width:64px;height:64px;border-radius:50%;border:3px solid ${scoreColor};
            display:inline-flex;align-items:center;justify-content:center;
            background:rgba(255,255,255,0.05);margin:0 auto">
            <span style="font-size:22px;font-weight:900;color:${scoreColor}">${score}</span>
          </div>
          <div style="font-size:10px;color:#5a6180;margin-top:4px;text-transform:uppercase;letter-spacing:.5px">Score</div>
        </td>
        <td style="padding:20px 24px;border-left:1px solid rgba(255,255,255,0.07)">
          <div style="font-size:14px;font-weight:700;color:${scoreColor};margin-bottom:6px">${nivel}</div>
          <div style="font-size:12px;color:#8892b0;line-height:1.6">${resumo}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- OPORTUNIDADES -->
  ${opps ? `<tr><td style="padding:0 32px 24px">
    <h2 style="margin:0 0 14px;font-size:16px;color:#0e1117;border-bottom:2px solid #0d9488;padding-bottom:8px">🎯 Oportunidades Identificadas</h2>
    ${opps}
  </td></tr>` : ''}

  <!-- SPIN -->
  ${spin ? `<tr><td style="padding:0 32px 24px">
    <h2 style="margin:0 0 14px;font-size:16px;color:#0e1117;border-bottom:2px solid #c9a84c;padding-bottom:8px">◆ Análise SPIN</h2>
    ${spin}
  </td></tr>` : ''}

  <!-- RESPOSTAS COMPLETAS -->
  ${answersRows ? `<tr><td style="padding:0 32px 24px">
    <h2 style="margin:0 0 14px;font-size:16px;color:#0e1117;border-bottom:2px solid #e5e7eb;padding-bottom:8px">📝 Respostas Completas do Formulário</h2>
    <table width="100%" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      ${answersRows}
    </table>
  </td></tr>` : ''}

  <!-- CTA -->
  <tr><td style="padding:0 32px 32px">
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:18px 22px;text-align:center">
      <p style="margin:0 0 12px;font-size:13px;color:#92400e;font-weight:600">Entre em contato com este lead o quanto antes</p>
      <a href="https://wa.me/55${leadWpp.replace(/\D/g,'')}"
        style="display:inline-block;padding:10px 24px;background:#25d366;color:#fff;
          font-weight:700;font-size:13px;border-radius:8px;text-decoration:none;margin-right:8px">
        WhatsApp
      </a>
      <a href="mailto:${leadEmail}"
        style="display:inline-block;padding:10px 24px;background:#c9a84c;color:#0a0800;
          font-weight:700;font-size:13px;border-radius:8px;text-decoration:none">
        Enviar E-mail
      </a>
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#0e1117;padding:16px 32px;border-top:1px solid rgba(255,255,255,0.07);text-align:center">
    <span style="font-size:11px;color:#5a6180">BALSOT Consultoria Estratégica · Diagnóstico enviado automaticamente</span>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'Balsot Diagnóstico <diagnostico@resend.dev>',
          to: [emailTo],
          subject: `🔔 Novo Lead: ${leadName} — ${leadEmpresa} (Score ${score})`,
          html: emailHtml,
        }),
      });
    }

    return res.status(200).json({ text: reportText });

  } catch (e) {
    return res.status(500).json({ error: 'Exceção: ' + e.message });
  }
}
