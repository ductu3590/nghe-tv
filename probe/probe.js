// Nghe probe: answers, on the real TV, what the app depends on. Read-only apart from playing short audio clips.
// Never registers Home, Power or brand keys.
(function () {
  'use strict';
  var feeds = window.NgheFeeds, tv = window.tizen, $ = function (id) { return document.getElementById(id); };
  var REMOTE = 'https://raw.githubusercontent.com/ductu3590/nghe-tv/main/app/sources.json';
  var rows = $('rows'), audio = $('audio'), found = {}, started = Date.now();

  function row(name) {
    var node = document.createElement('div'); node.className = 'row wait';
    var label = document.createElement('span'); label.className = 'label'; label.textContent = name;
    var value = document.createElement('span'); value.className = 'value'; value.textContent = 'đang thử…';
    node.appendChild(label); node.appendChild(value); rows.appendChild(node);
    return function (ok, text) { node.className = 'row ' + (ok === true ? 'ok' : ok === false ? 'bad' : 'info'); value.textContent = text; log(name, ok, text); };
  }
  var results = [];
  function log(name, ok, text) {
    results.push({t: Date.now() - started, check: name, ok: ok, detail: text});
    try { console.log('[nghe-probe]', name, ok, text); localStorage.setItem('nghe-probe', JSON.stringify(results)); } catch (error) { /* ignore */ }
  }
  function get(url, options, done) {
    var xhr = new XMLHttpRequest(), finished = false, t0 = Date.now();
    function finish(error, text, extra) { if (finished) return; finished = true; done(error, text, extra || {ms: Date.now() - t0}); }
    var timer = setTimeout(function () { finish(new Error('hết thời gian chờ')); try { xhr.abort(); } catch (e) { /* gone */ } }, options.timeout || 25000);
    xhr.open('GET', url, true);
    if (options.until) xhr.onprogress = function () {
      var text = xhr.responseText || '', cut = options.until(text);
      if (cut > 0) { clearTimeout(timer); finish(null, text.slice(0, cut), {ms: Date.now() - t0, bytes: text.length, early: true}); try { xhr.abort(); } catch (e) { /* done */ } }
    };
    xhr.onload = function () {
      clearTimeout(timer);
      if ((xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText)) finish(null, xhr.responseText, {ms: Date.now() - t0, bytes: (xhr.responseText || '').length});
      else finish(new Error('HTTP ' + xhr.status));
    };
    xhr.onerror = function () { clearTimeout(timer); finish(new Error('bị chặn hoặc lỗi mạng (CORS?)')); };
    xhr.send();
  }
  function kb(bytes) { return Math.round((bytes || 0) / 1024) + ' KB'; }
  function series(tasks, done) {
    var index = 0;
    (function next() { if (index >= tasks.length) { if (done) done(); return; } tasks[index++](next); }());
  }

  var checks = [
    function (next) {
      var done = row('sources.json trong app');
      get('sources.json', {timeout: 5000}, function (error, text) {
        try { var data = JSON.parse(text); done(true, data.tabs.length + ' tab'); } catch (problem) { done(false, error ? error.message : 'không đọc được'); }
        next();
      });
    },
    function (next) {
      var done = row('sources.json trên GitHub');
      get(REMOTE + '?t=' + Date.now(), {timeout: 10000}, function (error, text, extra) {
        try { JSON.parse(text); done(true, 'được · ' + extra.ms + ' ms'); } catch (problem) { done(false, error ? error.message : 'không phải JSON'); }
        next();
      });
    },
    function (next) {
      var done = row('Feed VnExpress (không có CORS)');
      get('https://vnexpress.net/rss/podcast/diem-tin.rss', {}, function (error, text, extra) {
        var feed = error ? null : feeds.parseRss(text, 5);
        if (feed && feed.items.length) { found.vne = feed.items[0].url; done(true, feed.items.length + '+ bài · ' + extra.ms + ' ms'); }
        else done(false, error ? error.message : 'không có bài');
        next();
      });
    },
    function (next) {
      var done = row('Feed lớn VOV Thời sự (~30 MB): đọc dần 30 bài');
      get('https://anchor.fm/s/86ec8d4/podcast/rss', {until: function (text) { return feeds.enoughItems(text, 30); }, timeout: 40000}, function (error, text, extra) {
        var feed = error ? null : feeds.parseRss(text, 30);
        if (feed && feed.items.length) { found.anchor = feed.items[0].url; done(true, feed.items.length + ' bài · đã tải ' + kb(extra.bytes) + ' · ' + extra.ms + ' ms' + (extra.early ? ' · dừng sớm được' : ' · KHÔNG dừng sớm được')); }
        else done(false, error ? error.message : 'không có bài');
        next();
      });
    },
    function (next) {
      var done = row('Tuổi Trẻ');
      get('https://podcast.tuoitre.vn/podcast-feed.rss', {until: function (text) { return feeds.enoughItems(text, 10); }}, function (error, text, extra) {
        var feed = error ? null : feeds.parseRss(text, 10);
        if (feed && feed.items.length) { found.tt = feed.items[0].url; done(true, feed.items.length + ' bài · ' + extra.ms + ' ms'); } else done(false, error ? error.message : 'không có bài');
        next();
      });
    },
    function (next) {
      var done = row('AudioAZ: trang chủ và một sách');
      get('https://audioaz.com/vi', {}, function (error, html) {
        var books = error ? [] : feeds.audioazBooks(html);
        if (!books.length) { done(false, error ? error.message : 'không thấy sách'); next(); return; }
        get(books[0].url, {}, function (bookError, page) {
          var tracks = bookError ? [] : feeds.audioazTracks(page);
          if (tracks.length) found.archive = tracks[0].url;
          done(tracks.length > 0, books.length + ' sách · sách đầu ' + tracks.length + ' phần' + (bookError ? ' · ' + bookError.message : ''));
          next();
        });
      });
    },
    function (next) {
      var done = row('Sách Nói Việt Nam (RSS)');
      get('https://sachnoivietnam.com/feed/', {}, function (error, text) {
        var books = error ? [] : feeds.wordpressBooks(text, 10);
        if (books.length) found.snvn = books[0].tracks[0].url;
        done(books.length > 0, books.length ? books.length + ' sách' : error ? error.message : 'không thấy sách');
        next();
      });
    },
    function (next) {
      var done = row('Phím media được hỗ trợ');
      try {
        var names = tv.tvinputdevice.getSupportedKeys().map(function (key) { return key.name; }).filter(function (name) { return /^Media/.test(name); });
        done(names.length > 0, names.join(', ') || 'không có');
      } catch (error) { done(false, 'không đọc được (' + (error.message || error) + ')'); }
      next();
    }
  ];
  function playCheck(name, key) {
    return function (next) {
      var done = row('Phát thử: ' + name);
      var url = found[key];
      if (!url) { done(false, 'không có link để thử'); next(); return; }
      var t0 = Date.now(), over = false, poll;
      function end(ok, text) { if (over) return; over = true; clearInterval(poll); audio.pause(); audio.removeAttribute('src'); try { audio.load(); } catch (e) { /* ok */ } done(ok, text); setTimeout(next, 400); }
      audio.onerror = function () { end(false, 'lỗi phát (mã ' + (audio.error && audio.error.code) + ')'); };
      audio.volume = 0.25; audio.src = url;
      var attempt = audio.play(); if (attempt && attempt.catch) attempt.catch(function (error) { end(false, 'play() bị từ chối: ' + (error && error.name)); });
      poll = setInterval(function () {
        if (audio.currentTime > 1.5) {
          var seekable = false;
          try { seekable = audio.seekable && audio.seekable.length > 0 && audio.seekable.end(0) > 30; } catch (e) { seekable = false; }
          end(true, 'phát sau ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s · ' + (seekable ? 'tua được' : 'chưa chắc tua được'));
        } else if (Date.now() - t0 > 20000) end(false, 'không phát trong 20 s');
      }, 300);
    };
  }
  checks.push(playCheck('VnExpress (mp3)', 'vne'), playCheck('anchor.fm / VOV', 'anchor'), playCheck('Tuổi Trẻ', 'tt'),
    playCheck('archive.org (AudioAZ)', 'archive'), playCheck('Sách Nói Việt Nam', 'snvn'));

  // Background test: does sound keep going while another app or Samsung Home covers this one?
  var hiddenAt = 0, hiddenTime = 0;
  function backgroundTest() {
    var url = found.vne || found.anchor;
    if (!url) { $('bg').textContent = 'Chưa có link audio (chạy lại các kiểm tra trước).'; return; }
    audio.volume = 0.35; audio.src = url; audio.play();
    $('bg').textContent = 'Đang phát. Bấm Home, đợi khoảng 20 giây, rồi mở lại Nghe Probe.';
  }
  document.addEventListener('visibilitychange', function () {
    if (!audio.src) return;
    if (document.hidden) { hiddenAt = Date.now(); hiddenTime = audio.currentTime; return; }
    if (!hiddenAt) return;
    var wall = (Date.now() - hiddenAt) / 1000, played = audio.currentTime - hiddenTime;
    var text = 'Bị che ' + wall.toFixed(0) + ' s, âm thanh chạy thêm ' + played.toFixed(0) + ' s → ' +
      (played > wall * 0.7 ? 'CÓ phát tiếp khi bị che' : 'KHÔNG phát khi bị che');
    $('bg').textContent = text; log('Phát khi bị che', played > wall * 0.7, text);
    audio.pause(); hiddenAt = 0;
  });

  function runAll() { rows.textContent = ''; results = []; started = Date.now(); series(checks, function () { $('summary').textContent = 'Xong. Kết quả cũng lưu ở localStorage "nghe-probe".'; }); }
  $('again').addEventListener('click', runAll);
  $('bgtest').addEventListener('click', backgroundTest);
  document.addEventListener('keydown', function (event) {
    var buttons = [$('again'), $('bgtest')], at = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); buttons[at === 0 ? 1 : 0].focus(); }
    else if (event.key === 'Enter' && document.activeElement && document.activeElement.click) { event.preventDefault(); document.activeElement.click(); }
    else if (event.keyCode === 10009 || event.key === 'Escape') {
      event.preventDefault();
      try { tv.application.getCurrentApplication().exit(); } catch (error) { /* preview */ }
    }
  });
  $('ua').textContent = navigator.userAgent;
  $('again').focus();
  runAll();
}());
