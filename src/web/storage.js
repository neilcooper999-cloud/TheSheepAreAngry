// Saved settings. On the web this is localStorage; a native port swaps in its own preferences store.
(function (Sheep) {
  'use strict';
  function get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback; // private mode, blocked storage or a bad value: use the default
    }
  }
  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // storage can be unavailable; settings then last for this visit only
    }
  }
  Sheep.storage = { get, set };
})((globalThis.Sheep = globalThis.Sheep || {}));
