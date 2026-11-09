/**
 * SEIS // RETRO — Configuración Principal
 * 6 Amigos reales con sus Webhooks dedicados de Discord para almacenamiento
 */

window.SEIS_CONFIG = {
  appName: "PUCHIPI CLUB",
  appSubtitle: "Diario fotográfico semanal · 6 amigos · 1 turno · 5 fotos al día",
  maxPhotosPerDay: 5,
  weekStartsOn: "Lunes",

  // Webhook central del sistema (para notificar turnos de ruleta semanal)
  systemWebhookUrl: "https://discord.com/api/webhooks/1569145023822438551/_ApH3pMJIWyEJwZW0c0bk3GvfGju9hDKtHwTpyUIw_rbP8CA0vukp108suI-1EDPCSNX",

  // Los 6 amigos reales con sus Webhooks personales de Discord y códigos PIN
  friends: [
    {
      id: "juanuke",
      name: "JuanUke",
      handle: "@juanuke",
      pin: "1111",
      color: "#FF5A36",
      avatar: "J",
      bio: "Cámara en mano y buscando momentos espontáneos.",
      camera: "iPhone · 0.5x Gran Angular",
      webhookUrl: "https://discord.com/api/webhooks/1569123298233684148/NrC_7R9v5SGWf0AE6Fiv3GNONovYSXP7o78toWqA3xoX_p7VJSIGrHv6JDV8iJ5dwPTz"
    },
    {
      id: "camila",
      name: "Camila",
      handle: "@camila",
      pin: "2222",
      color: "#F472B6",
      avatar: "C",
      bio: "Detalles, atardeceres y memorias visuales.",
      camera: "iPhone · Polaroid",
      webhookUrl: "https://discord.com/api/webhooks/1569123675343552685/Que5eKA5sResMkA-m57EpkuBkvUzozljQXVizAwe9rkYmaHsTwivde1YZ7C-F966sh_N"
    },
    {
      id: "sofia",
      name: "Sofia",
      handle: "@sofia",
      pin: "3333",
      color: "#93C5FD",
      avatar: "S",
      bio: "Fotos con luz natural, calles y texturas.",
      camera: "iPhone · 35mm",
      webhookUrl: "https://discord.com/api/webhooks/1569123678392680620/1XIhWeHMMGuXrAx3nqVWk9ZEDeAaueYjlXsUfok-6fcYt0UW5Ctok7aYF5y6YOr6Hf8D"
    },
    {
      id: "camille",
      name: "Camille",
      handle: "@camille",
      pin: "4444",
      color: "#E8B86D",
      avatar: "C",
      bio: "Retratos espontáneos y buena compañía.",
      camera: "iPhone · Retro Instant",
      webhookUrl: "https://discord.com/api/webhooks/1569123682159304825/gZv_YrBUzGfoTKLOVA6NHeGKnpVdlMh4qcLgqure2bP1l7N5lcW4GN8J1PhJlGwETkSA"
    },
    {
      id: "melissa",
      name: "Melissa",
      handle: "@melissa",
      pin: "5555",
      color: "#C4B5FD",
      avatar: "M",
      bio: "Planos abiertos, viajes y risas.",
      camera: "iPhone · Gran Angular",
      webhookUrl: "https://discord.com/api/webhooks/1569123691478917130/PNVDT65vMYtluV4KcpfaDe9bvX42MVdr8HOesRSYFRP2Cnn-Hnsn-oawnRIaN31VATg9"
    },
    {
      id: "ximena",
      name: "Ximena",
      handle: "@ximena",
      pin: "6666",
      color: "#6EE7B7",
      avatar: "X",
      bio: "Capturando el día antes de que termine.",
      camera: "iPhone · Instant 600",
      webhookUrl: "https://discord.com/api/webhooks/1569123692129288203/Wvzy_sI44fL6hl-D4WVAWfhOp9PvFA2b5CsnzHptG3Osk2wCbyRBdhvt26c-iOvejD2B"
    }
  ],

  // Semana inicial limpia para empezar el proyecto real (sin fotos de ejemplo de internet)
  initialWeeks: [
    {
      id: "2026-W45",
      weekNumber: 45,
      title: "Semana 45",
      dateRange: "09/11 — 15/11",
      year: 2026,
      selectedFriendId: "camila",
      rouletteSpunAt: "Lunes · Turno de Camila",
      themeNote: "Primer carrete oficial de los 6",
      isCurrent: true,
      photos: []
    }
  ]
};
