# Página de pedido — Tim

Página estática, mobile-first, pronta para publicar.

## URL recomendada
https://danyka-icam.github.io/tim-service/

## Como funciona
1. O cliente abre a página pelo QR.
2. Preenche endereço, problema, urgência e horário.
3. A página monta uma mensagem organizada e, quando o endpoint está configurado, avisa Tim pelo Telegram.
4. Ao tocar em “Enviar pedido para Tim”, abre o WhatsApp com os dados preenchidos.
5. O cliente só precisa tocar em Enviar no WhatsApp.

O botão “Falar direto no WhatsApp” continua disponível para quem prefere contato direto.

## Publicação
O site é publicado pelo GitHub Pages a partir da branch `main`.

URL pública:
https://danyka-icam.github.io/tim-service/

## Analytics e notificações

As integrações são configuradas em `page-config.json`:

- `ga_measurement_id`: ID do fluxo Web do GA4, no formato `G-...`.
- `events_endpoint`: URL pública do Cloudflare Worker terminada em `/events`.
- `notify_flyer_visits`: envia ao Telegram a primeira visita da sessão quando a URL contém parâmetros UTM.
- `notify_session_summaries`: envia ao sair da página um resumo com duração, tempo ativo, rolagem, seções vistas, ações e resultado do contato.

O Google Analytics só é carregado após consentimento. As notificações operacionais do Worker funcionam independentemente dessa escolha e não incluem o conteúdo do formulário antes do envio.

O código seguro do endpoint está em `worker/`. O token do bot e o chat ID são secrets do Worker e nunca devem ser enviados ao navegador ou versionados no Git.

Para identificar as visitas dos folhetos, use:

`https://danyka-icam.github.io/tim-service/?utm_source=flyer&utm_medium=qr&utm_campaign=local_bc`

## WhatsApp
(13) 99653-2915
https://wa.me/5513996532915
