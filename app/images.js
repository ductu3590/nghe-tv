(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NgheImages = factory();
}(this, function () {
  'use strict';
  function trim(entries, maxChars) {
    var keys = Object.keys(entries).sort(function (a, b) { return entries[b].at - entries[a].at; });
    var kept = {}, i;
    for (i = 0; i < keys.length; i += 1) {
      kept[keys[i]] = entries[keys[i]];
      if (JSON.stringify(kept).length > maxChars) delete kept[keys[i]];
    }
    return kept;
  }
  return {trim: trim};
}));
