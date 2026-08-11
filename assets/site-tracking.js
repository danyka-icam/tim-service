(() => {
  const CONFIG_URL = 'page-config.json';
  const CONSENT_KEY = 'tim_analytics_consent';
  const FLYER_VISIT_KEY = 'tim_flyer_visit_notified';
  const allowedEvents = new Set(['form_submit', 'whatsapp_click', 'phone_click', 'flyer_visit']);

  let config = {};
  let gaReady = false;

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

  async function notify(eventName, details = {}) {
    if (!allowedEvents.has(eventName) || !config.events_endpoint) return { skipped: true };

    const payload = {
      event: eventName,
      page: `${window.location.pathname}${window.location.search}`.slice(0, 500),
      referrer: referrerHost(),
      language: compact(navigator.language),
      device: deviceType(),
      campaign: campaignData(),
      details
    };

    try {
      const response = await fetch(config.events_endpoint, {
        method: 'POST',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return { ok: response.ok };
    } catch {
      return { ok: false };
    }
  }

  function trackContactLinks() {
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href') || '';
      if (/^https:\/\/(wa\.me|api\.whatsapp\.com)/i.test(href)) {
        analyticsEvent('whatsapp_click', { link_location: compact(link.textContent) });
        void notify('whatsapp_click', { link_location: compact(link.textContent) });
      } else if (href.startsWith('tel:')) {
        analyticsEvent('phone_click', { link_location: compact(link.textContent) });
        void notify('phone_click', { link_location: compact(link.textContent) });
      }
    });
  }

  async function notifyLead(lead) {
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
    trackContactLinks();

    const campaign = campaignData();
    if (config.notify_flyer_visits && campaign.source && !readStorage(sessionStorage, FLYER_VISIT_KEY)) {
      writeStorage(sessionStorage, FLYER_VISIT_KEY, '1');
      void notify('flyer_visit');
    }
  }

  window.TimTracking = {
    ready: init(),
    notifyLead
  };
})();
