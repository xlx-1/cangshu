const API_BASE = '';

let currentArticle = null;
let siteConfig = null;
let siteCreateTime = new Date('2026-01-01T00:00:00').getTime();

function proxyGitHubUrl(url) {
  if (!url) return url;
  if (url.startsWith('https://raw.githubusercontent.com/') || url.startsWith('https://github.com/')) {
    return 'https://gh-proxy.org/' + url;
  }
  return url;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function fetchSiteConfig() {
  try {
    const response = await fetch(`${API_BASE}/api/config`);
    const data = await response.json();
    if (data) {
      siteConfig = data;
      if (siteConfig.create_time) {
        siteCreateTime = new Date(siteConfig.create_time).getTime();
      } else if (siteConfig.startDate) {
        siteCreateTime = new Date(siteConfig.startDate).getTime();
      }
      applySiteConfig();
    }
  } catch (err) {
    console.warn('加载网站配置失败:', err);
  }
}

function applySiteConfig() {
  if (!siteConfig) return;

  if (siteConfig.title) {
    document.title = `${siteConfig.title}`;
    const siteNameEl = document.querySelector('.site-name');
    if (siteNameEl) siteNameEl.textContent = siteConfig.title.replace('🐹', '').trim();
  }
  if (siteConfig.description) {
    const introEl = document.querySelector('.site-intro');
    if (introEl) introEl.textContent = siteConfig.description;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', siteConfig.description);
  }
  if (siteConfig.images?.avatar) {
    const avatarEl = document.querySelector('.avatar');
    if (avatarEl) avatarEl.src = proxyGitHubUrl(siteConfig.images.avatar);
  }
  if (siteConfig.mood?.emoji || siteConfig.mood?.text || siteConfig.mood?.quote) {
    // mood在首页显示，文章页不需要
  }
}

function getArticleId() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  return id ? parseInt(id) : null;
}

async function loadArticle() {
  const articleId = getArticleId();
  const container = document.getElementById('articleContainer');
  
  if (!articleId) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <span style="font-size: 48px;">🐹</span>
        <h2 style="margin: 16px 0 8px; font-family: var(--font-display); color: var(--text-dark);">文章不存在</h2>
        <p style="color: var(--text-medium); margin-bottom: 24px;">找不到这篇文章哦，去首页看看吧~</p>
        <a href="/" class="back-home-btn">🏠 返回首页</a>
      </div>
    `;
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/articles/${articleId}`);
    const data = await response.json();
    
    if (data.article) {
      currentArticle = data.article;
      renderArticle(data.article);
    } else {
      throw new Error('文章不存在');
    }
  } catch (err) {
    console.error('加载文章失败:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <span style="font-size: 48px;">😢</span>
        <h2 style="margin: 16px 0 8px; font-family: var(--font-display); color: var(--text-dark);">加载失败</h2>
        <p style="color: var(--text-medium); margin-bottom: 24px;">小仓鼠搬不动文章了，稍后再试试吧~</p>
        <a href="/" class="back-home-btn">🏠 返回首页</a>
      </div>
    `;
  }
}

function renderArticle(article) {
  const container = document.getElementById('articleContainer');
  
  document.title = `${article.title} - 仓鼠小窝 🐹`;
  
  const tagsHtml = (article.tags && article.tags.length > 0) ? `
    <div class="article-footer-tags">
      ${article.tags.map(tag => `<span class="article-tag">🏷️ ${escapeHtml(tag)}</span>`).join('')}
    </div>
  ` : '';
  
  const coverHtml = article.cover ? `
    <div class="article-page-cover">
      <img src="${proxyGitHubUrl(article.cover)}" alt="${escapeHtml(article.title)}">
    </div>
  ` : '';
  
  const contentHtml = renderMarkdown(article.content || '');
  
  container.innerHTML = `
    <header class="article-header">
      <h1 class="article-page-title">${escapeHtml(article.title)}</h1>
      <div class="article-page-meta">
        <span class="meta-item">📅 ${formatDate(article.created_at)}</span>
        <span class="meta-item">👁 ${article.views || 0} 阅读</span>
        <span class="meta-item">💬 ${article.comments || 0} 评论</span>
      </div>
    </header>
    
    ${coverHtml}
    
    <div class="article-content">
      ${contentHtml}
    </div>
    
    <footer class="article-footer">
      ${tagsHtml}
      <div class="article-footer-actions">
        <a href="/" class="back-home-btn">← 返回首页</a>
        <button class="article-action-btn like-btn ${article.liked ? 'liked' : ''}" id="likeBtn">
          ${article.liked ? '❤️' : '🤍'} <span>${article.likes || 0}</span>
        </button>
      </div>
    </footer>
  `;
  
  const likeBtn = document.getElementById('likeBtn');
  if (likeBtn) {
    likeBtn.addEventListener('click', handleLike);
  }
}

function renderMarkdown(content) {
  if (!content) return '<p style="text-align: center; color: var(--text-light);">这篇文章还没有内容哦~ 🐾</p>';
  
  const lines = content.split('\n');
  let html = '';
  let inCodeBlock = false;
  let codeBlockContent = '';
  let codeLang = '';
  let inBlockquote = false;
  let blockquoteContent = '';
  let inList = false;
  let listType = null;
  let listContent = '';
  let paragraphLines = [];
  
  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const text = paragraphLines.join('<br>');
      html += `<p>${text}</p>\n`;
      paragraphLines = [];
    }
  };
  
  const flushList = () => {
    if (inList && listContent) {
      const tag = listType === 'ol' ? 'ol' : 'ul';
      html += `<${tag}>\n${listContent}</${tag}>\n`;
      inList = false;
      listType = null;
      listContent = '';
    }
  };
  
  const flushBlockquote = () => {
    if (inBlockquote && blockquoteContent) {
      html += `<blockquote>${blockquoteContent.trim()}</blockquote>\n`;
      inBlockquote = false;
      blockquoteContent = '';
    }
  };
  
  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };
  
  const processInline = (text) => {
    let result = escapeHtml(text);
    return result
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => `<img src="${proxyGitHubUrl(url)}" alt="${alt}">`)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  };
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre><code>${escapeHtml(codeBlockContent)}</code></pre>\n`;
        inCodeBlock = false;
        codeBlockContent = '';
        codeLang = '';
      } else {
        flushParagraph();
        flushList();
        flushBlockquote();
        inCodeBlock = true;
        codeLang = trimmed.substring(3).trim();
      }
      continue;
    }
    
    if (inCodeBlock) {
      codeBlockContent += (codeBlockContent ? '\n' : '') + line;
      continue;
    }
    
    if (trimmed.startsWith('# ')) {
      flushParagraph();
      flushList();
      flushBlockquote();
      html += `<h1>${processInline(trimmed.substring(2))}</h1>\n`;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      flushParagraph();
      flushList();
      flushBlockquote();
      html += `<h2>${processInline(trimmed.substring(3))}</h2>\n`;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      flushParagraph();
      flushList();
      flushBlockquote();
      html += `<h3>${processInline(trimmed.substring(4))}</h3>\n`;
      continue;
    }
    
    if (trimmed === '---' || trimmed === '***') {
      flushParagraph();
      flushList();
      flushBlockquote();
      html += '<hr>\n';
      continue;
    }
    
    if (trimmed.startsWith('> ')) {
      flushParagraph();
      flushList();
      if (inBlockquote) {
        blockquoteContent += '<br>' + processInline(trimmed.substring(2));
      } else {
        inBlockquote = true;
        blockquoteContent = processInline(trimmed.substring(2));
      }
      continue;
    } else {
      flushBlockquote();
    }
    
    const ulMatch = trimmed.match(/^[-*] (.+)$/);
    const olMatch = trimmed.match(/^\d+\. (.+)$/);
    if (ulMatch || olMatch) {
      flushParagraph();
      flushBlockquote();
      const itemText = ulMatch ? ulMatch[1] : olMatch[1];
      const newListType = olMatch ? 'ol' : 'ul';
      
      if (!inList || listType !== newListType) {
        flushList();
        inList = true;
        listType = newListType;
      }
      listContent += `  <li>${processInline(itemText)}</li>\n`;
      continue;
    } else {
      flushList();
    }
    
    if (trimmed === '') {
      flushParagraph();
      continue;
    }
    
    paragraphLines.push(processInline(line));
  }
  
  flushParagraph();
  flushList();
  flushBlockquote();
  if (inCodeBlock && codeBlockContent) {
    html += `<pre><code>${escapeHtml(codeBlockContent)}</code></pre>\n`;
  }
  
  return html;
}

async function handleLike(e) {
  if (!currentArticle) return;
  
  const btn = e.currentTarget;
  const countSpan = btn.querySelector('span');
  const liked = btn.classList.contains('liked');
  
  if (liked) {
    currentArticle.liked = false;
    currentArticle.likes = (currentArticle.likes || 0) - 1;
    btn.classList.remove('liked');
    btn.innerHTML = `🤍 <span>${currentArticle.likes}</span>`;
  } else {
    currentArticle.liked = true;
    currentArticle.likes = (currentArticle.likes || 0) + 1;
    btn.classList.add('liked');
    btn.innerHTML = `❤️ <span>${currentArticle.likes}</span>`;
    
    const heart = document.createElement('span');
    heart.textContent = '💕';
    const rect = btn.getBoundingClientRect();
    heart.style.cssText = `
      position: fixed;
      left: ${rect.left + rect.width / 2}px;
      top: ${rect.top}px;
      font-size: 24px;
      pointer-events: none;
      z-index: 9999;
      animation: floatHeart 1s ease-out forwards;
    `;
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 1000);
  }
  
  try {
    await fetch(`${API_BASE}/api/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: currentArticle.id })
    });
  } catch (err) {
    console.warn('点赞请求失败:', err);
  }
}

function initBackToTop() {
  const btn = document.getElementById('backToTop');
  if (!btn) return;
  
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  });
  
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function fetchDailyQuote() {
  const hitokotoText = document.getElementById('hitokoto-text');
  const hitokotoFrom = document.getElementById('hitokoto-from');
  
  if (!hitokotoText) return;
  
  const categories = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  
  try {
    const response = await fetch(`https://v1.hitokoto.cn/?c=${randomCategory}`);
    const data = await response.json();
    
    hitokotoText.textContent = data.hitokoto || '今天也要开心呀！';
    const from = data.from || '佚名';
    const fromWho = data.from_who || '';
    hitokotoFrom.textContent = `—— ${fromWho ? fromWho + '《' + from + '》' : '《' + from + '》'}`;
  } catch (err) {
    hitokotoText.textContent = '生活总会有不期而遇的温暖 🐹';
    hitokotoFrom.textContent = '—— 仓鼠小窝';
  }
}

function updateRuntime() {
  const now = Date.now();
  const diff = now - siteCreateTime;
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  const runtimeEl = document.getElementById('siteRuntime');
  if (runtimeEl) {
    runtimeEl.textContent = `${days} 天 ${hours} 时 ${minutes} 分 ${seconds} 秒`;
  }
}

function initHamsterSticker() {
  const btn = document.getElementById('hamsterBtn');
  const modal = document.getElementById('hamsterModal');
  const closeBtn = document.getElementById('modalClose');
  const modalBtn = document.getElementById('modalBtn');
  
  if (!btn || !modal) return;
  
  const messages = [
    { emoji: '🐹', title: '你发现啦！', text: '恭喜你找到了隐藏的仓鼠！<br>送你一颗好运瓜子 🌻<br>愿你今天也开开心心~' },
    { emoji: '🐹', title: '戳到我啦！', text: '哎呀呀，被发现了~<br>仓鼠正在忙着吃瓜子呢 🌻<br>不要打扰我嘛~' },
    { emoji: '🐹', title: '你好呀！', text: '我是小窝的守护仓鼠！<br>感谢你的来访 💕<br>祝你有个美好的一天！' },
    { emoji: '🐹', title: '嘘——', text: '仓鼠正在打洞中...<br>嘘，不要吵醒我~<br>醒来给你看好东西 🤫' }
  ];
  
  btn.addEventListener('click', () => {
    const msg = messages[Math.floor(Math.random() * messages.length)];
    modal.querySelector('.modal-hamster').textContent = msg.emoji;
    modal.querySelector('.modal-title').textContent = msg.title;
    modal.querySelector('.modal-text').innerHTML = msg.text;
    modal.classList.add('active');
  });
  
  const closeModal = () => modal.classList.remove('active');
  closeBtn.addEventListener('click', closeModal);
  modalBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await fetchSiteConfig();
  fetchDailyQuote();
  loadArticle();
  initBackToTop();
  initHamsterSticker();
  updateRuntime();
  setInterval(updateRuntime, 1000);
});

const heartStyle = document.createElement('style');
heartStyle.textContent = `
  @keyframes floatHeart {
    0% { transform: translate(-50%, 0) scale(0.5); opacity: 1; }
    100% { transform: translate(-50%, -80px) scale(1.5); opacity: 0; }
  }
`;
document.head.appendChild(heartStyle);