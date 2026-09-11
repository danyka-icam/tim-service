const defaultOrigin = 'https://danyka-icam.github.io';
const allowedEvents = new Set(['visit_start', 'form_submit', 'whatsapp_click', 'phone_click', 'flyer_visit', 'session_summary']);

const labels = {
  visit_start: '⚡ TIM SERVICE · НОВЫЙ ВИЗИТ',
  form_submit: '⚡ TIM SERVICE · НОВАЯ ЗАЯВКА',
  whatsapp_click: '⚡ TIM SERVICE · ПЕРЕХОД В WHATSAPP',
  phone_click: '⚡ TIM SERVICE · НАЖАЛ «ПОЗВОНИТЬ»',
  flyer_visit: '⚡ TIM SERVICE · НОВЫЙ ВИЗИТ ПО QR',
  session_summary: '⚡ TIM SERVICE · ИТОГ ВИЗИТА'
};

const clean = (value, limit = 500) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
const escapeHtml = value => clean(value).replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));

function corsHeaders(origin, allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': origin === allowedOrigin ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function line(label, value) {
  return value ? `<b>${label}:</b> ${escapeHtml(value)}` : null;
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} мин ${rest} сек` : `${rest} сек`;
}

const translations = new Map([
  ['Sim', 'Да'],
  ['Não', 'Нет'],
  ['Aceitou', 'Разрешена'],
  ['Recusou', 'Запрещена'],
  ['Não escolheu', 'Не выбрано'],
  ['Saiu sem iniciar contato', 'Ушёл без обращения'],
  ['Abriu o WhatsApp', 'Открыл WhatsApp'],
  ['Iniciou uma ligação', 'Нажал «Позвонить»'],
  ['Enviou a solicitação e abriu o WhatsApp', 'Отправил заявку и открыл WhatsApp'],
  ['Saiu ou fechou a página', 'Закрыл или покинул сайт'],
  ['Saiu ou atualizou a página', 'Закрыл или обновил сайт']
]);

function translated(value) {
  return translations.get(clean(value)) || value;
}

function buildMessage(payload, request) {
  const details = payload.details || {};
  const campaign = payload.campaign || {};
  const cf = request.cf || {};
  const location = [cf.city, cf.region, cf.country].filter(Boolean).join(', ');
  const campaignSource = [campaign.source, campaign.medium, campaign.campaign, campaign.content]
    .map(value => clean(value))
    .filter(Boolean)
    .join(' / ');
  const source = campaignSource || clean(payload.referrer) || 'Прямой переход';

  const leadLines = payload.event === 'form_submit' ? [
    '<b>👤 КЛИЕНТ</b>',
    line('Имя', details.nome),
    line('Телефон', details.telefone),
    line('Город / район', [details.cidade, details.bairro].filter(Boolean).join(' / ')),
    line('Услуга', details.tipo),
    line('Срочность', details.urgencia),
    line('Проблема', details.descricao),
    ''
  ] : [];

  const clickLines = ['whatsapp_click', 'phone_click'].includes(payload.event) ? [
    '<b>🖱 ДЕЙСТВИЕ</b>',
    line('Кнопка', details.link_location || 'Без подписи'),
    ''
  ] : [];

  const sessionLines = payload.event === 'session_summary' ? [
    '<b>✅ РЕЗУЛЬТАТ</b>',
    line('Итог', translated(details.result)),
    line('Начал заполнять форму', translated(details.form_started)),
    '',
    '<b>⏱ ВРЕМЯ</b>',
    line('Всего на сайте', formatDuration(details.duration_seconds)),
    line('Активно', formatDuration(details.active_seconds)),
    '',
    '<b>👀 ПРОСМОТР</b>',
    line('Прокрутка', details.max_scroll),
    line('Разделы', details.sections || 'Не определены'),
    '',
    '<b>🖱 ДЕЙСТВИЯ</b>',
    line('Что делал', details.actions || 'Без кликов'),
    line('Google Analytics', translated(details.analytics_consent)),
    line('Завершение', translated(details.exit_reason)),
    ''
  ] : [];

  return [
    `<b>${labels[payload.event]}</b>`,
    '',
    ...leadLines,
    ...clickLines,
    ...sessionLines,
    '<b>🧭 ВИЗИТ</b>',
    line('Сеанс', payload.visit_id),
    line('Источник', source),
    line('Примерное гео', location || 'Не определено'),
    line('Устройство', [payload.device, payload.screen].filter(Boolean).join(' · ')),
    line('Язык', payload.language),
    line('Страница', payload.page),
    '',
    `<i>${new Date().toLocaleString('ru-RU', { timeZone: 'America/Sao_Paulo' })}</i>`
  ]
    .filter(value => value !== null && value !== undefined)
    .join('\n')
    .slice(0, 4000);
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
    if (payload.event === 'session_summary' && env.NOTIFY_SESSION_SUMMARIES !== 'true') {
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
