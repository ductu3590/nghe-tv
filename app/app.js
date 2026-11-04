// Nghe: pick a news bulletin, podcast or audiobook, then listen over a quiet full-screen picture.
// Reads every source directly from the TV; keeps only small caches and progress in localStorage.
// Never registers Home, Power or brand keys; only media keys the TV reports as supported.
(function () {
  'use strict';
  var feeds = window.NgheFeeds, player = window.NghePlayer, search = window.NgheSearch, library = window.NgheLibrary, organize = window.NgheOrganize, tv = window.tizen;
  var $ = function (id) { return document.getElementById(id); };
  var REMOTE_SOURCES = 'https://raw.githubusercontent.com/ductu3590/nghe-tv/main/app/sources.json';
  var PREVIEW = !tv && /^http/.test(location.protocol); // desktop preview: go through the loopback dev proxy
  var CACHE_KEY = 'nghe-cache-v1', PROGRESS_KEY = 'nghe-progress', RECENT_KEY = 'nghe-recent';
  var CACHE_TTL = 20 * 60 * 1000, FEED_ITEMS = 30, CALM_MS = 6000, SEEK = 15;
  var MEDIA_KEYS = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward', 'MediaTrackPrevious', 'MediaTrackNext'];

  var audio = $('audio'), tabsEl = $('tabs'), sourcesEl = $('sources'), listEl = $('list');
  var state = {tabs: [], tab: 0, source: 0, list: [], stack: [], listTitle: '', view: 'browse', zone: 'sources'};
  var now = {entry: null, list: [], index: -1, source: null};
  var searchData = {}, searchLoading = false, searchTimer = null, lastBrowseId = null;
  var keyNames = {}, memory = {}, toastTimer = null, calmTimer = null, sleepTimer = null, sleepMinutes = 0, blackTimer = null, saveAt = 0, loadToken = 0;

  // ---- Small storage helpers: every access may throw (private mode, quota) and must never break playback ----
  function readJson(key, fallback) {
    try { var value = JSON.parse(localStorage.getItem(key)); return value === null ? fallback : value; } catch (error) { return fallback; }
  }
  function writeJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* keep going */ } }
  var progress = readJson(PROGRESS_KEY, {}), recent = readJson(RECENT_KEY, []);
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) progress = {};
  if (!Array.isArray(recent)) recent = [];
  var favoriteSources = library.sourceIds(readJson('nghe-favorite-sources', []));
  var favoriteItems = library.items(readJson('nghe-favorite-items', []), false);
  var queue = library.items(readJson('nghe-queue', []), true);
  var playedMarks = readJson('nghe-played', {}), sourcePrefs = readJson('nghe-source-order', {});
  if (!sourcePrefs || typeof sourcePrefs !== 'object' || Array.isArray(sourcePrefs)) sourcePrefs = {};
  var actionReturn = null;


  function toast(text) {
    var node = $('toast'); node.textContent = text; node.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { node.hidden = true; }, 4500);
  }
  function cssUrl(url) { return 'url("' + viaProxy(url).replace(/"/g, '%22') + '")'; }
  function viaProxy(url) { return PREVIEW && /^https:\/\//.test(url) ? '/proxy?url=' + encodeURIComponent(url) : url; }

  // ---- Network: XHR (old engines), with an early stop once a big feed has delivered enough items ----
  function load(url, options, done) {
    var xhr = new XMLHttpRequest(), finished = false;
    var timer = setTimeout(function () { finish(new Error('timeout')); try { xhr.abort(); } catch (error) { /* gone */ } }, options.timeout || 25000);
    function finish(error, text) { if (finished) return; finished = true; clearTimeout(timer); done(error, text); }
    xhr.open('GET', viaProxy(url), true);
    if (options.until) {
      xhr.onprogress = function () {
        var text = xhr.responseText || '', cut = options.until(text);
        if (cut > 0) { try { xhr.abort(); } catch (error) { /* done */ } finish(null, text.slice(0, cut)); }
      };
    }
    xhr.onload = function () {
      if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText)) finish(null, xhr.responseText);
      else finish(new Error('HTTP ' + xhr.status));
    };
    xhr.onerror = function () { finish(new Error('network')); };
    xhr.send();
  }
  function cached(key) {
    if (memory[key]) return memory[key];
    var all = readJson(CACHE_KEY, {}), entry = all && all[key];
    return entry && entry.items ? (memory[key] = entry) : null;
  }
  function remember(key, value) {
    value.at = Date.now(); memory[key] = value;
    var all = readJson(CACHE_KEY, {}), keys;
    if (!all || typeof all !== 'object') all = {};
    all[key] = value;
    keys = Object.keys(all).sort(function (a, b) { return (all[b].at || 0) - (all[a].at || 0); });
    keys.slice(40).forEach(function (name) { delete all[name]; });
    writeJson(CACHE_KEY, all);
  }
  // Loads a source (or one book of it) into {title, image, items}. Book sites are personal-use adapters.
  function loadSource(source, folder, done) {
    var key = folder ? 'f:' + (folder.url || folder.id) : 's:' + source.id, hit = cached(key);
    if (hit) { var stale = !player.isFresh(hit, Date.now(), CACHE_TTL); done(null, hit, stale); if (!stale) return; }
    function keep(error, value) { if (!error) remember(key, value); done(hit && error ? null : error, hit && error ? hit : value, false); }
    if (folder && folder.tracks) { keep(null, {title: folder.title, image: folder.image, items: folder.tracks}); return; }
    if (source.type === 'rss') {
      load(source.url, {until: function (text) { return feeds.enoughItems(text, FEED_ITEMS); }}, function (error, text) {
        if (error) { keep(error); return; }
        var feed = feeds.parseRss(text, FEED_ITEMS);
        keep(feed.items.length ? null : new Error('empty'), feed);
      });
    } else if (source.type === 'audioaz') {
      load(folder ? folder.url : source.url, {}, function (error, html) {
        if (error) { keep(error); return; }
        var items = folder ? feeds.audioazTracks(html) : feeds.audioazBooks(html);
        keep(items.length ? null : new Error('empty'), {title: folder ? folder.title : source.title, image: folder ? folder.image : '', items: items});
      });
    } else if (source.type === 'wordpress') {
      load(source.url, {}, function (error, text) {
        if (error) { keep(error); return; }
        var items = feeds.wordpressBooks(text, 50);
        keep(items.length ? null : new Error('empty'), {title: source.title, image: '', items: items});
      });
    } else keep(new Error('unknown source type'));
  }

  // ---- Sources list: bundled copy first (instant, works offline), then the GitHub copy if it is valid ----
  function validTabs(value) {
    if (!value || !Array.isArray(value.tabs)) return null;
    var tabs = value.tabs.filter(function (tab) {
      return tab && typeof tab.title === 'string' && Array.isArray(tab.sources) && tab.sources.some(function (source) {
        return source && typeof source.id === 'string' && /^https:\/\//.test(source.url || '') && /^(rss|audioaz|wordpress)$/.test(source.type || '');
      });
    });
    return tabs.length ? tabs : null;
  }
  function withRecent(tabs) {
    var ordered = tabs.map(function (tab) { return {id: tab.id, title: tab.title, sources: organize.orderSources(tab.sources, sourcePrefs[tab.id])}; });
    var all = [{id: 'favorites', title: 'Yêu thích', favorites: true, sources: []}, {id: 'queue', title: 'Nghe tiếp', queue: true, sources: []}].concat(ordered, [{id: 'search', title: 'Tìm', search: true, sources: []}]);
    if (!recent.length) return all;
    return [{id: 'recent', title: 'Đang nghe', recent: true, sources: []}].concat(all);
  }
  // The first play adds "Đang nghe" in front without rebuilding the list the user is in.
  function ensureRecentTab() {
    if (!state.tabs.length || state.tabs[0].recent) return;
    state.tabs.unshift({id: 'recent', title: 'Đang nghe', recent: true, sources: []});
    state.tab += 1;
    renderTabs();
  }
  function setTabs(tabs) {
    var currentId = state.tabs[state.tab] && state.tabs[state.tab].id;
    state.tabs = withRecent(tabs);
    state.tab = recent.length ? 0 : 2;
    state.tabs.forEach(function (tab, index) { if (tab.id === currentId) state.tab = index; });
    renderTabs(); openTab(state.tab, false);
  }
  function loadSources() {
    load('sources.json', {timeout: 5000}, function (error, text) {
      var local = null;
      try { local = validTabs(JSON.parse(text)); } catch (problem) { local = null; }
      if (local) { state.baseTabs = local; setTabs(local); }
      if (PREVIEW) return; // the preview edits the bundled file; GitHub would hide local changes
      load(REMOTE_SOURCES + '?t=' + Math.floor(Date.now() / 600000), {timeout: 8000}, function (remoteError, remoteText) {
        var remote = null;
        try { remote = remoteError ? null : validTabs(JSON.parse(remoteText)); } catch (problem) { remote = null; }
        if (remote && JSON.stringify(remote) !== JSON.stringify(state.baseTabs)) { state.baseTabs = remote; setTabs(remote); }
        if (!remote && !local) toast('Không tải được danh sách nguồn.');
      });
    });
  }

  // ---- Browse rendering ----
  function el(tagName, className, text) {
    var node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function renderTabs() {
    tabsEl.textContent = '';
    state.tabs.forEach(function (tab, index) {
      if (tab.search) return;
      var button = el('button', 'tab' + (index === state.tab ? ' on' : ''), tab.title);
      button.addEventListener('focus', function () { if (state.tab !== index) openTab(index, true); });
      tabsEl.appendChild(button);
    });
  }
  function monogram(title) {
    var words = title.replace(/[^\wÀ-ỹ ]/g, ' ').split(/\s+/).filter(Boolean);
    return (words[0] ? words[0].charAt(0) : '') + (words[1] ? words[1].charAt(0) : '');
  }
  function sourceCard(source, index) {
    var button = el('button', 'source'), art = el('span', 'art tone-' + (index % 5)), name = el('span', 'name', source.title);
    art.appendChild(el('span', 'mono', monogram(source.title.split('·').pop())));
    button.appendChild(art); button.appendChild(name);
    var hit = cached('s:' + source.id);
    if (hit && hit.image) setArt(button, hit.image);
    button.addEventListener('focus', function () { state.zone = 'sources'; if (state.favoriteLanding || state.source !== index || !state.list.length) selectSource(index); scheduleImages(); });
    button.addEventListener('click', function () { sourceActions(source); });
    return button;
  }
  function setArt(button, image) {
    var art = button.querySelector('.art');
    if (!image || !art) return;
    art.setAttribute('data-image', image);
    scheduleImages();
  }
  // Cache only small JPEG thumbnails; the original stays on the source's server.
  var imageCache = readJson('nghe-thumbs-v1', {}), imageReady = {}, imagePending = {}, imageQueue = [], imageActive = 0, imageTimer, imagePersistTimer, firstImageMarked = false;
  if (!imageCache || typeof imageCache !== 'object') imageCache = {};
  function visibleImage(node) {
    var box = node.getBoundingClientRect(), parent = node.parentNode;
    while (parent && parent !== document.body) {
      if (parent === listEl || parent === sourcesEl) {
        var clip = parent.getBoundingClientRect();
        if (box.bottom <= clip.top || box.top >= clip.bottom || box.right <= clip.left || box.left >= clip.right) return false;
      }
      parent = parent.parentNode;
    }
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth;
  }
  function applyImage(node, url) {
    node.style.backgroundImage = cssUrl(url);
    if (!firstImageMarked && url.indexOf('data:image/') === 0) {
      firstImageMarked = true;
      if (window.performance && window.performance.mark) window.performance.mark('nghe-first-cached-image');
    }
    if (node.parentNode && node.parentNode.classList && node.classList.contains('art')) node.parentNode.classList.add('has-art');
  }
  function paintImages(url, value) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-image]'), function (node) {
      if (node.getAttribute('data-image') === url && visibleImage(node)) applyImage(node, value);
    });
  }
  function imageStillVisible(url) {
    return Array.prototype.some.call(document.querySelectorAll('[data-image]'), function (node) { return node.getAttribute('data-image') === url && visibleImage(node); });
  }
  function runImages() {
    while (imageActive < 3 && imageQueue.length) {
      (function (url) {
        if (!imageStillVisible(url)) { delete imagePending[url]; return; }
        imageActive += 1;
        var img = new Image(), finished = false, timer;
        function end(ok) {
          if (finished) return; finished = true; clearTimeout(timer); imageActive -= 1; delete imagePending[url];
          if (ok) {
            var value = url;
            try {
              var canvas = document.createElement('canvas'), scale = Math.min(1, 240 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
              canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
              canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
              canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
              var encoded = canvas.toDataURL('image/jpeg', 0.72);
              if (encoded.indexOf('data:image/jpeg') === 0) {
                value = encoded; imageCache[url] = {at: Date.now(), data: encoded};
                imageCache = window.NgheImages.trim(imageCache, 750000);
                writeJson('nghe-thumbs-v1', imageCache);
              }
            } catch (error) { /* CORS/tainted canvas or unavailable storage: use the original */ }
            imageReady[url] = value; paintImages(url, value);
          }
          runImages();
        }
        img.onload = function () { end(true); }; img.onerror = function () { end(false); };
        timer = setTimeout(function () { img.onload = null; img.onerror = null; img.src = ''; end(false); }, 20000);
        img.src = viaProxy(url);
      }(imageQueue.shift()));
    }
  }
  function scheduleImages() {
    clearTimeout(imageTimer);
    imageTimer = setTimeout(function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-image]'), function (node) {
        if (!visibleImage(node)) return;
        var url = node.getAttribute('data-image'), hit = imageCache[url];
        if (hit && hit.data) {
          hit.at = Date.now(); applyImage(node, hit.data);
          clearTimeout(imagePersistTimer); imagePersistTimer = setTimeout(function () { writeJson('nghe-thumbs-v1', imageCache); }, 2000);
          return;
        }
        if (imageReady[url]) { applyImage(node, imageReady[url]); return; }
        if (!imagePending[url]) { imagePending[url] = true; imageQueue.push(url); }
      });
      runImages();
    }, 0);
  }
  listEl.addEventListener('scroll', scheduleImages);
  sourcesEl.addEventListener('scroll', scheduleImages);
  function openTab(index, keepFocus) {
    state.tab = index; state.source = 0; state.stack = []; state.favoriteLanding = false;
    Array.prototype.forEach.call(tabsEl.children, function (node, at) { node.classList.toggle('on', at === index); });
    sourcesEl.textContent = '';
    var tab = state.tabs[index];
    if (!tab) return;
    $('search-action').classList.toggle('on', !!tab.search);
    $('search-bar').hidden = !tab.search;
    if (!tab.search) lastBrowseId = tab.id;
    if (tab.search) { loadToken += 1; sourcesEl.hidden = true; startSearch(); renderSearch(); return; }
    if (tab.recent) { showList('Đang nghe', recent.slice(), null); sourcesEl.hidden = true; return; }
    if (tab.queue) { loadToken += 1; sourcesEl.hidden = true; showList('Nghe tiếp', queue.slice(), null, 'Chưa có bài trong hàng chờ.'); return; }
    if (tab.favorites) {
      loadToken += 1; state.favoriteLanding = true; tab.sources = favoriteSources.map(findSource).filter(Boolean);
      sourcesEl.hidden = !tab.sources.length;
      tab.sources.forEach(function (source, at) { sourcesEl.appendChild(sourceCard(source, at)); });
      showList('Bài yêu thích', favoriteItems.slice(), null, 'Chưa có bài yêu thích.'); return;
    }
    sourcesEl.hidden = false;
    tab.sources.forEach(function (source, at) { sourcesEl.appendChild(sourceCard(source, at)); });
    selectSource(0);
    if (!keepFocus && state.view === 'browse' && sourcesEl.firstChild) sourcesEl.firstChild.focus();
  }
  function currentSource() { var tab = state.tabs[state.tab]; return tab && !tab.recent && !tab.search ? tab.sources[state.source] : null; }
  function selectSource(index, folder) {
    var source = state.tabs[state.tab] && state.tabs[state.tab].sources[index], token = ++loadToken;
    if (!source) return;
    state.source = index; state.favoriteLanding = false;
    Array.prototype.forEach.call(sourcesEl.children, function (node, at) { node.classList.toggle('on', at === index); });
    if (!folder) state.stack = [];
    showList(folder ? folder.title : source.title, null, source, 'Đang tải…');
    loadSource(source, folder, function (error, value) {
      var focusedIndex = Array.prototype.indexOf.call(listEl.children, document.activeElement);
      if (token !== loadToken) return; // the user moved on
      if (error) { showList(folder ? folder.title : source.title, [], source, 'Không tải được nguồn này. Thử lại sau.'); return; }
      // Some feeds (VnExpress) have no show art: the newest episode's picture stands in for it.
      var art = value.image || (value.items[0] && value.items[0].image);
      if (!folder && art && sourcesEl.children[index]) { setArt(sourcesEl.children[index], art); if (!value.image) value.image = art; }
      showList(folder ? folder.title : source.title, value.items.map(function (item) {
        return {title: item.title, url: item.url, date: item.date, duration: item.duration, image: item.image || value.image,
          folder: !!item.folder, tracks: item.tracks, id: item.id, sourceId: source.id, sourceTitle: source.title};
      }), source);
      if (focusedIndex >= 0 && listEl.children[focusedIndex] && listEl.children[focusedIndex].focus) listEl.children[focusedIndex].focus();
    });
  }
  function showList(title, items, source, message) {
    state.list = items || []; state.listTitle = title;
    $('list-title').textContent = state.stack.length ? '‹ ' + title : title;
    listEl.textContent = '';
    if (!items) { listEl.appendChild(el('p', 'empty', message || '')); return; }
    if (!items.length) { listEl.appendChild(el('p', 'empty', message || 'Chưa có bài nào.')); return; }
    items.forEach(function (item, index) {
      var button = el('button', 'item'), text = el('span', 'text'), thumb = el('span', 'thumb');
      if (item.image) thumb.setAttribute('data-image', item.image);
      text.appendChild(el('span', 't', item.title));
      var pct = player.percent(progress, item.url), done = organize.isPlayed(playedMarks, item.url, pct);
      var subtitle = player.subtitle(item, done || pct >= 97 ? 0 : pct, Date.now());
      if (item.url && !item.folder) subtitle += (subtitle ? ' · ' : '') + (done ? 'Đã nghe' : 'Chưa nghe');
      text.appendChild(el('span', 's', subtitle));
      button.appendChild(thumb); button.appendChild(text);
      if (item.folder) button.appendChild(el('span', 'chev', '›'));
      if (now.entry && now.entry.url && now.entry.url === item.url) button.classList.add('playing');
      button.addEventListener('focus', function () { state.zone = 'list'; try { button.scrollIntoView({block: 'nearest'}); } catch (error) { /* old engine */ } scheduleImages(); });
      button.addEventListener('click', function () { activate(index, source); });
      listEl.appendChild(button);
    });
    scheduleImages();
  }
  function startSearch() {
    if (searchLoading) return;
    var sources = [], at = 0, active = 0;
    (state.baseTabs || []).forEach(function (tab) { tab.sources.forEach(function (source) {
      if (source.type === 'rss' || source.type === 'audioaz') sources.push(source);
    }); });
    searchLoading = true;
    function pump() {
      while (active < 4 && at < sources.length) {
        (function (source) {
          if (source.type === 'audioaz') {
            var saved = memory['s:' + source.id] || (readJson(CACHE_KEY, {}) || {})['s:' + source.id];
            if (saved) searchData[source.id] = saved;
            return;
          }
          active += 1;
          var completed = false;
          loadSource(source, null, function (error, value, pendingRefresh) {
            if (!pendingRefresh && !completed) { active -= 1; completed = true; }
            if (!error) searchData[source.id] = value;
            if (state.tabs[state.tab] && state.tabs[state.tab].search && document.activeElement.parentNode !== listEl) renderSearch();
            if (!pendingRefresh) pump();
          });
        }(sources[at++]));
      }
      if (at >= sources.length && !active) { searchLoading = false; if (state.tabs[state.tab] && state.tabs[state.tab].search && document.activeElement.parentNode !== listEl) renderSearch(); }
    }
    pump();
  }
  function renderSearch() {
    var query = $('search-input').value, results = [];
    (state.baseTabs || []).forEach(function (tab, tabIndex) {
      tab.sources.forEach(function (source, sourceIndex) {
        if (search.matches(source.title, query)) results.push({title: source.title, sourceTitle: 'Nguồn', searchSource: source.id, sourceTab: tabIndex, sourceIndex: sourceIndex});
        var value = searchData[source.id];
        if (!value || !value.items || (source.type !== 'rss' && source.type !== 'audioaz')) return;
        value.items.forEach(function (item) {
          if (search.matches(item.title, query)) results.push({title: item.title, url: item.url, date: item.date,
            duration: item.duration, image: item.image || value.image, folder: !!item.folder,
            tracks: item.tracks, id: item.id, sourceId: source.id, sourceTitle: source.title});
        });
      });
    });
    showList('Kết quả tìm kiếm', results, null, query ? (searchLoading ? 'Đang tìm…' : 'Không tìm thấy kết quả.') : 'Nhập tên nguồn hoặc bài nghe.');
  }
  $('search-input').addEventListener('focus', function () { if (state.tabs[state.tab] && state.tabs[state.tab].search) renderSearch(); });
  $('search-input').addEventListener('input', function () {
    clearTimeout(searchTimer); searchTimer = setTimeout(function () { if (state.tabs[state.tab] && state.tabs[state.tab].search) renderSearch(); }, 150);
  });
  function activate(index, source) {
    var item = state.list[index];
    if (!item) return;
    if (item.searchSource) {
      var targetTab = -1;
      state.tabs.forEach(function (tab, at) { if (tab.id === state.baseTabs[item.sourceTab].id) targetTab = at; });
      if (targetTab >= 0) { openTab(targetTab, false); var at = -1; state.tabs[targetTab].sources.forEach(function (src, i) { if (src.id === item.searchSource) at = i; }); if (at >= 0) { selectSource(at); if (sourcesEl.children[at]) sourcesEl.children[at].focus(); } }
      return;
    }
    if (item.folder) {
      state.stack.push({title: state.listTitle, list: state.list, focus: index});
      var src = source || findSource(item.sourceId);
      if (!src) return;
      showList(item.title, null, src, 'Đang mở…');
      listEl.focus(); // keep focus inside the list while the chapters load
      var token = ++loadToken;
      loadSource(src, item, function (error, value) {
        if (token !== loadToken) return;
        if (error) { showList(item.title, [], src, 'Không mở được sách này.'); return; }
        showList(item.title, value.items.map(function (track) {
          return {title: track.title, url: track.url, image: item.image, sourceId: src.id, sourceTitle: item.title};
        }), src);
        if (listEl.firstChild && listEl.firstChild.focus) listEl.firstChild.focus();
      });
      return;
    }
    if (state.tabs[state.tab].queue) { queue = library.removeQueued(queue, item.url); writeJson('nghe-queue', queue); }
    play(state.list, index, source || findSource(item.sourceId));
  }
  function findSource(id) {
    var found = null;
    (state.baseTabs || []).forEach(function (tab) { (tab.sources || []).forEach(function (source) { if (source.id === id) found = source; }); });
    return found;
  }
  function leaveFolder() {
    var parent = state.stack.pop();
    if (!parent) return false;
    loadToken += 1;
    showList(parent.title, parent.list, currentSource());
    var target = listEl.children[parent.focus];
    if (target && target.focus) target.focus();
    return true;
  }

  // Context actions are reachable with OK on a source or Right on an episode.
  function closeActions() {
    $('actions').hidden = true;
    if (actionReturn && document.documentElement.contains(actionReturn)) actionReturn.focus();
    else if (tabsEl.children[state.tab]) tabsEl.children[state.tab].focus();
  }
  function actions(title, choices) {
    actionReturn = document.activeElement;
    $('actions-title').textContent = title;
    var box = $('actions-list'); box.textContent = '';
    choices.forEach(function (choice) {
      var button = el('button', '', choice.label);
      button.addEventListener('click', function () { closeActions(); choice.run(); });
      box.appendChild(button);
    });
    var cancel = el('button', '', 'Đóng'); cancel.addEventListener('click', closeActions); box.appendChild(cancel);
    $('actions').hidden = false; box.firstChild.focus();
  }
  function actionKey(name, event) {
    if (/^(Arrow|Enter$|Back$)/.test(name)) event.preventDefault();
    if (name === 'Back' || name === 'ArrowLeft') closeActions();
    else if (name === 'ArrowUp' || name === 'ArrowDown') moveWithin(focusables($('actions-list')), name);
    else if (name === 'Enter' && document.activeElement.click) document.activeElement.click();
  }
  function sourceActions(source) {
    var tab = state.tabs[state.tab], isFavorite = favoriteSources.indexOf(source.id) >= 0;
    var choices = [{label: 'Mở danh sách bài', run: function () { var first = listEl.querySelector('button'); if (first) first.focus(); }},
      {label: isFavorite ? 'Bỏ nguồn yêu thích' : 'Thêm nguồn yêu thích', run: function () {
        favoriteSources = library.toggleSource(favoriteSources, source.id); writeJson('nghe-favorite-sources', favoriteSources);
        toast(isFavorite ? 'Đã bỏ nguồn yêu thích.' : 'Đã thêm nguồn yêu thích.');
        if (tab.favorites) openTab(state.tab, true);
      }}];
    if (!tab.favorites && !tab.recent && !tab.queue && !tab.search) {
      var pref = sourcePrefs[tab.id] || {}, pinned = organize.isPinned(pref, source.id);
      function applyPref(updated) {
        sourcePrefs[tab.id] = updated; writeJson('nghe-source-order', sourcePrefs);
        tab.sources = organize.orderSources(tab.sources, updated);
        var at = 0; tab.sources.forEach(function (src, index) { if (src.id === source.id) at = index; });
        openTab(state.tab, true); if (sourcesEl.children[at]) sourcesEl.children[at].focus();
      }
      choices.push({label: pinned ? 'Bỏ ghim nguồn' : 'Ghim nguồn lên đầu', run: function () { applyPref(organize.setPinned(pref, source.id, !pinned)); }});
      choices.push({label: 'Chuyển nguồn sang trái', run: function () { applyPref(organize.moveSource(tab.sources, pref, source.id, -1)); }});
      choices.push({label: 'Chuyển nguồn sang phải', run: function () { applyPref(organize.moveSource(tab.sources, pref, source.id, 1)); }});
    }
    actions(source.title, choices);
  }
  function itemActions(item) {
    if (!item || !item.url || item.searchSource) return;
    var isFavorite = favoriteItems.some(function (entry) { return entry.url === item.url; });
    var queued = queue.some(function (entry) { return entry.url === item.url; });
    var done = organize.isPlayed(playedMarks, item.url, player.percent(progress, item.url));
    var choices = [{label: isFavorite ? 'Bỏ bài yêu thích' : 'Thêm bài yêu thích', run: function () {
      favoriteItems = library.toggleItem(favoriteItems, item); writeJson('nghe-favorite-items', favoriteItems);
      toast(isFavorite ? 'Đã bỏ bài yêu thích.' : 'Đã thêm bài yêu thích.');
      if (state.tabs[state.tab].favorites) openTab(state.tab, true);
    }}];
    if (!item.folder) {
      choices.push({label: queued ? 'Bỏ khỏi hàng chờ' : 'Thêm vào hàng chờ', run: function () {
        queue = queued ? library.removeQueued(queue, item.url) : library.enqueue(queue, item); writeJson('nghe-queue', queue);
        toast(queued ? 'Đã bỏ khỏi hàng chờ.' : 'Đã thêm vào hàng chờ.');
        if (state.tabs[state.tab].queue) openTab(state.tab, true);
      }});
      choices.push({label: done ? 'Đánh dấu chưa nghe' : 'Đánh dấu đã nghe', run: function () {
        playedMarks = organize.setPlayed(playedMarks, item.url, !done, Date.now()); writeJson('nghe-played', playedMarks);
        var at = state.list.indexOf(item); showList(state.listTitle, state.list.slice(), currentSource());
        if (listEl.children[at]) listEl.children[at].focus();
      }});
    }
    actions(item.title, choices);
  }

  // ---- Playback ----
  function play(list, index, source) {
    var entry = list[index];
    if (!entry || !entry.url) return;
    saveProgressNow();
    // From "Đang nghe" the list is a history, not a series: never auto-advance through it.
    var fromRecent = state.tabs[state.tab] && (state.tabs[state.tab].recent || state.tabs[state.tab].search || state.tabs[state.tab].queue || state.tabs[state.tab].favorites) && list === state.list;
    now = {entry: entry, list: list, index: index, source: source, next: fromRecent ? 'none' : source && source.next};
    audio.src = viaProxy(entry.url);
    var start = player.resumeAt(progress, entry.url);
    audio.addEventListener('loadedmetadata', function seekOnce() {
      audio.removeEventListener('loadedmetadata', seekOnce);
      if (start) { try { audio.currentTime = start; } catch (error) { /* not seekable yet */ } }
    });
    var attempt = audio.play();
    if (attempt && attempt.catch) attempt.catch(function () { toast('TV chưa phát được bài này.'); });
    recent = player.addRecent(recent, {title: entry.title, url: entry.url, image: entry.image, duration: entry.duration,
      date: entry.date, sourceId: entry.sourceId, sourceTitle: entry.sourceTitle || (source && source.title) || ''});
    writeJson(RECENT_KEY, recent);
    ensureRecentTab();
    showPlayer();
    updateNow();
    markPlaying();
  }
  function markPlaying() {
    Array.prototype.forEach.call(listEl.children, function (node, at) {
      if (node.classList) node.classList.toggle('playing', !!(state.list[at] && now.entry && state.list[at].url === now.entry.url));
    });
  }
  function updateNow() {
    var pill = $('now');
    pill.hidden = !now.entry;
    if (!now.entry) return;
    $('now-title').textContent = now.entry.title;
    pill.classList.toggle('paused', audio.paused);
    $('p-state').textContent = audio.paused ? 'Tạm dừng' : '';
  }
  function saveProgressNow() {
    if (!now.entry || !(audio.currentTime > 0)) return;
    progress = player.saveProgress(progress, now.entry.url, audio.currentTime, audio.duration || now.entry.duration, Date.now());
    writeJson(PROGRESS_KEY, progress);
  }
  function showPlayer() {
    var entry = now.entry, image = entry.image || '';
    state.view = 'player';
    $('browse').hidden = true; $('player').hidden = false;
    $('backdrop').style.backgroundImage = image ? cssUrl(image) : '';
    $('cover').style.backgroundImage = image ? cssUrl(image) : '';
    $('player').classList.toggle('no-art', !image);
    $('w-title').textContent = entry.title;
    $('p-source').textContent = entry.sourceTitle || (now.source && now.source.title) || '';
    $('p-title').textContent = entry.title;
    wake();
  }
  function showBrowse() {
    state.view = 'browse';
    $('player').hidden = true; $('browse').hidden = false;
    clearTimeout(calmTimer);
    var target = state.zone === 'list' ? listEl.querySelector('.item.playing') || listEl.firstChild : sourcesEl.children[state.source];
    (target && target.focus ? target : $('now')).focus();
  }
  // Any key in the player brings the controls back; after a few quiet seconds only the picture stays.
  function wake() {
    $('player').classList.remove('calm');
    clearTimeout(calmTimer);
    calmTimer = setTimeout(function () { if (state.view === 'player' && !audio.paused) $('player').classList.add('calm'); }, CALM_MS);
  }
  function toggle() {
    if (!now.entry) return;
    if (audio.paused) { var attempt = audio.play(); if (attempt && attempt.catch) attempt.catch(function () { toast('TV chưa phát được bài này.'); }); }
    else audio.pause();
  }
  function seekBy(delta) {
    if (!now.entry) return;
    try { audio.currentTime = player.seek(audio.currentTime, delta, audio.duration); } catch (error) { /* stream not seekable */ }
  }
  function step(direction) {
    var mode = direction > 0 ? 'list' : 'newer';
    var next = direction === 0 ? player.nextIndex(now.list.length, now.index, now.next) :
      player.nextIndex(now.list.length, now.index, mode);
    if (next >= 0) play(now.list, next, now.source);
    else if (direction === 0) { updateNow(); }
  }
  function cycleSleep() {
    sleepMinutes = player.nextSleep(sleepMinutes);
    clearTimeout(sleepTimer); clearTimeout(blackTimer);
    $('sleep-black').hidden = true;
    if (sleepMinutes === 'end') blackTimer = setTimeout(function () { if (sleepMinutes === 'end') $('sleep-black').hidden = false; }, 2500);
    var label = $('p-sleep');
    label.textContent = player.sleepLabel(sleepMinutes); label.hidden = !sleepMinutes;
    toast(player.sleepLabel(sleepMinutes));
    if (sleepMinutes && sleepMinutes !== 'end') {
      sleepTimer = setTimeout(function () { audio.pause(); sleepMinutes = 0; label.hidden = true; toast('Đã tự dừng theo hẹn giờ.'); }, sleepMinutes * 60000);
    }
  }
  var speedCheck = 0;
  function verifySpeed() {
    var desired = audio.playbackRate, token = ++speedCheck, src = audio.currentSrc;
    if (desired === 1 || audio.paused) return;
    var start = audio.currentTime, started = Date.now();
    setTimeout(function () {
      if (token !== speedCheck || audio.currentSrc !== src || audio.paused) return;
      var elapsed = (Date.now() - started) / 1000, advance = audio.currentTime - start;
      if (audio.seeking || audio.readyState < 3 || advance < 1) {
        audio.playbackRate = 1; toast('Chưa xác minh được tốc độ; đã về 1×.'); return;
      }
      if (!player.speedMatches(desired, advance, elapsed)) {
        audio.playbackRate = 1; toast('TV không hỗ trợ tốc độ này; đã về 1×.');
      } else toast('Tốc độ: ' + desired + '×');
    }, 4000);
  }
  function cycleSpeed() {
    var desired = player.nextSpeed(audio.playbackRate || 1);
    try { audio.playbackRate = desired; toast(desired === 1 ? 'Tốc độ: 1×' : 'Đang kiểm tra tốc độ ' + desired + '×…'); verifySpeed(); }
    catch (error) { toast('TV không hỗ trợ tốc độ này.'); }
  }
  audio.addEventListener('timeupdate', function () {
    var duration = audio.duration || (now.entry && now.entry.duration) || 0;
    $('p-time').textContent = player.formatTime(audio.currentTime);
    $('w-time').textContent = player.formatTime(audio.currentTime) + ' / ' + player.formatTime(duration);
    $('p-dur').textContent = player.formatTime(duration);
    var ratio = duration ? Math.min(1, audio.currentTime / duration) : 0;
    $('p-fill').style.transform = 'scaleX(' + ratio + ')';
    $('p-fill').style.webkitTransform = 'scaleX(' + ratio + ')';
    if (Date.now() - saveAt > 10000) { saveAt = Date.now(); saveProgressNow(); }
  });
  audio.addEventListener('play', function () { updateNow(); wake(); verifySpeed(); });
  audio.addEventListener('pause', function () { updateNow(); saveProgressNow(); $('player').classList.remove('calm'); });
  audio.addEventListener('ended', function () {
    if (now.entry) { progress = player.saveProgress(progress, now.entry.url, audio.duration, audio.duration, Date.now()); writeJson(PROGRESS_KEY, progress); }
    if (now.entry) { playedMarks = organize.setPlayed(playedMarks, now.entry.url, true, Date.now()); writeJson('nghe-played', playedMarks); }
    if (sleepMinutes === 'end') { sleepMinutes = 0; $('p-sleep').hidden = true; audio.pause(); return; }
    if (queue.length) { var nextQueued = library.shiftQueued(queue); queue = nextQueued.queue; writeJson('nghe-queue', queue); play([nextQueued.item], 0, findSource(nextQueued.item.sourceId)); now.next = 'none'; return; }
    step(0);
  });
  audio.addEventListener('error', function () { if (now.entry) toast('Không phát được bài này (nguồn có thể đã đổi hoặc chặn).'); });

  // ---- Keys ----
  function registerMediaKeys() {
    if (!tv || !tv.tvinputdevice) return;
    var supported = {};
    try { tv.tvinputdevice.getSupportedKeys().forEach(function (key) { supported[key.name] = key.code; }); } catch (error) { return; }
    MEDIA_KEYS.forEach(function (name) {
      if (!Object.prototype.hasOwnProperty.call(supported, name)) return;
      try { tv.tvinputdevice.registerKey(name); keyNames[supported[name]] = name; } catch (error) { /* skip */ }
    });
  }
  function keyName(event) {
    if (keyNames[event.keyCode]) return keyNames[event.keyCode];
    if (event.keyCode === 10009) return 'Back';
    return event.key === 'Escape' || event.key === 'Backspace' ? 'Back' : event.key;
  }
  function focusables(container) { return Array.prototype.filter.call(container.children, function (node) { return node.focus && node.tagName === 'BUTTON'; }); }
  function moveWithin(items, key) {
    var at = items.indexOf(document.activeElement);
    var to = at < 0 ? 0 : key === 'ArrowLeft' || key === 'ArrowUp' ? Math.max(0, at - 1) : Math.min(items.length - 1, at + 1);
    if (items[to]) items[to].focus();
    return to !== at;
  }
  function browseKey(name) {
    var active = document.activeElement, inTabs = active && active.parentNode === tabsEl;
    var inSearch = active === $('search-input');
    var inTop = active === $('now') || active === $('search-action') || inTabs, inSources = active && active.parentNode === sourcesEl;
    var inList = active && (active.parentNode === listEl || active === listEl);
    if (inSearch) {
      if (name === 'ArrowUp') $('search-action').focus();
      else if (name === 'ArrowDown') { var result = listEl.querySelector('button'); if (result) result.focus(); }
      else if (name === 'Back') active.blur();
      return;
    }
    if (name === 'Back') {
      // Inside a book, Back always climbs out first, even while its chapter list is still loading.
      if ((inList || !active || active === document.body) && leaveFolder()) return;
      if (inList || !active || active === document.body) { (state.tabs[state.tab].search ? $('search-action') : sourcesEl.hidden ? tabsEl.children[state.tab] : sourcesEl.children[state.source] || tabsEl.children[state.tab]).focus(); return; }
      if (inSources) { tabsEl.children[state.tab].focus(); return; }
      if (active === $('search-action') && state.tabs[state.tab].search) {
        var previous = 0; state.tabs.forEach(function (tab, index) { if (tab.id === lastBrowseId) previous = index; });
        openTab(previous, true); if (tabsEl.children[previous]) tabsEl.children[previous].focus(); return;
      }
      exitApp(); return;
    }
    if (name === 'Enter') { if (active && active.click) active.click(); return; }
    if (inTop) {
      var top = focusables(tabsEl); if (!$('now').hidden) top.push($('now')); top.push($('search-action'));
      if (name === 'ArrowLeft' || name === 'ArrowRight') moveWithin(top, name);
      else if (name === 'ArrowUp' && inTabs) $('search-action').focus();
      else if (name === 'ArrowDown') { var first = state.tabs[state.tab].search ? $('search-input') : sourcesEl.hidden ? listEl.querySelector('button') : sourcesEl.children[state.source]; if (first) first.focus(); }
      return;
    }
    if (inSources) {
      if (name === 'ArrowLeft' || name === 'ArrowRight') moveWithin(focusables(sourcesEl), name);
      else if (name === 'ArrowUp') tabsEl.children[state.tab].focus();
      else if (name === 'ArrowDown') { var item = listEl.querySelector('button'); if (item) item.focus(); }
      return;
    }
    if (inList) {
      var items = focusables(listEl);
      if (name === 'ArrowUp' && items.indexOf(active) === 0) { (state.tabs[state.tab].search ? $('search-input') : sourcesEl.hidden ? tabsEl.children[state.tab] : sourcesEl.children[state.source]).focus(); return; }
      if (name === 'ArrowRight' && items.indexOf(active) >= 0) { itemActions(state.list[items.indexOf(active)]); return; }
      if (name === 'ArrowUp' || name === 'ArrowDown') moveWithin(items, name);
      return;
    }
    if (tabsEl.children[state.tab]) tabsEl.children[state.tab].focus();
  }
  function playerKey(name) {
    wake();
    if (name === 'Back') {
      if (sleepMinutes === 'end') { sleepMinutes = 0; clearTimeout(blackTimer); $('p-sleep').hidden = true; }
      showBrowse(); return;
    }
    if (name === 'Enter' || name === 'MediaPlayPause') toggle();
    else if (name === 'MediaPlay') { if (audio.paused) toggle(); }
    else if (name === 'MediaPause') { if (!audio.paused) toggle(); }
    else if (name === 'ArrowLeft' || name === 'MediaRewind') seekBy(-SEEK);
    else if (name === 'ArrowRight' || name === 'MediaFastForward') seekBy(SEEK);
    else if (name === 'ArrowDown') cycleSleep();
    else if (name === 'ArrowUp') cycleSpeed();
    else if (name === 'MediaTrackNext') step(1);
    else if (name === 'MediaTrackPrevious') step(-1);
    else if (name === 'MediaStop') { audio.pause(); showBrowse(); }
  }
  document.addEventListener('keydown', function (event) {
    var name = keyName(event);
    if (!$('actions').hidden) { actionKey(name, event); return; }
    if (!$('sleep-black').hidden && /^(Arrow|Enter$|Back$|Media)/.test(name)) { event.preventDefault(); $('sleep-black').hidden = true; if (name === 'Back') { sleepMinutes = 0; clearTimeout(blackTimer); $('p-sleep').hidden = true; } return; }
    if (document.activeElement === $('search-input') && (event.key === 'Backspace' || name === 'Enter' || name === 'ArrowLeft' || name === 'ArrowRight')) return;
    if (/^(Arrow|Enter$|Back$|Media)/.test(name)) event.preventDefault();
    if (state.view === 'player') { playerKey(name); return; }
    if (/^Media/.test(name)) { if (name === 'MediaPlayPause' || name === 'MediaPlay' || name === 'MediaPause') toggle(); return; }
    browseKey(name);
  });
  $('now').addEventListener('click', function () { if (now.entry) showPlayer(); });
  $('search-action').addEventListener('click', function () {
    var index = state.tabs.length - 1;
    if (index < 0 || !state.tabs[index].search) return;
    if (state.tab !== index) openTab(index, true);
    $('search-input').focus();
  });
  function exitApp() {
    saveProgressNow();
    try { tv.application.getCurrentApplication().exit(); } catch (error) { toast('Bản xem trước · Thoát app'); }
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveProgressNow(); });
  window.addEventListener('beforeunload', saveProgressNow);

  function clock() {
    var date = new Date();
    $('clock').textContent = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
  }
  clock(); setInterval(clock, 30000);
  if (PREVIEW) $('mode').textContent = 'BẢN XEM TRƯỚC TRÊN MÁY TÍNH · ÂM THANH QUA PROXY CỤC BỘ';
  registerMediaKeys();
  loadSources();
}());
