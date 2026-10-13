/* ============================================================
   我们的 999 天 · 渲染脚本
   数据源：data/content.json（全站唯一数据源，运行时 fetch）
   原生 JS，ES2019 及以下语法，无任何外部依赖
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 天数算法：在一起第一天记为第 1 天 ---------- */
  function daysTogether(startStr) {
    var p = startStr.split('-');
    var s = new Date(+p[0], +p[1] - 1, +p[2]);
    var n = new Date();
    var t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((t - s) / 86400000) + 1; // 在一起第一天记为第 1 天
  }

  /* ---------- 小工具 ---------- */
  // 两位数字补零（页码、日期用）
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // 今天日期，格式 2026.10.13
  function todayString() {
    var n = new Date();
    return n.getFullYear() + '.' + pad2(n.getMonth() + 1) + '.' + pad2(n.getDate());
  }

  // 快捷建元素：标签 / 类名 / 文本（一律 textContent，防注入）
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = text; }
    return node;
  }

  // 系统开启「减少动态效果」时返回 true
  function reducedMotion() {
    return window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- 背景图 + 遮罩（每屏通用） ---------- */
  function addBackground(section, src, index) {
    var img = el('img', 'bg');
    img.src = src;
    img.alt = '';                        // 纯装饰
    img.loading = 'lazy';                // 懒加载
    img.decoding = 'async';
    // 随机负延迟，让每屏的 Ken Burns 呼吸错开
    if (!reducedMotion()) {
      img.style.animationDelay = -Math.floor(Math.random() * 18) + 's';
    }
    section.appendChild(img);
    section.appendChild(el('div', 'shade')); // 深梅紫渐变遮罩
    return img;
  }

  /* ---------- 右下角页码 "02 / 08" ---------- */
  function addPageNum(section, index, total) {
    section.appendChild(
      el('div', 'page-num', pad2(index + 1) + ' / ' + pad2(total))
    );
  }

  /* ---------- Hero 浮动爱心层（纯装饰） ---------- */
  function addHearts(section) {
    var layer = el('div', 'hearts');
    layer.setAttribute('aria-hidden', 'true');
    var colors = ['#ffc2dd', '#ff9ec7', '#b388ff'];
    for (var i = 0; i < 12; i++) {
      var h = el('span', 'heart', '♥');
      h.style.left = (2 + Math.random() * 94) + '%';
      h.style.fontSize = Math.round(12 + Math.random() * 16) + 'px';
      // 时长 8~16s；负延迟让爱心开场就处于漂浮中段
      h.style.animationDuration = (8 + Math.random() * 8).toFixed(2) + 's';
      h.style.animationDelay = (-Math.random() * 16).toFixed(2) + 's';
      h.style.color = colors[i % colors.length];
      layer.appendChild(h);
    }
    section.appendChild(layer);
  }

  /* ---------- 第 1 屏：hero ---------- */
  function buildHero(hero, total) {
    var section = el('section', 'screen screen--hero');
    section.id = 'screen-hero';

    addBackground(section, hero.image, 0);
    addHearts(section);

    var box = el('div', 'content');
    box.appendChild(el('div', 'badge reveal', hero.badge));
    box.appendChild(el('div', 'big-number reveal d1', hero.bigNumber));
    box.appendChild(el('h1', 'hero-title reveal d2', hero.title));
    box.appendChild(el('p', 'hero-subtitle reveal d3', hero.subtitle));
    section.appendChild(box);

    // 底部下滑提示：↓ 箭头 + 文字
    var hint = el('div', 'scroll-hint reveal d3');
    hint.setAttribute('aria-hidden', 'true');
    hint.appendChild(el('span', 'arrow', '↓'));
    hint.appendChild(el('span', 'hint-text', hero.scrollHint));
    section.appendChild(hint);

    addPageNum(section, 0, total);
    return section;
  }

  /* ---------- 故事屏（type=story） ---------- */
  function buildStory(page, index, total) {
    var section = el('section', 'screen');
    if (page.id) { section.id = 'screen-' + page.id; }

    addBackground(section, page.image, index);

    var box = el('div', 'content');
    if (page.date) { box.appendChild(el('div', 'story-date reveal', page.date)); }
    box.appendChild(el('h2', 'screen-title reveal d1', page.title));
    box.appendChild(el('p', 'screen-text reveal d2', page.text));
    section.appendChild(box);

    addPageNum(section, index, total);
    return section;
  }

  /* ---------- 计数屏（type=counter） ---------- */
  var counterEls = [];   // 需要定时刷新的大数字元素
  var startDate = '';    // 在一起的开始日期

  function buildCounter(page, index, total) {
    var section = el('section', 'screen');
    if (page.id) { section.id = 'screen-' + page.id; }

    addBackground(section, page.image, index);

    var box = el('div', 'content');
    if (page.date) { box.appendChild(el('div', 'story-date reveal', page.date)); }
    box.appendChild(el('h2', 'screen-title reveal d1', page.title));
    box.appendChild(el('p', 'screen-text reveal d2', page.text));

    // 大号实时天数：数字（每 30s 重算）+ 小一号的「天」
    var line = el('div', 'counter-line reveal d2');
    var num = el('span', 'counter-number', String(daysTogether(startDate)));
    var unit = el('span', 'counter-unit', '天');
    line.appendChild(num);
    line.appendChild(unit);
    box.appendChild(line);
    counterEls.push(num);

    box.appendChild(el('div', 'counter-today reveal d3', '今天是 ' + todayString()));
    box.appendChild(el('div', 'counter-forever reveal d3', '依然爱你'));
    section.appendChild(box);

    addPageNum(section, index, total);
    return section;
  }

  /* ---------- 计数刷新：每 30 秒 + 页面重新可见时 ---------- */
  function refreshCounters() {
    if (!startDate) { return; }
    var d = String(daysTogether(startDate));
    for (var i = 0; i < counterEls.length; i++) {
      counterEls[i].textContent = d;
    }
  }

  function startCounterTimer() {
    setInterval(refreshCounters, 30000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { refreshCounters(); }
    });
  }

  /* ---------- 进场动效：IntersectionObserver，只触发一次 ---------- */
  function setupReveal(sections) {
    if (!('IntersectionObserver' in window) || reducedMotion()) {
      // 老浏览器 / 减少动态：直接全部显示
      for (var i = 0; i < sections.length; i++) {
        var all = sections[i].querySelectorAll('.reveal');
        for (var j = 0; j < all.length; j++) { all[j].classList.add('is-in'); }
      }
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        var nodes = entry.target.querySelectorAll('.reveal');
        for (var k = 0; k < nodes.length; k++) { nodes[k].classList.add('is-in'); }
        io.unobserve(entry.target);   // 只触发一次
      });
    }, { threshold: 0.35 });
    for (var s = 0; s < sections.length; s++) { io.observe(sections[s]); }
  }

  /* ---------- 右侧圆点导航 ---------- */
  function setupDotNav(sections) {
    var nav = el('nav', 'dot-nav');
    nav.setAttribute('aria-label', '页面导航');
    var dots = [];
    var behavior = reducedMotion() ? 'auto' : 'smooth';

    for (var i = 0; i < sections.length; i++) {
      (function (idx) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', '第 ' + (idx + 1) + ' 屏');
        dot.addEventListener('click', function () {
          sections[idx].scrollIntoView({ behavior: behavior, block: 'start' });
        });
        nav.appendChild(dot);
        dots.push(dot);
      })(i);
    }
    document.body.appendChild(nav);

    // 滚动时高亮当前屏（视口中线落在哪一屏内）
    function updateActive() {
      var mid = window.innerHeight / 2;
      var current = 0;
      for (var i = 0; i < sections.length; i++) {
        var rect = sections[i].getBoundingClientRect();
        if (rect.top <= mid && rect.bottom > mid) { current = i; }
      }
      for (var d = 0; d < dots.length; d++) {
        dots[d].className = d === current ? 'active' : '';
      }
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) { return; }
      ticking = true;
      window.requestAnimationFrame(function () {
        updateActive();
        ticking = false;
      });
    }, { passive: true });
    window.addEventListener('resize', updateActive);
    updateActive();
  }

  /* ---------- 渲染入口 ---------- */
  function render(data) {
    var app = document.getElementById('app');
    app.textContent = '';   // 清空，防重复渲染

    startDate = data.startDate;
    counterEls = [];
    var sections = [];
    var total = data.pages.length + 1;   // 总屏数含 hero

    // hero
    var heroSection = buildHero(data.hero, total);
    app.appendChild(heroSection);
    sections.push(heroSection);

    // pages 逐屏
    for (var i = 0; i < data.pages.length; i++) {
      var page = data.pages[i];
      var section = page.type === 'counter'
        ? buildCounter(page, i + 1, total)
        : buildStory(page, i + 1, total);
      app.appendChild(section);
      sections.push(section);
    }

    // footer：绝对定位在最后一屏底部居中的半透明小字
    if (data.footer) {
      var last = sections[sections.length - 1];
      last.appendChild(el('div', 'footer-note', data.footer));
    }

    // 交互与动效
    setupReveal(sections);
    setupDotNav(sections);
    refreshCounters();
    startCounterTimer();

    // 内容就绪，隐藏加载动效
    var loader = document.getElementById('loader');
    if (loader) { loader.classList.add('is-done'); }
  }

  /* ---------- fetch 失败提示卡 ---------- */
  function showError() {
    // 失败时必须撤掉加载动效：loader 层级更高，不撤会一直挡住错误卡
    var loader = document.getElementById('loader');
    if (loader) { loader.classList.add('is-done'); }
    var card = el('div', 'error-card');
    var inner = el('div', 'card');
    inner.appendChild(el('p', null, '内容加载失败，请检查网络'));
    var retry = el('button', 'retry', '重试');
    retry.type = 'button';
    retry.addEventListener('click', function () {
      card.parentNode.removeChild(card);
      load();
    });
    inner.appendChild(retry);
    card.appendChild(inner);
    document.body.appendChild(card);
  }

  /* ---------- 加载数据 ---------- */
  function load() {
    fetch('data/content.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(render)
      .catch(showError);
  }

  load();
})();
