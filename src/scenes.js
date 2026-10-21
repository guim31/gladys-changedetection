// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// - `check_now`: changedetection.io checks a page again now (or every page),
//   say before leaving for the shop, or every morning on a page that matters;
//   the result is read 20 seconds later and fires the usual scene events.
// - `mark_viewed`: the change(s) no longer count as new, for instance once a
//   scene has read them out or sent them by message.
// An empty device field, or the changedetection.io device, means every watch.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async check_now(hub, { fields = {} }) {
    return { count: await hub.recheck(fields.device) };
  },

  async mark_viewed(hub, { fields = {} }) {
    return { count: await hub.markViewed(fields.device) };
  },
};
