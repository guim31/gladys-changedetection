// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors. Four languages, the four of the Gladys interface; German says "du",
// Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './cd/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noInstance: {
    en: 'Enter the address of changedetection.io and its API key in the configuration.',
    fr: "Saisissez l'adresse de changedetection.io et sa clé d'API dans la configuration.",
    de: 'Gib die Adresse von changedetection.io und seinen API-Schlüssel in der Konfiguration ein.',
    es: 'Introduzca la dirección de changedetection.io y su clave API en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:5000',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:5000',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:5000',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:5000',
  },
};

// One short explanation per error kind (src/cd/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'changedetection.io does not answer',
    fr: 'changedetection.io ne répond pas',
    de: 'changedetection.io antwortet nicht',
    es: 'changedetection.io no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused: copy it again from Settings → API',
    fr: "clé d'API refusée : recopiez-la depuis Settings → API",
    de: 'API-Schlüssel abgelehnt: Kopiere ihn erneut aus Settings → API',
    es: 'clave API rechazada: cópiela de nuevo desde Settings → API',
  },
  [ERROR_KINDS.KEY_MISSING]: {
    en: 'an API key is needed: copy it from Settings → API',
    fr: "une clé d'API est nécessaire : copiez-la depuis Settings → API",
    de: 'ein API-Schlüssel ist nötig: Kopiere ihn aus Settings → API',
    es: 'se necesita una clave API: cópiela desde Settings → API',
  },
  [ERROR_KINDS.NOT_CD]: {
    en: 'no changedetection.io API at this address',
    fr: 'aucune API changedetection.io à cette adresse',
    de: 'keine changedetection.io-API unter dieser Adresse',
    es: 'no hay ninguna API de changedetection.io en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'OK',
    watches: (count) => `${count} watch(es)`,
    errors: (count) => `${count} in error`,
    unviewed: (count) => `${count} unviewed change(s)`,
  },
  fr: {
    ok: 'OK',
    watches: (count) => `${count} surveillance(s)`,
    errors: (count) => `${count} en erreur`,
    unviewed: (count) => `${count} changement(s) non vu(s)`,
  },
  de: {
    ok: 'OK',
    watches: (count) => `${count} Überwachung(en)`,
    errors: (count) => `${count} fehlerhaft`,
    unviewed: (count) => `${count} ungesehene Änderung(en)`,
  },
  es: {
    ok: 'OK',
    watches: (count) => `${count} vigilancia(s)`,
    errors: (count) => `${count} con error`,
    unviewed: (count) => `${count} cambio(s) no visto(s)`,
  },
};

// Errors of the scene actions (shown in Gladys).
export const ACTION_TEXT = {
  noInstance: {
    en: 'changedetection.io is not configured.',
    fr: "changedetection.io n'est pas configuré.",
    de: 'changedetection.io ist nicht konfiguriert.',
    es: 'changedetection.io no está configurado.',
  },
  unknownWatch: {
    en: 'This device is not a changedetection.io watch.',
    fr: "Cet appareil n'est pas une surveillance changedetection.io.",
    de: 'Dieses Gerät ist keine Überwachung von changedetection.io.',
    es: 'Este dispositivo no es una vigilancia de changedetection.io.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
