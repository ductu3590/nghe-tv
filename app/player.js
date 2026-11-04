// Pure helpers for playback state: time labels, seeking, auto-next, sleep timer, resume and recents.
// ES5 only (Tizen 6.5). Everything here is stored on the TV itself; nothing leaves it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NghePlayer = factory();
}(this, function () {
  'use strict';
  var SLEEP_STEPS = [0, 15, 30, 60];
  var PROGRESS_MAX = 200, RECENT_MAX = 20, MIN_RESUME = 15, END_MARGIN = 30;

  function pad(value) { return (value < 10 ? '0' : '') + value; }
  function formatTime(seconds) {
    var total = typeof seconds === 'number' && isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    var hours = Math.floor(total / 3600), minutes = Math.floor(total / 60) % 60, secs = total % 60;
    return hours ? hours + ':' + pad(minutes) + ':' + pad(secs) : minutes + ':' + pad(secs);
  }
  function seek(current, delta, duration) {
    var now = typeof current === 'number' && isFinite(current) ? current : 0;
    var end = typeof duration === 'number' && isFinite(duration) && duration > 0 ? duration : Infinity;
    return Math.max(0, Math.min(end === Infinity ? now + delta : end - 1, now + delta));
  }
  // Which entry plays after `index` ends. 'newer' steps toward the top of a newest-first feed
  // (serialised stories), 'list' steps down a chapter list, anything else stops.
  function nextIndex(length, index, mode) {
    if (!(length > 0) || index < 0 || index >= length) return -1;
    if (mode === 'newer') return index > 0 ? index - 1 : -1;
    if (mode === 'list') return index + 1 < length ? index + 1 : -1;
    return -1;
  }
  function nextSleep(minutes) {
    var at = SLEEP_STEPS.indexOf(minutes);
    return SLEEP_STEPS[(at + 1) % SLEEP_STEPS.length];
  }
  function sleepLabel(minutes) { return minutes ? 'Tự dừng sau ' + minutes + ' phút' : 'Hẹn giờ: tắt'; }

  // Progress per audio URL: {t: seconds heard, d: duration, at: when}. Oldest entries go first.
  function saveProgress(map, url, time, duration, now) {
    var next = {}, keys = [];
    for (var key in map) if (Object.prototype.hasOwnProperty.call(map, key) && map[key] && typeof map[key].at === 'number') keys.push(key);
    keys.forEach(function (name) { next[name] = map[name]; });
    if (typeof url === 'string' && url) next[url] = {t: Math.floor(time || 0), d: Math.floor(duration || 0), at: now};
    keys = Object.keys(next).sort(function (a, b) { return next[b].at - next[a].at; });
    keys.slice(PROGRESS_MAX).forEach(function (name) { delete next[name]; });
    return next;
  }
  function resumeAt(map, url) {
    var entry = map && Object.prototype.hasOwnProperty.call(map, url) ? map[url] : null;
    if (!entry || !(entry.t >= MIN_RESUME)) return 0;
    if (entry.d > 0 && entry.t >= entry.d - END_MARGIN) return 0; // finished: start again
    return entry.t;
  }
  function percent(map, url) {
    var entry = map && Object.prototype.hasOwnProperty.call(map, url) ? map[url] : null;
    if (!entry || !(entry.d > 0)) return 0;
    return Math.max(0, Math.min(100, Math.round(entry.t / entry.d * 100)));
  }
  // "Đang nghe": newest first, one entry per audio URL.
  function addRecent(list, entry) {
    var out = [entry];
    (Array.isArray(list) ? list : []).forEach(function (item) {
      if (item && item.url && item.url !== entry.url && out.length < RECENT_MAX) out.push(item);
    });
    return out;
  }
  function isFresh(entry, now, ttlMs) {
    return !!entry && typeof entry.at === 'number' && now - entry.at >= 0 && now - entry.at < ttlMs;
  }
  // "4/11 · 14:48 · đã nghe 40%"
  function subtitle(item, progress, now) {
    var parts = [];
    if (item.date) {
      var date = new Date(item.date), today = new Date(now);
      parts.push(date.toDateString() === today.toDateString() ? 'Hôm nay' : date.getDate() + '/' + (date.getMonth() + 1));
    }
    if (item.duration) parts.push(formatTime(item.duration));
    if (progress > 0 && progress < 97) parts.push('đã nghe ' + progress + '%');
    else if (progress >= 97) parts.push('đã nghe xong');
    if (item.folder) parts.push(item.tracks ? item.tracks.length + ' phần' : 'Mở để xem các phần');
    return parts.join(' · ');
  }
  return {SLEEP_STEPS: SLEEP_STEPS, formatTime: formatTime, seek: seek, nextIndex: nextIndex, nextSleep: nextSleep,
    sleepLabel: sleepLabel, saveProgress: saveProgress, resumeAt: resumeAt, percent: percent, addRecent: addRecent,
    isFresh: isFresh, subtitle: subtitle};
}));
