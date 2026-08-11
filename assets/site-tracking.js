(() => {
  const CONFIG_URL = 'page-config.json';
  const CONSENT_KEY = 'tim_analytics_consent';
  const FLYER_VISIT_KEY = 'tim_flyer_visit_notified';
  const allowedEvents = new Set(['form_submit', 'whatsapp_click', 'phone_click', 'flyer_visit', 'session_summary']);

  let config = {};
  let gaReady = false;
  const session = {
    startedAt: Date.now(),
    activeStartedAt: document.visibilityState === 'visible' ? performance.now() : null,
    activeMs: 0,
    maxScroll: 0,
    sections: [],
    actions: [],
    formStarted: false,
    outcome: 'Saiu sem iniciar contato',
    summarySent: false
  };

  const compact = value => String(value || '').trim().slice(0, 500);
  const readStorage = (storage, key) => {
    try { return storage.getItem(key); } catch { return null; }
  };
  const writeStorage = (storage, key, value) => {
    try { storage.setItem(key, value); } catch { /* Storage can be unavailable in strict privacy modes. */ }
  };

  function campaignData() {
    const params = new URLSearchParams(window.location.search);
    const current = {
      source: compact(params.get('utm_source')),
      medium: compact(params.get('utm_medium')),
      campaign: compact(params.get('utm_campaign')),
      content: compact(params.get('utm_content'))
    };

    if (Object.values(current).some(Boolean)) {
      writeStorage(sessionStorage, 'tim_campaign', JSON.stringify(current));
      return current;
    }

    try {
      return JSON.parse(readStorage(sessionStorage, 'tim_campaign')) || current;
    } catch {
      return current;
    }
  }

  function deviceType() {
    if (window.matchMedia('(max-width: 620px)').matches) return 'mobile';
    if (window.matchMedia('(max-width: 980px)').matches) return 'tablet';
    return 'desktop';
  }

  function referrerHost() {
    try { return document.referrer ? new URL(document.referrer).hostname.slice(0, 200) : ''; } catch { return ''; }
  }

  function buildPayload(eventName, details = {}) {
    return {
      event: eventName,
      page: `${window.location.pathname}${window.location.search}`.slice(0, 500),
      referrer: referrerHost(),
      language: compact(navigator.language),
      device: deviceType(),
      campaign: campaignData(),
      details
    };
  }

  function loadGoogleAnalytics(measurementId) {
    if (gaReady || !/^G-[A-Z0-9]+$/i.test(measurementId || '')) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', measurementId, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_flags: 'SameSite=Lax;Secure'
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
    gaReady = true;
  }

  function setConsent(value) {
    writeStorage(localStorage, CONSENT_KEY, value);
    document.getElementById('privacy-choice')?.setAttribute('hidden', '');
    if (value === 'granted') loadGoogleAnalytics(config.ga_measurement_id);
  }

  function setupConsent() {
    const banner = document.getElementById('privacy-choice');
    if (!banner || !config.ga_measurement_id) return;

    const consent = readStorage(localStorage, CONSENT_KEY);
    if (consent === 'granted') {
      loadGoogleAnalytics(config.ga_measurement_id);
      return;
    }
    if (consent === 'denied') return;

    banner.removeAttribute('hidden');
    banner.querySelector('[data-consent="grant"]')?.addEventListener('click', () => setConsent('granted'));
    banner.querySelector('[data-consent="deny"]')?.addEventListener('click', () => setConsent('denied'));
  }

  function analyticsEvent(eventName, details = {}) {
    if (!gaReady || typeof window.gtag !== 'function') return;
    window.gtag('event', eventName, details);
  }

  function recordAction(label, outcome = '') {
    const value = compact(label);
    if (value && session.actions.at(-1) !== value && session.actions.length < 14) session.actions.push(value);
    if (outcome) session.outcome = compact(outcome);
  }

  async function notify(eventName, details = {}) {
    if (!allowedEvents.has(eventName) || !config.events_endpoint) return { skipped: true };

    try {
      const response = await fetch(config.events_endpoint, {
        method: 'POST',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(eventName, details))
      });
      return { ok: response.ok };
    } catch {
      return { ok: false };
    }
  }

  function stopActiveTimer() {
    if (session.activeStartedAt === null) return;
    session.activeMs += performance.now() - session.activeStartedAt;
    session.activeStartedAt = null;
  }

  function summaryDetails(reason) {
    stopActiveTimer();
    const consent = readStorage(localStorage, CONSENT_KEY);
    return {
      duration_seconds: Math.max(1, Math.round((Date.now() - session.startedAt) / 1000)),
      active_seconds: Math.max(0, Math.round(session.activeMs / 1000)),
      max_scroll: `${session.maxScroll}%`,
      sections: session.sections.join(' → '),
      actions: session.actions.join(' → '),
      form_started: session.formStarted ? 'Sim' : 'Não',
      result: session.outcome,
      analytics_consent: consent === 'granted' ? 'Aceitou' : consent === 'denied' ? 'Recusou' : 'Não escolheu',
      exit_reason: reason
    };
  }

  function sendSessionSummary(reason) {
    if (session.summarySent || !config.notify_session_summaries || !config.events_endpoint) return;
    session.summarySent = true;
    const body = JSON.stringify(buildPayload('session_summary', summaryDetails(reason)));

    try {
      if (navigator.sendBeacon) {
        const accepted = navigator.sendBeacon(config.events_endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }));
        if (accepted) return;
      }
    } catch { /* Fall through to keepalive fetch. */ }

    void fetch(config.events_endpoint, {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body
    }).catch(() => null);
  }

  function trackContactLinks() {
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href') || '';
      const label = compact(link.textContent);
      if (/^https:\/\/(wa\.me|api\.whatsapp\.com)/i.test(href)) {
        recordAction(`WhatsApp: ${label}`, 'Abriu o WhatsApp');
        analyticsEvent('whatsapp_click', { link_location: label });
        void notify('whatsapp_click', { link_location: label });
      } else if (href.startsWith('tel:')) {
        recordAction(`Ligação: ${label}`, 'Iniciou uma ligação');
        analyticsEvent('phone_click', { link_location: label });
        void notify('phone_click', { link_location: label });
      } else if (href.startsWith('#')) {
        recordAction(`Navegação: ${label}`);
      }
    });
  }

  function setupSessionTracking() {
    const updateScroll = () => {
      const height = Math.max(document.documentElement.scrollHeight, 1);
      const depth = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / height) * 100));
      session.maxScroll = Math.max(session.maxScroll, depth);
    };
    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const name = compact(entry.target.dataset.trackSection);
          if (name && !session.sections.includes(name)) session.sections.push(name);
        });
      }, { threshold: 0.18 });
      document.querySelectorAll('[data-track-section]').forEach(section => observer.observe(section));
    }

    document.getElementById('pedido')?.addEventListener('input', () => {
      if (session.formStarted) return;
      session.formStarted = true;
      recordAction('Começou a preencher o formulário');
    });
    document.querySelectorAll('.faq details').forEach(item => {
      item.addEventListener('toggle', () => {
        if (item.open) recordAction(`Dúvida: ${compact(item.querySelector('summary')?.textContent)}`);
      });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        stopActiveTimer();
      } else if (session.activeStartedAt === null) {
        session.activeStartedAt = performance.now();
      }
    });
    window.addEventListener('pagehide', () => sendSessionSummary('Saiu ou fechou a página'), { once: true });
    window.addEventListener('beforeunload', () => sendSessionSummary('Saiu ou atualizou a página'), { once: true });
  }

  async function notifyLead(lead) {
    recordAction('Enviou o formulário', 'Enviou a solicitação e abriu o WhatsApp');
    analyticsEvent('generate_lead', {
      service_type: compact(lead.tipo),
      city: compact(lead.cidade),
      urgency: compact(lead.urgencia)
    });
    return notify('form_submit', lead);
  }

  async function init() {
    try {
      const response = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (response.ok) config = await response.json();
    } catch {
      config = {};
    }

    setupConsent();
    setupSessionTracking();
    trackContactLinks();

    const campaign = campaignData();
    if (config.notify_flyer_visits && campaign.source && !readStorage(sessionStorage, FLYER_VISIT_KEY)) {
      writeStorage(sessionStorage, FLYER_VISIT_KEY, '1');
      void notify('flyer_visit');
    }
  }

  window.TimTracking = {
    ready: init(),
    notifyLead,
    recordAction
  };
})();
