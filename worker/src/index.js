const defaultOrigin = 'https://danyka-icam.github.io';
const allowedEvents = new Set(['form_submit', 'whatsapp_click', 'phone_click', 'flyer_visit']);

const labels = {
  form_submit: '🟢 Nova solicitação pelo site',
  whatsapp_click: '💬 Clique no WhatsApp',
  phone_click: '📞 Clique para ligar',
  flyer_visit: '📍 Visita pelo QR do folheto'
};

const clean = (value, limit = 500) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
const escapeHtml = value => clean(value).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));

function corsHeaders(origin, allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': origin === allowedOrigin ? origin : allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function line(label, value) {
  return value ? `<b>${label}:</b> ${escapeHtml(value)}` : '';
}

function buildMessage(payload, request) {
  const details = payload.details || {};
  const campaign = payload.campaign || {};
  const cf = request.cf || {};
  const location = [cf.city, cf.region, cf.country].filter(Boolean).join(', ');
  const source = [campaign.source, campaign.medium, campaign.campaign].filter(Boolean).join(' / ');

  return [
    `<b>${labels[payload.event]}</b>`,
    '',
    line('Nome', details.nome),
    line('Telefone', details.telefone),
    line('Cidade / bairro', [details.cidade, details.bairro].filter(Boolean).join(' / ')),
    line('Serviço', details.tipo),
    line('Urgência', details.urgencia),
    line('Problema', details.descricao),
    line('Botão', details.link_location),
    line('Origem da campanha', source),
    line('Local aproximado', location),
    line('Dispositivo', payload.device),
    line('Página', payload.page),
    line('Referência', payload.referrer),
    '',
    `<i>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</i>`
  ].filter(Boolean).join('\n').slice(0, 4000);
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || defaultOrigin;
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: origin === allowedOrigin ? 204 : 403, headers });
    }

    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/events') {
      return new Response('Not found', { status: 404, headers });
    }
    if (origin !== allowedOrigin) {
      return new Response('Forbidden', { status: 403, headers });
    }
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return new Response('Service not configured', { status: 503, headers });
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 24_000) {
      return new Response('Payload too large', { status: 413, headers });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400, headers });
    }

    if (!payload || !allowedEvents.has(payload.event)) {
      return new Response('Invalid event', { status: 400, headers });
    }
    if (payload.details?.website) {
      return new Response(null, { status: 204, headers });
    }
    if (payload.event === 'flyer_visit' && env.NOTIFY_FLYER_VISITS !== 'true') {
      return new Response(null, { status: 204, headers });
    }

    const telegramResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: buildMessage(payload, request),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    if (!telegramResponse.ok) {
      console.error('Telegram sendMessage failed', telegramResponse.status);
      return new Response('Notification failed', { status: 502, headers });
    }

    return new Response(null, { status: 204, headers });
  }
};
