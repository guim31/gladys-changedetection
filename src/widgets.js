// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `latest_changes`.
//
// The use case: a glance at the wall tablet tells what changed on the pages
// you watch, and since when. So the widget shows the number of unviewed
// changes and of watches in error, then the latest changes, newest first:
// title, what changed, the date, a "New" or "Error" badge; a tap opens the
// detail (the excerpt, the address, a link to the page). Two buttons: check
// every page now, and mark everything as viewed.
//
// Every watch by default, or the ones chosen in the widget settings (devices
// added to Gladys). The figures are sent as values, not bound to device
// features: the widget works before any device is added.
//
// Budget (8 components, 6 tiles, 2 texts, 1 focal, 4 buttons): two tiles, one
// card-list of 8 rows at most, one text when changedetection.io does not
// answer, two buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { isServerId, parseWatchId, watchName } from './devices.js';
import { shorten } from './cd/snapshots.js';
import { pick } from './texts.js';

// Action keys of the buttons: permanent once published.
export const ACTIONS = Object.freeze({
  CHECK_ALL: 'check_all',
  MARK_ALL_VIEWED: 'mark_all_viewed',
});

export const MAX_ROWS = 8;

export const TEXT = {
  pick: {
    en: 'Enter the address of changedetection.io and its API key in the configuration of the integration.',
    fr: "Saisissez l'adresse de changedetection.io et sa clé d'API dans la configuration de l'intégration.",
    de: 'Gib die Adresse von changedetection.io und seinen API-Schlüssel in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de changedetection.io y su clave API en la configuración de la integración.',
  },
  empty: {
    en: 'No change detected yet.',
    fr: 'Aucun changement détecté pour le moment.',
    de: 'Noch keine Änderung erkannt.',
    es: 'Todavía no se ha detectado ningún cambio.',
  },
  unviewed: { en: 'Unviewed', fr: 'Non vus', de: 'Ungesehen', es: 'No vistos' },
  errors: { en: 'In error', fr: 'En erreur', de: 'Fehlerhaft', es: 'Con error' },
  new: { en: 'New', fr: 'Nouveau', de: 'Neu', es: 'Nuevo' },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  open: { en: 'Open the page', fr: 'Ouvrir la page', de: 'Seite öffnen', es: 'Abrir la página' },
  checkAll: { en: 'Check now', fr: 'Vérifier', de: 'Jetzt prüfen', es: 'Comprobar' },
  markAll: { en: 'Mark as viewed', fr: 'Marquer vu', de: 'Als gesehen', es: 'Marcar visto' },
  checking: {
    en: 'Checking the pages, the result follows in a few seconds.',
    fr: 'Vérification des pages, le résultat suit dans quelques secondes.',
    de: 'Die Seiten werden geprüft, das Ergebnis folgt in wenigen Sekunden.',
    es: 'Comprobando las páginas, el resultado llegará en unos segundos.',
  },
  marked: {
    en: 'Every change is marked as viewed.',
    fr: 'Tous les changements sont marqués comme vus.',
    de: 'Alle Änderungen sind als gesehen markiert.',
    es: 'Todos los cambios están marcados como vistos.',
  },
};

const t = (text, language) => pick(text, language);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** The watches the widget shows: the chosen devices, or every watch. */
export function selectWatches(hub, settings) {
  const chosen = [settings?.watches ?? []].flat().filter((id) => typeof id === 'string' && id);
  // The changedetection.io device stands for every watch, as in the scene actions.
  if (chosen.length === 0 || chosen.some((id) => isServerId(hub.gladys, id))) {
    return [...hub.watches.values()];
  }
  const uuids = new Set(chosen.map((id) => parseWatchId(hub.gladys, id)).filter(Boolean));
  return [...hub.watches.values()].filter((watch) => uuids.has(watch.uuid));
}

/** One card per watch that changed (or is in error), newest first. */
export function cards(watches, language) {
  return watches
    .filter((watch) => watch.lastChanged > 0 || watch.error)
    .sort((a, b) => b.lastChanged - a.lastChanged || watchName(a).localeCompare(watchName(b)))
    .slice(0, MAX_ROWS)
    .map((watch) => {
      const item = { title: shorten(watchName(watch), 60) };
      const summary = watch.error ?? watch.excerpt;
      if (summary) {
        item.subtitle = shorten(summary, 60);
      }
      if (watch.lastChanged > 0) {
        item.date = new Date(watch.lastChanged * 1000).toISOString();
      }
      if (watch.error) {
        item.badge = { text: t(TEXT.error, language), color: WIDGET_COLORS.DANGER };
      } else if (watch.unviewed) {
        item.badge = { text: t(TEXT.new, language), color: WIDGET_COLORS.INFO };
      }
      const description = [watch.error, watch.excerpt, watch.url].filter(Boolean).join('\n\n');
      if (description) {
        item.description = shorten(description, 2000);
      }
      if (/^https:\/\//i.test(watch.link)) {
        item.links = [{ url: watch.link, label: t(TEXT.open, language) }];
      }
      return item;
    });
}

async function get(hub, { settings, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.pick, language);
  }
  const watches = selectWatches(hub, settings);
  const components = [];
  const unviewed = watches.filter((watch) => watch.unviewed).length;
  const errors = watches.filter((watch) => watch.error).length;
  if (hub.readAt > 0) {
    components.push(
      {
        type: 'value',
        value: unviewed,
        label: t(TEXT.unviewed, language),
        icon: 'bell',
        color: unviewed > 0 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
      },
      {
        type: 'value',
        value: errors,
        label: t(TEXT.errors, language),
        icon: 'alert-triangle',
        color: errors > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
      },
    );
  }
  const errorText = hub.errorText(language);
  if (errorText) {
    components.push({ type: 'text', variant: 'body', text: errorText });
  }
  const items = cards(watches, language);
  if (items.length > 0) {
    components.push({ type: 'card-list', display: 'list', items });
  } else if (!errorText) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.empty, language) });
  }
  components.push({
    type: 'button',
    label: t(TEXT.checkAll, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.CHECK_ALL },
  });
  if (unviewed > 0) {
    components.push({
      type: 'button',
      label: t(TEXT.markAll, language),
      icon: 'check-circle',
      style: 'secondary',
      action: { key: ACTIONS.MARK_ALL_VIEWED, confirm: true },
    });
  }
  return { ttl_seconds: errorText ? 60 : 300, components };
}

/** The ids of the chosen watches, or [null] for every watch. */
function targets(hub, settings) {
  const chosen = [settings?.watches ?? []].flat().filter((id) => typeof id === 'string' && id);
  return chosen.length === 0 || chosen.some((id) => isServerId(hub.gladys, id)) ? [null] : chosen;
}

async function action(hub, { actionKey, settings }) {
  if (actionKey === ACTIONS.CHECK_ALL) {
    for (const id of targets(hub, settings)) {
      await hub.recheck(id);
    }
    return { message: TEXT.checking };
  }
  if (actionKey === ACTIONS.MARK_ALL_VIEWED) {
    for (const id of targets(hub, settings)) {
      await hub.markViewed(id);
    }
    return { message: TEXT.marked };
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
