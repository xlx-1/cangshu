const API_BASE = '/api';
let authToken = localStorage.getItem('admin_token') || '';
let currentArticleId = null;

function proxyGitHubUrl(url) {
  if (!url) return url;
  if (url.startsWith('https://raw.githubusercontent.com/') || url.startsWith('https://github.com/')) {
    return 'https://gh-proxy.org/' + url;
  }
  return url;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.toast-message');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-text">${escapeHtml(message)}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showLoading(show, message = '加载中...') {
  let loadingEl = document.querySelector('.loading-overlay');

  if (show) {
    if (!loadingEl) {
      loadingEl = document.createElement('div');
      loadingEl.className = 'loading-overlay';
      loadingEl.innerHTML = `
        <div class="loading-spinner">
          <span class="loading-icon">🐹</span>
          <p class="loading-text">${escapeHtml(message)}</p>
        </div>
      `;
      document.body.appendChild(loadingEl);
    } else {
      loadingEl.querySelector('.loading-text').textContent = message;
      loadingEl.style.display = 'flex';
    }
  } else {
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }
}

function removeProxyPrefix(url) {
  if (!url) return url;

  const proxyPrefixes = [
    'https://gh-proxy.org/',
    'https://ghproxy.com/',
    'https://mirror.ghproxy.com/',
    'https://github.moeyy.xyz/',
    'https://gh.api.99988866.xyz/',
    'http://gh-proxy.org/',
    'http://ghproxy.com/'
  ];

  for (const prefix of proxyPrefixes) {
    if (url.startsWith(prefix)) {
      return url.substring(prefix.length);
    }
  }

  return url;
}

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const defaultHeaders = { 'Content-Type': 'application/json' };

  if (options.auth !== false && authToken) {
    defaultHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const config = {
    ...options,
    headers: { ...defaultHeaders, ...options.headers }
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (response.status === 401) {
      authToken = '';
      localStorage.removeItem('admin_token');
      showAdminView(false);
      showToast('登录已过期，请重新登录', 'error');
      throw new Error('未授权');
    }

    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }

    return data;
  } catch (error) {
    console.error('API 请求错误:', error);
    throw error;
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '未知';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function showAdminView(show) {
  const loginView = document.getElementById('login-view');
  const adminView = document.getElementById('admin-view');
  if (loginView) loginView.style.display = show ? 'none' : 'flex';
  if (adminView) adminView.style.display = show ? 'flex' : 'none';
}

function checkAuthStatus() {
  if (authToken) {
    showAdminView(true);
    switchView('articles');
  } else {
    showAdminView(false);
  }
}

async function handleLogin() {
  const passwordInput = document.getElementById('password-input');
  const password = passwordInput.value.trim();

  if (!password) {
    showToast('请输入密码', 'error');
    passwordInput.focus();
    return;
  }

  showLoading(true, '登录中...');

  try {
    const response = await apiRequest('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
      auth: false
    });

    authToken = response.token;
    localStorage.setItem('admin_token', authToken);
    showToast('登录成功！欢迎回来 🐹', 'success');
    showAdminView(true);
    switchView('articles');
  } catch (error) {
    showToast(error.message || '登录失败', 'error');
  } finally {
    showLoading(false);
  }
}

function logout() {
  if (!confirm('确定要退出登录吗？')) return;
  authToken = '';
  localStorage.removeItem('admin_token');
  showAdminView(false);
  document.getElementById('password-input').value = '';
  showToast('已退出登录', 'info');
}

function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach(section => {
    section.style.display = 'none';
  });

  const viewElement = document.getElementById(`${viewName}-view`);
  if (viewElement) {
    viewElement.style.display = 'block';
  }

  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  updateToolbar(viewName);

  if (viewName === 'articles') {
    loadArticles();
  } else if (viewName === 'config') {
    loadConfig();
  } else if (viewName === 'github') {
    loadSyncStatus();
    loadSyncStats();
  }
}

function updateToolbar(viewName) {
  const toolbarTitle = document.querySelector('.toolbar-title');
  if (!toolbarTitle) return;

  switch (viewName) {
    case 'articles':
      toolbarTitle.textContent = '文章管理';
      break;
    case 'editor':
      toolbarTitle.textContent = currentArticleId ? '编辑文章' : '新建文章';
      break;
    case 'config':
      toolbarTitle.textContent = '网站配置';
      break;
    case 'github':
      toolbarTitle.textContent = 'GitHub 同步';
      break;
  }
}

async function loadArticles() {
  const articlesList = document.getElementById('articles-list');
  if (!articlesList) return;

  articlesList.innerHTML = `
    <div class="empty-placeholder">
      <span class="loading-icon">🐹</span>
      <p>加载中...</p>
    </div>
  `;

  try {
    const response = await apiRequest('/admin/articles');
    const articles = response.articles || [];
    renderArticlesList(articles);
  } catch (error) {
    articlesList.innerHTML = `
      <div class="empty-placeholder">
        <span class="empty-icon">😢</span>
        <p>加载失败：${escapeHtml(error.message)}</p>
        <button class="btn-primary" onclick="loadArticles()">重新加载</button>
      </div>
    `;
    showToast('加载文章列表失败', 'error');
  }
}

function renderArticlesList(articles) {
  const articlesList = document.getElementById('articles-list');
  if (!articlesList) return;

  if (articles.length === 0) {
    articlesList.innerHTML = `
      <div class="empty-placeholder">
        <span class="empty-icon">📝</span>
        <p>还没有文章</p>
        <button class="btn-primary" onclick="createNewArticle()">写第一篇文章 ✨</button>
      </div>
    `;
    return;
  }

  const html = articles.map(article => `
    <div class="article-item" data-id="${article.id}">
      <div class="article-cover">
        ${article.cover
          ? `<img src="${proxyGitHubUrl(escapeHtml(article.cover))}" alt="${escapeHtml(article.title)}" loading="lazy">`
          : '<div class="no-cover">📄</div>'
        }
      </div>
      <div class="article-info">
        <h3 class="article-title">${escapeHtml(article.title || '无标题')}</h3>
        <p class="article-summary">${escapeHtml(article.summary || '暂无简介')}</p>
        <div class="article-meta">
          <span>📅 ${formatDate(article.created_at)}</span>
          <span>👁 ${article.views || 0}</span>
        </div>
      </div>
      <div class="article-actions">
        <button class="btn-edit" onclick="editArticle('${article.id}')">编辑 ✏️</button>
        <button class="btn-delete" onclick="deleteArticle('${article.id}')">删除 🗑️</button>
      </div>
    </div>
  `).join('');

  articlesList.innerHTML = html;
}

async function editArticle(id) {
  currentArticleId = id;
  showLoading(true, '加载文章...');

  try {
    const response = await apiRequest(`/admin/articles/${id}`);
    const article = response.article;

    document.getElementById('article-title').value = article.title || '';
    document.getElementById('article-summary').value = article.summary || '';
    document.getElementById('article-content').value = article.content || '';
    document.getElementById('cover-url').value = article.cover || '';

    const coverPreviewImg = document.getElementById('cover-preview-img');
    if (article.cover) {
      coverPreviewImg.src = proxyGitHubUrl(article.cover);
      coverPreviewImg.style.display = 'block';
    } else {
      coverPreviewImg.style.display = 'none';
      coverPreviewImg.src = '';
    }

    if (article.images && Array.isArray(article.images) && article.images.length > 0) {
      renderImagesPreview(article.images);
    } else {
      document.getElementById('images-preview').innerHTML = '';
    }

    switchView('editor');
    showToast('文章加载成功', 'success');
  } catch (error) {
    showToast('加载文章失败：' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function saveArticle() {
  const title = document.getElementById('article-title').value.trim();
  const summary = document.getElementById('article-summary').value.trim();
  const content = document.getElementById('article-content').value.trim();
  const cover = removeProxyPrefix(document.getElementById('cover-url').value.trim());

  if (!title) {
    showToast('请输入文章标题', 'error');
    document.getElementById('article-title').focus();
    return false;
  }

  if (!content) {
    showToast('请输入文章内容', 'error');
    document.getElementById('article-content').focus();
    return false;
  }

  const imageItems = document.querySelectorAll('#images-preview .image-item');
  const images = Array.from(imageItems).map(item => removeProxyPrefix(item.dataset.url));

  showLoading(true, currentArticleId ? '保存中...' : '发布中...');

  try {
    let result;

    if (currentArticleId) {
      result = await apiRequest(`/admin/articles/${currentArticleId}`, {
        method: 'PUT',
        body: JSON.stringify({ title, summary, content, cover, images })
      });
    } else {
      result = await apiRequest('/admin/articles', {
        method: 'POST',
        body: JSON.stringify({ title, summary, content, cover, images })
      });
    }

    showToast(currentArticleId ? '文章更新成功！' : '文章发布成功！', 'success');
    currentArticleId = result.article?.id || currentArticleId;
    loadArticles();
    return true;
  } catch (error) {
    showToast('保存失败：' + error.message, 'error');
    return false;
  } finally {
    showLoading(false);
  }
}

async function deleteArticle(id) {
  if (!confirm('确定要删除这篇文章吗？此操作不可恢复。')) return;

  showLoading(true, '删除中...');

  try {
    await apiRequest(`/admin/articles/${id}`, { method: 'DELETE' });
    showToast('文章已删除', 'success');
    loadArticles();
  } catch (error) {
    showToast('删除失败：' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function clearEditor() {
  document.getElementById('article-title').value = '';
  document.getElementById('article-summary').value = '';
  document.getElementById('article-content').value = '';
  document.getElementById('cover-url').value = '';
  const coverPreviewImg = document.getElementById('cover-preview-img');
  coverPreviewImg.style.display = 'none';
  coverPreviewImg.src = '';
  document.getElementById('images-preview').innerHTML = '';
}

function createNewArticle() {
  currentArticleId = null;
  clearEditor();
  switchView('editor');
  document.getElementById('article-title').focus();
}

async function uploadImage(file, type) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('type', type);

  try {
    const response = await fetch(`${API_BASE}/admin/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '上传失败');
    }

    return data.url;
  } catch (error) {
    console.error('上传错误:', error);
    throw error;
  }
}

function previewImage(file, previewElement) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewElement.src = e.target.result;
      previewElement.style.display = 'block';
      resolve();
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderImagesPreview(images) {
  const previewContainer = document.getElementById('images-preview');
  if (!previewContainer) return;

  const html = images.map((url, index) => `
    <div class="image-item" data-url="${escapeHtml(url)}">
      <img src="${proxyGitHubUrl(escapeHtml(url))}" alt="配图 ${index + 1}" loading="lazy">
      <button class="btn-remove-image" onclick="removeImage(this)" title="删除">✕</button>
    </div>
  `).join('');
  previewContainer.innerHTML = html;
}

function removeImage(button) {
  button.parentElement.remove();
}

function handleCoverUrlInput() {
  const url = document.getElementById('cover-url').value.trim();
  const previewImg = document.getElementById('cover-preview-img');
  if (url) {
    previewImg.src = proxyGitHubUrl(url);
    previewImg.style.display = 'block';
  } else {
    previewImg.style.display = 'none';
    previewImg.src = '';
  }
}

function handleAvatarUrlInput() {
  const url = document.getElementById('avatar-url').value.trim();
  const previewImg = document.getElementById('avatar-preview-img');
  if (url) {
    previewImg.src = proxyGitHubUrl(url);
    previewImg.style.display = 'block';
  } else {
    previewImg.style.display = 'none';
    previewImg.src = '';
  }
}

function handleBannerUrlInput() {
  const url = document.getElementById('banner-url').value.trim();
  const previewImg = document.getElementById('banner-preview-img');
  if (url) {
    previewImg.src = proxyGitHubUrl(url);
    previewImg.style.display = 'block';
  } else {
    previewImg.style.display = 'none';
    previewImg.src = '';
  }
}

async function loadConfig() {
  showLoading(true, '加载配置...');

  try {
    const config = await apiRequest('/config', { auth: false });

    document.getElementById('config-title').value = config.title || '';
    document.getElementById('config-description').value = config.description || '';
    document.getElementById('config-start-date').value = config.startDate || '';

    document.getElementById('config-mood-emoji').value = config.mood?.emoji || '';
    document.getElementById('config-mood-text').value = config.mood?.text || '';
    document.getElementById('config-mood-quote').value = config.mood?.quote || '';
    document.getElementById('config-mood-quote-author').value = config.mood?.quoteAuthor || '';

    document.getElementById('avatar-url').value = config.images?.avatar || '';
    document.getElementById('banner-url').value = config.images?.banner || '';
    document.getElementById('sponsor-qr-url').value = config.images?.sponsorQr || '';

    handleAvatarUrlInput();
    handleBannerUrlInput();
    handleSponsorQrUrlInput();

    document.getElementById('config-sponsor-title').value = config.sponsor?.title || '';
    document.getElementById('config-sponsor-description').value = config.sponsor?.description || '';
    document.getElementById('config-sponsor-note').value = config.sponsor?.note || '';
    document.getElementById('config-sponsor-tags').value = (config.sponsor?.tags || []).join(', ');

    showToast('配置加载成功', 'success');
  } catch (error) {
    showToast('加载配置失败：' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function saveConfig() {
  const title = document.getElementById('config-title').value.trim();

  if (!title) {
    showToast('请输入网站标题', 'error');
    return;
  }

  const tagsInput = document.getElementById('config-sponsor-tags').value.trim();
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

  const configData = {
    title,
    description: document.getElementById('config-description').value.trim(),
    startDate: document.getElementById('config-start-date').value,
    mood: {
      emoji: document.getElementById('config-mood-emoji').value.trim(),
      text: document.getElementById('config-mood-text').value.trim(),
      quote: document.getElementById('config-mood-quote').value.trim(),
      quoteAuthor: document.getElementById('config-mood-quote-author').value.trim()
    },
    images: {
      avatar: removeProxyPrefix(document.getElementById('avatar-url').value.trim()),
      banner: removeProxyPrefix(document.getElementById('banner-url').value.trim()),
      sponsorQr: removeProxyPrefix(document.getElementById('sponsor-qr-url').value.trim())
    },
    sponsor: {
      title: document.getElementById('config-sponsor-title').value.trim(),
      description: document.getElementById('config-sponsor-description').value.trim(),
      note: document.getElementById('config-sponsor-note').value.trim(),
      tags
    }
  };

  showLoading(true, '保存配置...');

  try {
    await apiRequest('/config', {
      method: 'POST',
      body: JSON.stringify(configData)
    });
    showToast('配置保存成功！刷新首页即可看到效果 ✨', 'success');
  } catch (error) {
    showToast('保存失败：' + error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function handleSponsorQrUrlInput() {
  const url = document.getElementById('sponsor-qr-url').value.trim();
  const previewImg = document.getElementById('sponsor-qr-preview-img');
  if (url) {
    previewImg.src = proxyGitHubUrl(url);
    previewImg.style.display = 'block';
  } else {
    previewImg.style.display = 'none';
    previewImg.src = '';
  }
}

let syncStatusPollTimer = null;

async function loadSyncStatus() {
  try {
    const result = await apiRequest('/admin/sync/status');
    if (result.success) {
      const s = result.stats;
      document.getElementById('task-pending').textContent = s.pending;
      document.getElementById('task-running').textContent = s.running;
      document.getElementById('task-completed').textContent = s.completed;
      document.getElementById('task-failed').textContent = s.failed;
      
      const badge = document.getElementById('sync-status-badge');
      if (s.running > 0) {
        badge.textContent = '同步中...';
        badge.style.background = 'var(--accent-bg)';
        badge.style.color = 'var(--accent-color)';
      } else if (s.failed > 0) {
        badge.textContent = '有失败任务';
        badge.style.background = 'var(--danger-bg)';
        badge.style.color = 'var(--danger-color)';
      } else {
        badge.textContent = '自动同步中';
        badge.style.background = 'var(--success-bg)';
        badge.style.color = 'var(--success-color)';
      }
      
      const allTasks = [
        ...result.running.map(t => ({ ...t })),
        ...result.pending.map(t => ({ ...t })),
        ...(result.recentCompleted || []).map(t => ({ ...t })),
        ...(result.recentFailed || []).map(t => ({ ...t }))
      ].slice(0, 10);
      
      const taskListEl = document.getElementById('task-list');
      if (taskListEl && allTasks.length > 0) {
        taskListEl.innerHTML = allTasks.map(task => {
          const typeMap = {
            'upload-image': '上传图片',
            'delete-image': '删除图片',
            'upload-article': '上传文章',
            'delete-article': '删除文章',
            'upload-config': '上传配置',
            'full-sync': '全量同步'
          };
          const typeName = typeMap[task.type] || task.type;
          return `
            <div class="task-list-item ${task.status}">
              <span class="task-type">${typeName}</span>
              <span class="task-status ${task.status}">${statusText(task.status)}</span>
            </div>
          `;
        }).join('');
      } else if (taskListEl) {
        taskListEl.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.9rem;">暂无任务记录</p>';
      }
    }
  } catch (err) {
    console.warn('加载同步状态失败:', err);
  }
}

function statusText(status) {
  const map = {
    'pending': '等待中',
    'running': '进行中',
    'completed': '已完成',
    'failed': '失败'
  };
  return map[status] || status;
}

async function loadSyncStats() {
  try {
    const result = await apiRequest('/admin/sync/stats');
    if (result.success && result.stats) {
      const s = result.stats;
      document.getElementById('stat-images-total').textContent = s.images?.total ?? '--';
      document.getElementById('stat-images-used').textContent = s.images?.used ?? '--';
      document.getElementById('stat-images-orphans').textContent = s.images?.orphans ?? '--';
      document.getElementById('stat-articles').textContent = s.articles?.total ?? '--';
    }
  } catch (err) {
    console.warn('加载统计失败:', err);
  }
}

async function startFullSync() {
  if (!confirm('确定要执行全量同步吗？这会重新上传所有文章和配置。')) return;
  
  try {
    showLoading(true, '正在启动全量同步...');
    const result = await apiRequest('/admin/sync/full', { method: 'POST' });
    showToast(result.message || '已添加到同步队列', 'success');
    loadSyncStatus();
  } catch (err) {
    showToast('启动同步失败：' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function cleanOrphanFiles() {
  if (!confirm('确定要清理所有孤儿文件吗？未被任何文章或配置引用的图片将被删除。')) return;
  
  try {
    showLoading(true, '正在清理孤儿文件...');
    const result = await apiRequest('/admin/sync/clean-orphans', { method: 'POST' });
    showToast(result.message || '已添加到清理队列', 'success');
    loadSyncStatus();
    setTimeout(loadSyncStats, 5000);
  } catch (err) {
    showToast('清理失败：' + err.message, 'error');
  } finally {
    showLoading(false);
  }
}

function startSyncPolling() {
  if (syncStatusPollTimer) return;
  loadSyncStatus();
  syncStatusPollTimer = setInterval(loadSyncStatus, 3000);
}

function stopSyncPolling() {
  if (syncStatusPollTimer) {
    clearInterval(syncStatusPollTimer);
    syncStatusPollTimer = null;
  }
}

function hasPendingSyncTasks() {
  const pending = parseInt(document.getElementById('task-pending')?.textContent || '0');
  const running = parseInt(document.getElementById('task-running')?.textContent || '0');
  return pending > 0 || running > 0;
}

document.addEventListener('DOMContentLoaded', () => {
  checkAuthStatus();

  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('password-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  document.getElementById('logout-btn').addEventListener('click', logout);

  document.getElementById('new-article-btn-list').addEventListener('click', createNewArticle);

  document.getElementById('back-to-list-btn').addEventListener('click', () => {
    if (confirm('确定要返回列表吗？未保存的内容将丢失。')) {
      currentArticleId = null;
      clearEditor();
      switchView('articles');
    }
  });

  document.getElementById('save-article-btn').addEventListener('click', saveArticle);
  document.getElementById('publish-to-github-btn')?.addEventListener('click', async () => {
    const saved = await saveArticle();
    if (saved) {
      showToast('文章已保存，正在后台同步到 GitHub...', 'success');
    }
  });

  document.getElementById('cover-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showLoading(true, '上传封面...');
    try {
      const previewImg = document.getElementById('cover-preview-img');
      await previewImage(file, previewImg);
      const url = await uploadImage(file, 'cover');
      document.getElementById('cover-url').value = url;
      previewImg.src = proxyGitHubUrl(url);
      showToast('封面上传成功', 'success');
    } catch (error) {
      showToast('上传失败：' + error.message, 'error');
    } finally {
      showLoading(false);
      e.target.value = '';
    }
  });

  document.getElementById('cover-url').addEventListener('input', handleCoverUrlInput);

  document.getElementById('images-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const previewContainer = document.getElementById('images-preview');

    for (const file of files) {
      showLoading(true, `上传 ${file.name}...`);
      try {
        const url = await uploadImage(file, 'images');
        const imageItem = document.createElement('div');
        imageItem.className = 'image-item';
        imageItem.dataset.url = url;
        imageItem.innerHTML = `
          <img src="${proxyGitHubUrl(url)}" alt="配图" loading="lazy">
          <button class="btn-remove-image" onclick="removeImage(this)" title="删除">✕</button>
        `;
        previewContainer.appendChild(imageItem);
      } catch (error) {
        showToast(`${file.name} 上传失败：${error.message}`, 'error');
      } finally {
        showLoading(false);
      }
    }

    e.target.value = '';
  });

  document.getElementById('avatar-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showLoading(true, '上传头像...');
    try {
      const previewImg = document.getElementById('avatar-preview-img');
      await previewImage(file, previewImg);
      const url = await uploadImage(file, 'avatar');
      document.getElementById('avatar-url').value = url;
      previewImg.src = proxyGitHubUrl(url);
      showToast('头像上传成功', 'success');
    } catch (error) {
      showToast('上传失败：' + error.message, 'error');
    } finally {
      showLoading(false);
      e.target.value = '';
    }
  });

  document.getElementById('avatar-url').addEventListener('input', handleAvatarUrlInput);

  document.getElementById('banner-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showLoading(true, '上传横幅...');
    try {
      const previewImg = document.getElementById('banner-preview-img');
      await previewImage(file, previewImg);
      const url = await uploadImage(file, 'banner');
      document.getElementById('banner-url').value = url;
      previewImg.src = proxyGitHubUrl(url);
      showToast('横幅上传成功', 'success');
    } catch (error) {
      showToast('上传失败：' + error.message, 'error');
    } finally {
      showLoading(false);
      e.target.value = '';
    }
  });

  document.getElementById('banner-url').addEventListener('input', handleBannerUrlInput);

  document.getElementById('sponsor-qr-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showLoading(true, '上传收款码...');
    try {
      const previewImg = document.getElementById('sponsor-qr-preview-img');
      await previewImage(file, previewImg);
      const url = await uploadImage(file, 'sponsor');
      document.getElementById('sponsor-qr-url').value = url;
      previewImg.src = proxyGitHubUrl(url);
      showToast('收款码上传成功', 'success');
    } catch (error) {
      showToast('上传失败：' + error.message, 'error');
    } finally {
      showLoading(false);
      e.target.value = '';
    }
  });

  document.getElementById('sponsor-qr-url').addEventListener('input', handleSponsorQrUrlInput);

  document.getElementById('save-config-btn').addEventListener('click', saveConfig);

  document.getElementById('sync-all-btn')?.addEventListener('click', startFullSync);
  document.getElementById('clean-orphans-btn')?.addEventListener('click', cleanOrphanFiles);
  document.getElementById('refresh-stats-btn')?.addEventListener('click', () => {
    loadSyncStats();
    loadSyncStatus();
  });

  startSyncPolling();
  setTimeout(loadSyncStats, 1000);

  window.addEventListener('beforeunload', (e) => {
    if (hasPendingSyncTasks()) {
      e.preventDefault();
      e.returnValue = '还有同步任务正在进行中，关闭页面可能导致同步失败。确定要离开吗？';
      return e.returnValue;
    }
  });
});

window.editArticle = editArticle;
window.deleteArticle = deleteArticle;
window.removeImage = removeImage;
window.loadArticles = loadArticles;
window.createNewArticle = createNewArticle;