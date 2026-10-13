/* =========================================================
   「我们的999天」管理后台
   纯静态实现：GitHub Token 登录 → Contents API 拉取/提交
   data/content.json → Pages 自动重新部署（约 1 分钟生效）。
   原生 JS，兼容 ES2019，无外部依赖。
   ========================================================= */
(function () {
  'use strict';

  /* ============ 常量 ============ */
  var API_BASE = 'https://api.github.com';
  var TOKEN_KEY = 'love999_admin_token';
  var MAX_EDGE = 1600;        // 图片长边上限（px）
  var JPEG_QUALITY = 0.85;    // 压缩质量
  var DEPLOY_INTERVAL = 5000; // 部署轮询间隔（ms）
  var DEPLOY_TIMEOUT = 90000; // 部署确认最长等待（ms）

  // 新仓库还没有 data/content.json 时使用的内置默认模板
  //（schema 与 data/content.json 完全相同）
  var DEFAULT_DATA = {
    startDate: '2024-01-19',
    hero: {
      image: 'images/hero.jpg',
      badge: '2024.01.19 ❤',
      bigNumber: '999',
      title: '我们的第 999 天',
      subtitle: '每一天，都因为是你而值得纪念',
      scrollHint: '向下滑动，开启我们的故事'
    },
    pages: [
      {
        id: 'meet',
        type: 'story',
        date: '2024.01.19',
        title: '初次相识',
        text: '故事的开始总是刚刚好。那天我们第一次见面，谁也没想到，一次普通的相遇，会变成往后余生的每一天。',
        image: 'images/p2.jpg'
      },
      {
        id: 'first-date',
        type: 'story',
        date: '',
        title: '第一次约会',
        text: '紧张又期待的一天。出门前换了三套衣服，见面时还要假装淡定。后来才知道，原来你也在来的路上偷偷练习了很多句话。',
        image: 'images/p3.jpg'
      },
      {
        id: 'first-trip',
        type: 'story',
        date: '',
        title: '第一次旅行',
        text: '第一次一起去看远方的风景。地图上陌生的城市，因为有你在身边，变成了这世界上最温柔的地方。',
        image: 'images/p4.jpg'
      },
      {
        id: 'first-birthday',
        type: 'story',
        date: '',
        title: '第一次一起过生日',
        text: '许愿的时候偷偷看了你一眼。其实愿望特别简单：希望以后的每一个生日，吹灭蜡烛时，身边的人都是你。',
        image: 'images/p5.jpg'
      },
      {
        id: 'first-newyear',
        type: 'story',
        date: '',
        title: '一起的第一个新年',
        text: '跨年的烟花很美，但不及回头看你的那一眼。新的一年，和往后的每一年，都请多多指教。',
        image: 'images/p6.jpg'
      },
      {
        id: 'future',
        type: 'story',
        date: '',
        title: '未来宣言',
        text: '999 天只是一个小小的开始。下一个 999 天，第 1999 天，第 2999 天……依然是你，只好是你，必须是你。',
        image: 'images/p7.jpg'
      },
      {
        id: 'counter',
        type: 'counter',
        date: '',
        title: '未完待续',
        text: '我们的故事每天都在更新。今天，是我们在一起的第——',
        image: 'images/p8.jpg'
      }
    ],
    footer: '❤ 2024.01.19 起 · 每一天都算数'
  };

  /* ============ 状态 ============ */
  var state = {
    token: '',
    owner: '',
    repo: '',
    data: null,           // 正在编辑的内容对象
    sha: null,            // content.json 当前 blob sha（提交时用）
    dirty: false,         // 是否有未发布的修改
    publishing: false,    // 发布进行中（防重复提交）
    pendingImages: {},    // 待上传图片：新路径 -> base64（不含 dataURL 前缀）
    previewCache: {},     // 已上传图片的本地预览缓存：路径 -> dataURL
    pickTarget: null      // 本次选图要写入的位置
  };

  /* ============ DOM 引用 ============ */
  function $(id) { return document.getElementById(id); }

  var loginView = $('loginView'), loginForm = $('loginForm'),
      tokenInput = $('tokenInput'), ownerInput = $('ownerInput'),
      repoInput = $('repoInput'), rememberChk = $('rememberChk'),
      loginBtn = $('loginBtn'),
      editorView = $('editorView'), editorMain = $('editorMain'),
      statusText = $('statusText'), repoLabel = $('repoLabel'),
      siteLink = $('siteLink'), logoutBtn = $('logoutBtn'),
      publishBtn = $('publishBtn'),
      heroPreview = $('heroPreview'),
      heroBadge = $('heroBadge'), heroBigNumber = $('heroBigNumber'),
      heroTitle = $('heroTitle'), heroSubtitle = $('heroSubtitle'),
      heroScrollHint = $('heroScrollHint'),
      startDateInput = $('startDateInput'), dayCount = $('dayCount'),
      pagesList = $('pagesList'), addPageBtn = $('addPageBtn'),
      footerInput = $('footerInput'),
      imgInput = $('imgInput'), toastBox = $('toastBox');

  /* ============ 小工具 ============ */

  // HTML 转义（值会拼进 innerHTML，必须转义）
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // 字符串 -> base64（中文安全：先转 UTF-8 字节）
  function utf8ToB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // base64 -> 字符串（正确按 UTF-8 解码，处理中文）
  function b64ToUtf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (window.TextDecoder) return new TextDecoder('utf-8').decode(bytes);
    return decodeURIComponent(escape(bin)); // 旧浏览器兜底
  }

  function setStatus(text) { statusText.textContent = text || ''; }

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = msg;
    toastBox.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 320);
    }, 3000);
  }

  /* ============ GitHub API ============ */

  // 统一请求：非 2xx 抛错（err.status / err.network），2xx 返回 JSON
  async function ghApi(method, path, body) {
    var opts = {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + state.token,
        'Accept': 'application/vnd.github+json'
      }
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res;
    try {
      res = await fetch(API_BASE + '/repos/' + state.owner + '/' + state.repo + path, opts);
    } catch (e) {
      throw { network: true, message: '网络错误' };
    }
    var json = null;
    if (res.status !== 204) {
      try { json = await res.json(); } catch (e) { /* 忽略解析失败 */ }
    }
    if (!res.ok) {
      var msg = (json && json.message) ? json.message : ('HTTP ' + res.status);
      throw { status: res.status, message: msg };
    }
    return json;
  }

  // 上传一张图片；若路径已存在（覆盖）必须带原文件 sha
  async function uploadImage(path, b64) {
    var body = { message: '上传图片 ✨', content: b64 };
    try {
      var meta = await ghApi('GET', '/contents/' + path);
      if (meta && meta.sha) body.sha = meta.sha;
    } catch (e) {
      if (e.status !== 404) throw e; // 404 = 新文件，无需 sha
    }
    await ghApi('PUT', '/contents/' + path, body);
  }

  /* ============ 登录 / 登出 ============ */

  // 从地址自动识别 owner / repo（GitHub Pages）
  function detectOwnerRepo() {
    var host = location.hostname || '';
    var m = host.match(/^([a-zA-Z0-9-]+)\.github\.io$/);
    if (!m) return { owner: '', repo: '' }; // 本地预览或自定义域名：手填
    var owner = m[1];
    var repo = '';
    var seg = (location.pathname || '/').split('/')[1] || '';
    if (seg && seg.indexOf('.') === -1) repo = seg; // 项目页：/love_story/admin.html
    else repo = host;                               // 用户主页：<owner>.github.io 仓库
    return { owner: owner, repo: repo };
  }

  async function doLogin() {
    var token = tokenInput.value.trim();
    var owner = ownerInput.value.trim();
    var repo = repoInput.value.trim();
    if (!token) { toast('请粘贴 GitHub Token', 'error'); return; }
    if (!owner || !repo) { toast('请填写仓库的 owner 与 repo', 'error'); return; }

    loginBtn.disabled = true;
    loginBtn.textContent = '验证中…';
    try {
      // 登录校验 = 用 Token 请求当前用户信息
      var res = await fetch(API_BASE + '/user', {
        headers: {
          'Authorization': 'Bearer ' + token,
          'Accept': 'application/vnd.github+json'
        }
      });
      if (res.status === 401) { toast('Token 无效或已过期，请检查后重试', 'error'); return; }
      if (!res.ok) { toast('GitHub 校验失败（HTTP ' + res.status + '）', 'error'); return; }
      var user = await res.json();

      state.token = token;
      state.owner = owner;
      state.repo = repo;
      // 先确认仓库存在且 Token 有权访问：仓库不存在也是 404，
      // 不先验证会静默落入「新仓库默认模板」分支，让人以为连上了
      try {
        await ghApi('GET', '');
      } catch (e) {
        state.token = ''; state.owner = ''; state.repo = '';
        toast('仓库 ' + owner + '/' + repo + ' 不存在或无权访问，请检查拼写', 'error');
        return;
      }
      if (rememberChk.checked) localStorage.setItem(TOKEN_KEY, token);
      else {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.setItem(TOKEN_KEY, token);
      }

      repoLabel.textContent = owner + ' / ' + repo;
      refreshSiteLink();
      toast('欢迎回来，' + (user.name || user.login), 'success');
      loginView.hidden = true;
      editorView.hidden = false;
      setEditorLoading(true);
      loadContent();
    } catch (e) {
      toast('网络错误，无法连接 GitHub API', 'error');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = '登 录';
    }
  }

  function doLogout(force) {
    if (state.publishing) { toast('正在发布中，请稍候', 'info'); return; }
    if (!force && state.dirty && !confirm('有未发布的修改，确定要登出吗？')) return;
    localStorage.removeItem(TOKEN_KEY);   // 登出清掉存储的 token
    sessionStorage.removeItem(TOKEN_KEY);
    state.token = '';
    state.data = null;
    state.sha = null;
    state.dirty = false;
    state.publishing = false;
    state.pendingImages = {};
    state.previewCache = {};
    state.pickTarget = null;
    tokenInput.value = '';
    editorView.hidden = true;
    loginView.hidden = false;
    repoLabel.textContent = '';
    setStatus('未登录');
  }

  /* ============ 数据加载 ============ */

  function setEditorLoading(on) {
    editorMain.classList.toggle('loading', !!on);
  }

  // 补全字段，避免远端数据缺字段时渲染报错
  function normalizeData(d) {
    if (!d || typeof d !== 'object') throw new Error('数据格式不正确');
    if (typeof d.startDate !== 'string') d.startDate = '';
    if (!d.hero || typeof d.hero !== 'object') d.hero = {};
    var heroKeys = ['image', 'badge', 'bigNumber', 'title', 'subtitle', 'scrollHint'];
    for (var i = 0; i < heroKeys.length; i++) {
      var k = heroKeys[i];
      if (typeof d.hero[k] !== 'string') d.hero[k] = '';
    }
    if (!Array.isArray(d.pages)) d.pages = [];
    d.pages.forEach(function (p, i) {
      if (!p || typeof p !== 'object') p = d.pages[i] = {}; // 坏数据原位替换
      p.type = p.type || 'story';
      p.date = p.date || '';
      p.title = p.title || '';
      p.text = p.text || '';
      p.image = p.image || '';
      if (!p.id) p.id = 'page-' + Math.random().toString(36).slice(2, 8);
    });
    if (typeof d.footer !== 'string') d.footer = '';
    return d;
  }

  async function loadContent() {
    setStatus('内容加载中…');
    try {
      var res = await ghApi('GET', '/contents/data/content.json');
      state.data = normalizeData(JSON.parse(b64ToUtf8(res.content)));
      state.sha = res.sha;
      afterDataLoaded();
      setStatus('已加载线上内容');
    } catch (err) {
      if (err && err.status === 404) {
        // 新仓库还没有 content.json：使用内置默认模板
        state.data = normalizeData(JSON.parse(JSON.stringify(DEFAULT_DATA)));
        state.sha = null;
        afterDataLoaded();
        setStatus('默认模板 · 尚未发布');
        toast('远端还没有 content.json，已载入默认模板', 'info');
      } else if (err && err.status === 401) {
        toast('登录已过期，请重新登录', 'error');
        doLogout(true);
      } else {
        setEditorLoading(false);
        setStatus('加载失败，请刷新页面重试');
        toast((err && err.network) ? '网络错误，加载失败'
          : ('加载失败：' + ((err && err.message) || '未知错误')), 'error');
      }
    }
  }

  function afterDataLoaded() {
    state.dirty = false;
    state.pendingImages = {};
    state.previewCache = {};
    setEditorLoading(false);
    refreshPublishBtn();
    renderAll();
  }

  /* ============ 渲染 ============ */

  // 图片预览地址：待上传用本地 dataURL，其余用站点相对路径
  function resolveImgSrc(path) {
    if (!path) return '';
    if (state.pendingImages[path]) return 'data:image/jpeg;base64,' + state.pendingImages[path];
    if (state.previewCache[path]) return state.previewCache[path];
    return path;
  }

  function imgPreviewHtml(path, act) {
    var src = resolveImgSrc(path);
    var inner = src
      ? '<img src="' + escapeHtml(src) + '" alt="">'
      : '<div class="img-empty">未设置图片</div>';
    return '<div class="img-preview">' + inner +
      '<button type="button" class="btn-change" data-act="' + act + '">更换图片</button></div>';
  }

  function renderAll() {
    renderHero();
    renderAnniversary();
    renderPages();
    renderFooter();
    refreshSiteLink();
  }

  function renderHero() {
    var h = state.data.hero;
    heroBadge.value = h.badge;
    heroBigNumber.value = h.bigNumber;
    heroTitle.value = h.title;
    heroSubtitle.value = h.subtitle;
    heroScrollHint.value = h.scrollHint;
    heroPreview.innerHTML = imgPreviewHtml(h.image, 'hero');
  }

  // 纪念日：实时预览「已在一起 N 天」（第一天记为第 1 天）
  function calcDays(startDate) {
    if (!startDate) return 0;
    var start = Date.parse(startDate + 'T00:00:00'); // 本地零点
    if (isNaN(start)) return 0;
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.floor((today - start) / 86400000) + 1;
  }

  function renderAnniversary() {
    startDateInput.value = state.data.startDate;
    updateDayPreview();
  }

  function updateDayPreview() {
    var n = calcDays(state.data ? state.data.startDate : '');
    dayCount.textContent = n > 0 ? String(n) : '-';
  }

  function renderFooter() {
    footerInput.value = state.data.footer;
  }

  // textarea 自适应高度
  function autosize(t) {
    t.style.height = 'auto';
    t.style.height = (t.scrollHeight + 2) + 'px';
  }

  function autosizeAll() {
    var list = pagesList.querySelectorAll('textarea');
    for (var i = 0; i < list.length; i++) autosize(list[i]);
  }

  function renderPages() {
    var total = state.data.pages.length;
    var html = '';
    for (var i = 0; i < total; i++) {
      var p = state.data.pages[i];
      // 页与页之间的「在此添加一页」分隔按钮（第 1 屏之前不用，底部另有追加按钮）
      if (i > 0) {
        html += '<button type="button" class="btn-insert" data-act="insert" data-idx="' + i +
          '" title="在这两页之间插入一页">＋ 在此添加一页</button>';
      }
      html += '<div class="page-card" data-idx="' + i + '">' +
        '<div class="page-head">' +
          '<span class="page-num">第 ' + (i + 1) + ' 屏' +
            (p.type === 'counter' ? ' · 计数页' : '') + '</span>' +
          '<span class="page-actions">' +
            '<button type="button" class="btn-icon" data-act="up" title="上移"' +
              (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="btn-icon" data-act="down" title="下移"' +
              (i === total - 1 ? ' disabled' : '') + '>↓</button>' +
            '<button type="button" class="btn-icon btn-del" data-act="del" title="删除">删除</button>' +
          '</span>' +
        '</div>' +
        imgPreviewHtml(p.image, 'img') +
        '<input type="text" class="p-date" placeholder="日期（可空，如 2024.01.19）" value="' +
          escapeHtml(p.date) + '">' +
        '<input type="text" class="p-title" placeholder="标题" value="' +
          escapeHtml(p.title) + '">' +
        '<textarea class="p-text" placeholder="正文">' + escapeHtml(p.text) + '</textarea>' +
        '</div>';
    }
    pagesList.innerHTML = html;
    autosizeAll();
  }

  /* ============ 编辑操作 ============ */

  function refreshPublishBtn() {
    publishBtn.disabled = !state.dirty || state.publishing;
  }

  // 顶栏状态文案（未在发布流程中时）
  function idleStatus() {
    if (!state.data) return '';
    if (!state.dirty) return '已加载 · 与线上一致';
    var n = Object.keys(state.pendingImages).length;
    return '有未发布的修改' + (n ? '（含 ' + n + ' 张新图片）' : '');
  }

  function markDirty() {
    state.dirty = true;
    refreshPublishBtn();
    setStatus(idleStatus());
  }

  // 单个输入框 <-> 数据字段的双向绑定
  function bindField(input, apply) {
    var handler = function () {
      if (!state.data) return;
      apply(input.value);
      markDirty();
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  }

  function movePage(idx, delta) {
    var arr = state.data.pages;
    var to = idx + delta;
    if (to < 0 || to >= arr.length) return;
    var tmp = arr[idx];
    arr[idx] = arr[to];
    arr[to] = tmp;
    markDirty();
    renderPages();
  }

  function removePage(idx) {
    var p = state.data.pages[idx];
    if (!p) return;
    if (!confirm('确定删除「' + (p.title || '未命名') + '」这一页吗？')) return;
    // 刚选过还没上传的图片一并移出待上传队列
    if (p.image && state.pendingImages[p.image]) delete state.pendingImages[p.image];
    state.data.pages.splice(idx, 1);
    markDirty();
    renderPages();
    toast('已删除，发布后生效', 'info');
  }

  // 在指定位置插入一张空白页（分隔按钮「＋ 在此添加一页」/ 底部追加按钮共用）
  function insertPageAt(idx) {
    state.data.pages.splice(idx, 0, {
      id: 'page-' + Date.now(),
      type: 'story',
      date: '',
      title: '',
      text: '',
      image: ''
    });
    markDirty();
    renderPages();
    var cards = pagesList.querySelectorAll('.page-card');
    var card = cards[idx];
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var t = card.querySelector('.p-title');
      if (t) t.focus();
    }
    toast('已添加，填写内容后记得发布', 'info');
  }

  function addPage() {
    insertPageAt(state.data.pages.length);
  }

  /* ============ 图片选择与压缩 ============ */

  function pickImage(target) {
    state.pickTarget = target; // {kind:'hero'} 或 {kind:'page', index:n}
    imgInput.click();
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('读取失败')); };
      r.readAsDataURL(file);
    });
  }

  function loadImageEl(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('解码失败')); };
      img.src = src;
    });
  }

  // 等比缩放（长边 <= 1600）后编码为 JPEG dataURL
  async function fileToJpegDataUrl(file) {
    var bitmap = null;
    if (window.createImageBitmap) {
      try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (e) { bitmap = null; }
    }
    var source, w, h;
    if (bitmap) {
      source = bitmap;
      w = bitmap.width;
      h = bitmap.height;
    } else {
      var url = await readAsDataURL(file);
      var img = await loadImageEl(url);
      source = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    }
    var scale = Math.min(1, MAX_EDGE / Math.max(w, h, 1));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext('2d').drawImage(source, 0, 0, cw, ch);
    var dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    if (bitmap && bitmap.close) bitmap.close();
    return dataUrl;
  }

  // 新图片文件名：images/u{yyyymmdd}-{HHmmss}-{4位随机}.jpg（u 开头避免与占位图 p*.jpg 重名）
  function genImageName() {
    var d = new Date();
    var stamp = '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var rnd = '';
    for (var i = 0; i < 4; i++) {
      rnd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'images/u' + stamp + '-' + rnd + '.jpg';
  }

  /* ============ 发布流程 ============ */

  // 轮询 raw 地址，与刚提交的内容逐字比对，确认部署生效
  function waitDeployed(expected, timeoutMs) {
    return new Promise(function (resolve) {
      var start = Date.now();
      var timer = setInterval(check, DEPLOY_INTERVAL);
      function finish(ok) {
        clearInterval(timer);
        resolve(ok);
      }
      function check() {
        if (Date.now() - start >= timeoutMs) { finish(false); return; }
        fetch('https://raw.githubusercontent.com/' + state.owner + '/' + state.repo +
          '/main/data/content.json?t=' + Date.now())
          .then(function (r) { return r.ok ? r.text() : Promise.reject(new Error('http ' + r.status)); })
          .then(function (txt) { if (txt === expected) finish(true); })
          .catch(function () { /* 未生效或网络抖动，继续轮询 */ });
      }
    });
  }

  async function publish() {
    if (state.publishing || !state.dirty || !state.data) return;
    state.publishing = true;
    refreshPublishBtn();
    try {
      // 1. 逐张上传新图片（只传最终仍被引用的，中途被换掉的跳过）
      var refed = {};
      if (state.data.hero.image) refed[state.data.hero.image] = true;
      state.data.pages.forEach(function (p) { if (p.image) refed[p.image] = true; });
      var paths = Object.keys(state.pendingImages).filter(function (p) { return refed[p]; });
      for (var i = 0; i < paths.length; i++) {
        setStatus('发布中 · 图片 ' + (i + 1) + '/' + paths.length);
        await uploadImage(paths[i], state.pendingImages[paths[i]]);
      }

      // 2. 重新拉取最新 sha（防别处已改），再提交 content.json
      setStatus('发布中 · 提交内容…');
      var jsonStr = JSON.stringify(state.data, null, 2);
      var body = {
        message: '更新网站内容 ✨ ' + todayStr(),
        content: utf8ToB64(jsonStr)
      };
      try {
        var meta = await ghApi('GET', '/contents/data/content.json');
        if (meta && meta.sha) body.sha = meta.sha;
      } catch (e) {
        if (e.status !== 404) throw e; // 404 = 首次创建，无需 sha
      }
      var saved = await ghApi('PUT', '/contents/data/content.json', body);
      if (saved && saved.content && saved.content.sha) state.sha = saved.content.sha;

      // 3. 等待 Pages 部署生效
      setStatus('已提交，等待部署…');
      var deployed = await waitDeployed(jsonStr, DEPLOY_TIMEOUT);

      // 4. 收尾：dirty 复位、预览缓存、sha 刷新
      state.dirty = false;
      for (var k in state.pendingImages) {
        state.previewCache[k] = 'data:image/jpeg;base64,' + state.pendingImages[k];
      }
      state.pendingImages = {};
      refreshPublishBtn();
      if (deployed) {
        setStatus('已上线 ✓（约 1 分钟内访客可见）');
        toast('发布成功，已上线', 'success');
      } else {
        setStatus('已提交，部署中，稍后自动生效');
        toast('内容已提交，部署稍后自动完成', 'info');
      }
    } catch (err) {
      if (err && err.status === 401) {
        setStatus('登录过期');
        toast('登录已过期，请重新登录', 'error');
      } else if (err && (err.status === 409 || err.status === 422)) {
        setStatus('发布冲突');
        toast('远端已有更新，请刷新重新编辑', 'error');
      } else if (err && err.network) {
        setStatus('发布失败');
        toast('网络错误，请检查网络后重试', 'error');
      } else {
        setStatus('发布失败');
        toast('发布失败：' + ((err && err.message) || '未知错误'), 'error');
      }
    } finally {
      state.publishing = false;
      refreshPublishBtn();
    }
  }

  /* ============ 站点链接 ============ */

  function siteUrl() {
    if (!state.repo) return '';
    if (/\.github\.io$/.test(state.repo)) return 'https://' + state.repo + '/';
    if (!state.owner) return '';
    return 'https://' + state.owner + '.github.io/' + state.repo + '/';
  }

  function refreshSiteLink() {
    var url = siteUrl();
    if (url) {
      siteLink.href = url;
      siteLink.hidden = false;
    } else {
      siteLink.hidden = true;
    }
  }

  /* ============ 事件绑定 ============ */

  function bindLogin() {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      doLogin();
    });
  }

  function bindEditor() {
    // 顶栏
    logoutBtn.addEventListener('click', function () { doLogout(false); });
    publishBtn.addEventListener('click', publish);

    // 封面
    heroPreview.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.btn-change')) pickImage({ kind: 'hero' });
    });
    bindField(heroBadge, function (v) { state.data.hero.badge = v; });
    bindField(heroBigNumber, function (v) { state.data.hero.bigNumber = v; });
    bindField(heroTitle, function (v) { state.data.hero.title = v; });
    bindField(heroSubtitle, function (v) { state.data.hero.subtitle = v; });
    bindField(heroScrollHint, function (v) { state.data.hero.scrollHint = v; });

    // 纪念日
    bindField(startDateInput, function (v) {
      state.data.startDate = v;
      updateDayPreview();
    });

    // 页脚
    bindField(footerInput, function (v) { state.data.footer = v; });

    // 页面列表：输入用事件委托（不整块重渲染，避免丢失焦点）
    pagesList.addEventListener('input', function (e) {
      var t = e.target;
      if (!state.data || !t.classList) return;
      var card = t.closest ? t.closest('.page-card') : null;
      if (!card) return;
      var page = state.data.pages[Number(card.getAttribute('data-idx'))];
      if (!page) return;
      if (t.classList.contains('p-date')) page.date = t.value;
      else if (t.classList.contains('p-title')) page.title = t.value;
      else if (t.classList.contains('p-text')) {
        page.text = t.value;
        autosize(t);
      } else return;
      markDirty();
    });

    // 页面列表：按钮（在此插入 / 更换图片 / 上移 / 下移 / 删除）
    pagesList.addEventListener('click', function (e) {
      var btn = (e.target.closest) ? e.target.closest('button') : null;
      if (!btn || !pagesList.contains(btn)) return;
      var act = btn.getAttribute('data-act');
      if (!act) return;
      // 插入按钮不在 page-card 内，先于卡片查找处理
      if (act === 'insert') {
        insertPageAt(Number(btn.getAttribute('data-idx')));
        return;
      }
      var card = btn.closest('.page-card');
      if (!card) return;
      var idx = Number(card.getAttribute('data-idx'));
      if (act === 'img') pickImage({ kind: 'page', index: idx });
      else if (act === 'up') movePage(idx, -1);
      else if (act === 'down') movePage(idx, 1);
      else if (act === 'del') removePage(idx);
    });

    addPageBtn.addEventListener('click', addPage);

    // 选图：压缩后进入待上传队列，并写入对应位置
    imgInput.addEventListener('change', function () {
      var file = (this.files && this.files[0]) || null;
      var target = state.pickTarget;
      this.value = '';
      if (!file || !target) return;
      if (file.type && file.type.indexOf('image/') !== 0) {
        toast('请选择图片文件', 'error');
        return;
      }
      toast('正在压缩图片…', 'info');
      fileToJpegDataUrl(file).then(function (dataUrl) {
        var path = genImageName();
        state.pendingImages[path] = dataUrl.slice(dataUrl.indexOf(',') + 1);
        if (target.kind === 'hero') {
          state.data.hero.image = path;
          renderHero();
        } else if (state.data.pages[target.index]) {
          state.data.pages[target.index].image = path;
          renderPages();
        }
        markDirty();
      }).catch(function () {
        toast('图片读取失败，请换一张试试', 'error');
      });
    });

    // 预览图加载失败（如本地预览时占位图不存在）时给出提示样式
    document.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.parentElement) {
        t.style.display = 'none';
        t.parentElement.classList.add('img-broken');
      }
    }, true);

    // 有未发布的修改时，离开页面前确认
    window.addEventListener('beforeunload', function (e) {
      if (state.dirty && !state.publishing) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ============ 初始化 ============ */

  function init() {
    bindLogin();
    bindEditor();
    // 记住的 token 预填（localStorage 优先，其次 sessionStorage）
    var saved = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    if (saved) tokenInput.value = saved;
    // owner / repo 从地址自动识别，识别失败留空手填
    var det = detectOwnerRepo();
    if (det.owner) ownerInput.value = det.owner;
    if (det.repo) repoInput.value = det.repo;
  }

  init();
})();
