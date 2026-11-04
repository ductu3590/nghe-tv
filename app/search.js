(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NgheSearch = factory();
}(this, function () {
  'use strict';
  function fold(value) {
    var text = String(value || '').toLowerCase();
    if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return text.replace(/đ/g, 'd');
  }
  function matches(text, query) {
    var needle = fold(query).replace(/^\s+|\s+$/g, '');
    return !!needle && fold(text).indexOf(needle) !== -1;
  }
  return {fold: fold, matches: matches};
}));
