// app.js - 主应用逻辑

// ===== STATE =====
let state = {
  view: 'card',         // 'card' | 'table'
  filter: 'all',
  category: '',
  search: '',
  editingPromptId: null,
  editingConfigId: null,
  isJinjaMode: false,
  aiGenResult: '',
  aiOptResult: ''
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // Mock utools for testing in browser
  if (!window.utools) {
    console.warn('Running without uTools - using localStorage mock')
    window.utools = createUToolsMock()
  }

  Storage.initSampleData()
  renderAll()
  initProviderSelect()
  initColorPresets()
  initTheme()

  // uTools lifecycle
  if (window.utools) {
    utools.onPluginEnter(({ code, type, payload }) => {

      // ── 主入口 / 搜索入口 ──────────────────────────────────
      if (code === 'promptcard_main') {
        switchPage('prompts', document.querySelector('[data-page="prompts"]'))
        return
      }

      if (code === 'promptcard_search' && payload) {
        const q = payload.replace(/^ps:/, '')
        document.getElementById('search-input').value = q
        state.search = q
        switchPage('prompts', document.querySelector('[data-page="prompts"]'))
        renderPrompts()
        return
      }

      // ── 动态提示词指令 ──────────────────────────────────────
      // code 格式: "prompt_{id}"
      if (code.startsWith('prompt_')) {
        const promptId = code.slice(7)
        const p = Storage.getPromptById(promptId)
        if (!p) return

        // 判断是否是"单变量非Jinja"快速填充模式
        const vars = JinjaRenderer.extractVariables(p.content)
        const isSingleVarSimple = !p.isJinja && vars.length === 1

        if (isSingleVarSimple && type === 'over' && payload) {
          // 直接用粘贴内容填充唯一变量，渲染并复制
          const rendered = JinjaRenderer.render(p.content, { [vars[0]]: payload })
          utools.copyText(rendered)
          Storage.addHistory({
            promptId: p.id,
            promptTitle: p.title,
            variables: { [vars[0]]: payload },
            renderedContent: rendered
          })
          Storage.updatePrompt(p.id, { useCount: (p.useCount || 0) + 1 })
          utools.showNotification('提示词Card', `已复制：${p.title}`)
          utools.hideMainWindow()
          renderAll()
        } else {
          // 多变量 / Jinja / 无粘贴内容 → 打开抽屉
          switchPage('prompts', document.querySelector('[data-page="prompts"]'))
          // 延迟一帧确保页面已渲染
          requestAnimationFrame(() => showUsePrompt(promptId))
        }
      }
    })

    // Auto-backup when plugin closes
    utools.onPluginOut(() => {
      const settings = Storage.getSettings()
      if (settings.autoBackup !== false) {
        Storage.backupToUtools()
      }
    })
  }
})

// Mock for browser testing
function createUToolsMock() {
  const store = {}
  const features = {}
  return {
    db: {
      get: (key) => store[key] ? { _id: key, _rev: '1', data: store[key] } : null,
      put: (doc) => { store[doc._id] = doc.data; return { ok: true } },
      allDocs: () => Object.keys(store).map(k => ({ _id: k }))
    },
    dbStorage: {
      setItem: (k, v) => { localStorage.setItem(k, v) },
      getItem: (k) => localStorage.getItem(k),
      removeItem: (k) => localStorage.removeItem(k)
    },
    copyText: (text) => { navigator.clipboard?.writeText(text); return true },
    showNotification: (title, body) => console.log('[通知]', title, body),
    hideMainWindow: () => {},
    onPluginEnter: () => {},
    onPluginOut: () => {},
    setFeature: (f) => { features[f.code] = f },
    removeFeature: (code) => { delete features[code] },
    getFeatures: () => Object.values(features)
  }
}

function renderAll() {
  renderSidebar()
  renderPrompts()
  renderHistory()
  renderAIConfigs()
  renderBackup()
  syncFeatures()
}

// ===== uTOOLS DYNAMIC FEATURE REGISTRATION =====
// Registers each prompt as a uTools command so users can invoke them directly
// from the uTools launcher without opening the plugin UI first.
function syncFeatures() {
  if (!window.utools || !utools.setFeature) return

  const prompts = Storage.getPrompts()

  prompts.forEach(p => {
    const vars = JinjaRenderer.extractVariables(p.content)
    const isSingleVarSimple = !p.isJinja && vars.length === 1

    // Build cmds: title + all tags
    const cmds = [p.title]
    if (p.tags && p.tags.length) {
      p.tags.forEach(t => { if (t && !cmds.includes(t)) cmds.push(t) })
    }

    // Single-var simple prompts support "over" mode (clipboard content fills the var)
    // All others use "default" mode (opens the drawer to fill vars)
    const feature = {
      code: `prompt_${p.id}`,
      explain: p.description || p.title,
      icon: 'logo.png',
      platform: ['darwin', 'win32', 'linux'],
      cmds: isSingleVarSimple
        ? cmds.map(cmd => ({
            type: 'over',
            label: cmd,
            explain: `填充「${vars[0]}」并复制`,
            match: ''   // match any clipboard content
          }))
        : cmds
    }

    try {
      utools.setFeature(feature)
    } catch(e) {
      console.warn('setFeature failed for', p.id, e)
    }
  })

  // Clean up features for deleted prompts
  try {
    const allFeatures = utools.getFeatures()
    const activeIds = new Set(prompts.map(p => `prompt_${p.id}`))
    allFeatures
      .filter(f => f.code.startsWith('prompt_') && !activeIds.has(f.code))
      .forEach(f => utools.removeFeature(f.code))
  } catch(e) {}
}

// ===== THEME =====
function initTheme() {
  const settings = Storage.getSettings()
  const isDark = settings.theme !== 'light'
  applyTheme(isDark ? 'dark' : 'light')
}

function applyTheme(theme) {
  const root = document.documentElement
  const btn = document.getElementById('theme-btn')
  const label = document.getElementById('theme-label')
  if (theme === 'light') {
    root.classList.add('light')
    if (btn) btn.textContent = '☀️'
    if (label) label.textContent = '亮色模式'
  } else {
    root.classList.remove('light')
    if (btn) btn.textContent = '🌙'
    if (label) label.textContent = '暗色模式'
  }
}

function toggleTheme() {
  const isLight = document.documentElement.classList.contains('light')
  const newTheme = isLight ? 'dark' : 'light'
  applyTheme(newTheme)
  const settings = Storage.getSettings()
  Storage.saveSettings({ ...settings, theme: newTheme })
}

// ===== NAVIGATION =====
function switchPage(pageId, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  document.getElementById('page-' + pageId).classList.add('active')
  if (navEl) navEl.classList.add('active')

  if (pageId === 'history') renderHistory()
  if (pageId === 'ai-config') renderAIConfigs()
  if (pageId === 'backup') renderBackup()
}

// ===== SIDEBAR =====
function renderSidebar() {
  const prompts = Storage.getPrompts()
  const categories = Storage.getCategories()

  document.getElementById('total-count').textContent = prompts.length
  document.getElementById('cat-all-count').textContent = prompts.length

  const list = document.getElementById('categories-list')
  // Keep the "all" item
  const allItem = list.querySelector('[data-cat=""]')

  // Remove old dynamic items
  list.querySelectorAll('.cat-item:not([data-cat=""])').forEach(el => el.remove())

  categories.forEach(cat => {
    const count = prompts.filter(p => p.category === cat.id).length
    const div = document.createElement('div')
    div.className = 'cat-item' + (state.category === cat.id ? ' active' : '')
    div.setAttribute('data-cat', cat.id)
    div.onclick = () => filterByCategory(cat.id, div)
    div.innerHTML = `
      <span class="cat-dot" style="background:${cat.color}"></span>
      <span>${cat.name}</span>
      <span class="cat-count">${count}</span>
      <span class="cat-del" onclick="deleteCategory(event,'${cat.id}')">🗑</span>
    `

    list.appendChild(div)
  })
}

function filterByCategory(catId, el) {
  state.category = catId
  document.querySelectorAll('.cat-item').forEach(i => i.classList.remove('active'))
  el.classList.add('active')
  renderPrompts()
}

// ===== PROMPTS =====
function renderPrompts() {
  let prompts = Storage.getPrompts()
  const categories = Storage.getCategories()

  // Filter by category
  if (state.category) {
    prompts = prompts.filter(p => p.category === state.category)
  }

  // Filter
  if (state.filter === 'favorite') prompts = prompts.filter(p => p.isFavorite)
  else if (state.filter === 'jinja') prompts = prompts.filter(p => p.isJinja)
  else if (state.filter === 'r5') prompts = prompts.filter(p => p.rating === 5)
  else if (state.filter === 'recent') prompts = [...prompts].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 20)

  // Search
  if (state.search) {
    const q = state.search.toLowerCase()
    prompts = prompts.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.tags?.some(t => t.toLowerCase().includes(q))
    )
  }

  if (state.view === 'card') {
    renderCardView(prompts, categories)
  } else {
    renderTableView(prompts, categories)
  }
}

function renderCardView(prompts, categories) {
  document.getElementById('card-grid').style.display = ''
  document.getElementById('table-view').style.display = 'none'

  const grid = document.getElementById('card-grid')
  if (prompts.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📝</div>
      <div class="empty-title">暂无提示词</div>
      <div class="empty-desc">点击右上角"新建提示词"开始创建</div>
    </div>`
    return
  }

  grid.innerHTML = prompts.map(p => {
    const cat = categories.find(c => c.id === p.category)
    const stars = p.rating ? '★'.repeat(p.rating) : ''
    const preview = p.content.slice(0, 120).replace(/\n/g, ' ')
    const vars = JinjaRenderer.extractVariables(p.content)
    const isQuickFill = !p.isJinja && vars.length === 1
    return `
    <div class="prompt-card" onclick="showUsePrompt('${p.id}')">
      <div class="card-header">
        <div class="card-title">${escHtml(p.title)}</div>
        <div class="card-actions">
          <button class="card-action-btn fav ${p.isFavorite ? 'active' : ''}" title="收藏" onclick="toggleFav(event,'${p.id}')">
            ${p.isFavorite ? '★' : '☆'}
          </button>
          <button class="card-action-btn" title="编辑" onclick="editPrompt(event,'${p.id}')">✎</button>
          <button class="card-action-btn del" title="删除" onclick="deletePrompt(event,'${p.id}')">🗑</button>
        </div>
      </div>
      ${p.description ? `<div class="card-desc">${escHtml(p.description)}</div>` : ''}
      <div class="card-preview">${escHtml(preview)}${p.content.length > 120 ? '...' : ''}</div>
      <div class="card-meta">
        ${isQuickFill ? '<span class="tag" style="background:rgba(251,191,36,0.12);color:#d97706;font-size:10px;">⚡ 快速填充</span>' : ''}
        ${p.isJinja ? '<span class="tag jinja">Jinja</span>' : ''}
        ${cat ? `<span class="tag cat" style="background:${cat.color}22;color:${cat.color}">${escHtml(cat.name)}</span>` : ''}
        ${(p.tags || []).slice(0, 2).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}
        ${stars ? `<span class="stars">${stars}</span>` : ''}
        <span class="card-stats">⟳ ${p.useCount || 0}</span>
      </div>
    </div>`
  }).join('')
}

function renderTableView(prompts, categories) {
  document.getElementById('card-grid').style.display = 'none'
  document.getElementById('table-view').style.display = ''
  const tbody = document.getElementById('table-body')
  if (prompts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text3)">暂无提示词</td></tr>'
    return
  }
  tbody.innerHTML = prompts.map(p => {
    const cat = categories.find(c => c.id === p.category)
    const date = new Date(p.updatedAt).toLocaleDateString('zh-CN')
    return `
    <tr onclick="showUsePrompt('${p.id}')">
      <td class="td-title">${escHtml(p.title)}${p.isJinja ? ' <span class="tag jinja" style="font-size:10px">Jinja</span>' : ''}</td>
      <td>${cat ? `<span style="color:${cat.color}">${escHtml(cat.name)}</span>` : '-'}</td>
      <td>${(p.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join(' ')}</td>
      <td style="font-family:var(--font-mono)">${p.useCount || 0}</td>
      <td style="font-family:var(--font-mono)">${date}</td>
    </tr>`
  }).join('')
}

function setView(v) {
  state.view = v
  document.getElementById('view-card').classList.toggle('active', v === 'card')
  document.getElementById('view-table').classList.toggle('active', v === 'table')
  renderPrompts()
}

function setFilter(f, el) {
  state.filter = f
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
  el.classList.add('active')
  renderPrompts()
}

function handleSearch() {
  state.search = document.getElementById('search-input').value
  renderPrompts()
}

// ===== ADD / EDIT PROMPT =====
function showAddPrompt() {
  state.editingPromptId = null
  state.isJinjaMode = false

  document.getElementById('modal-prompt-title').textContent = '新建提示词'
  document.getElementById('p-title').value = ''
  document.getElementById('p-desc').value = ''
  document.getElementById('p-tags').value = ''
  document.getElementById('p-content').value = ''
  document.getElementById('p-rating').value = '0'
  document.getElementById('fav-switch').classList.remove('on')
  document.getElementById('jinja-switch').classList.remove('on')
  document.getElementById('vars-hint').textContent = ''
  updateJinjaButtons()
  populateCategorySelect()
  openModal('modal-prompt')
}

function editPrompt(e, id) {
  e.stopPropagation()
  const p = Storage.getPromptById(id)
  if (!p) return
  state.editingPromptId = id
  state.isJinjaMode = p.isJinja

  document.getElementById('modal-prompt-title').textContent = '编辑提示词'
  document.getElementById('p-title').value = p.title
  document.getElementById('p-desc').value = p.description || ''
  document.getElementById('p-tags').value = (p.tags || []).join(' ')
  document.getElementById('p-content').value = p.content
  document.getElementById('p-rating').value = p.rating || 0
  document.getElementById('fav-switch').classList.toggle('on', !!p.isFavorite)
  document.getElementById('jinja-switch').classList.toggle('on', !!p.isJinja)
  updateJinjaButtons()
  populateCategorySelect(p.category)
  updateVarsHint()
  openModal('modal-prompt')
}

function populateCategorySelect(selected = '') {
  const select = document.getElementById('p-category')
  const cats = Storage.getCategories()
  select.innerHTML = '<option value="">无分类</option>' +
    cats.map(c => `<option value="${c.id}" ${selected === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')
}

function savePrompt() {
  const title = document.getElementById('p-title').value.trim()
  if (!title) { showToast('请输入提示词标题', 'error'); return }
  const content = document.getElementById('p-content').value.trim()
  if (!content) { showToast('请输入提示词内容', 'error'); return }

  const data = {
    title,
    content,
    description: document.getElementById('p-desc').value.trim(),
    tags: document.getElementById('p-tags').value.trim().split(/\s+/).filter(Boolean),
    category: document.getElementById('p-category').value,
    isJinja: state.isJinjaMode,
    rating: parseInt(document.getElementById('p-rating').value),
    isFavorite: document.getElementById('fav-switch').classList.contains('on')
  }

  if (state.editingPromptId) {
    Storage.updatePrompt(state.editingPromptId, data)
    showToast('提示词已更新', 'success')
  } else {
    Storage.addPrompt(data)
    showToast('提示词已创建', 'success')
  }

  closeModal('modal-prompt')
  renderAll()
  syncFeatures()
}

function deletePrompt(e, id) {
  e.stopPropagation()
  if (!confirm('确定删除这个提示词吗？')) return
  Storage.deletePrompt(id)
  // Remove from uTools features
  if (window.utools && utools.removeFeature) {
    try { utools.removeFeature(`prompt_${id}`) } catch(e) {}
  }
  showToast('已删除', 'info')
  renderAll()
}

function toggleFav(e, id) {
  e.stopPropagation()
  const p = Storage.getPromptById(id)
  if (!p) return
  Storage.updatePrompt(id, { isFavorite: !p.isFavorite })
  renderAll()
}

// ===== JINJA MODE =====
function toggleJinjaMode() {
  state.isJinjaMode = !state.isJinjaMode
  document.getElementById('jinja-switch').classList.toggle('on', state.isJinjaMode)
  updateJinjaButtons()
  updateVarsHint()
}

function updateJinjaButtons() {
  const show = state.isJinjaMode
  ;['btn-if', 'btn-for', 'btn-filter'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.style.display = show ? '' : 'none'
  })
}

function insertSnippet(text) {
  const ta = document.getElementById('p-content')
  const start = ta.selectionStart
  const end = ta.selectionEnd
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end)
  ta.selectionStart = ta.selectionEnd = start + text.length
  ta.focus()
  updateVarsHint()
}

document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('p-content')
  if (ta) ta.addEventListener('input', updateVarsHint)
})

function updateVarsHint() {
  const content = document.getElementById('p-content')?.value || ''
  const vars = JinjaRenderer.extractVariables(content)
  const hint = document.getElementById('vars-hint')
  if (!hint) return
  if (vars.length > 0) {
    hint.textContent = '检测到变量：' + vars.map(v => `{{${v}}}`).join('  ')
  } else {
    hint.textContent = ''
  }
}

// ===== USE PROMPT — RIGHT DRAWER =====
let currentUsePrompt = null
let currentVarValues = {}

function showUsePrompt(id) {
  const p = Storage.getPromptById(id)
  if (!p) return
  currentUsePrompt = p
  currentVarValues = {}

  // Populate drawer header
  document.getElementById('drawer-title').textContent = p.title
  document.getElementById('drawer-hint').textContent = p.isJinja ? 'Jinja 模板' : '变量替换'

  // Extract variables — supports Chinese + English names
  const VARPAT = '[\\w\\u4e00-\\u9fa5]+'
  const vars = JinjaRenderer.extractVariables(p.content)
  const varsEl = document.getElementById('drawer-vars')
  const noVarsEl = document.getElementById('drawer-no-vars')
  const varsSectionEl = document.getElementById('drawer-vars-section')

  // Detect list vars used in {% for x in LIST %}
  const forRe = new RegExp('\\{%[-\\s]*for\\s+' + VARPAT + '\\s+in\\s+(' + VARPAT + ')\\s*[-\\s]*%\\}', 'g')
  const arrayVars = new Set()
  let m
  while ((m = forRe.exec(p.content)) !== null) arrayVars.add(m[1])

  if (vars.length === 0) {
    varsEl.innerHTML = ''
    noVarsEl.style.display = ''
    varsSectionEl.style.display = ''
  } else {
    noVarsEl.style.display = 'none'
    varsSectionEl.style.display = ''
    vars.forEach(v => { currentVarValues[v] = arrayVars.has(v) ? [] : '' })

    varsEl.innerHTML = vars.map(varName => {
      const isArr = arrayVars.has(varName)
      return `<div>
        <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:var(--text2);margin-bottom:5px;">
          <span>${escHtml(varName)}</span>
          ${isArr ? '<span style="color:var(--accent2);font-size:9px;background:var(--accent-glow);padding:1px 5px;border-radius:3px;">列表</span>' : ''}
        </label>
        ${isArr
          ? `<textarea style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font-mono);font-size:11.5px;padding:8px 10px;outline:none;resize:vertical;min-height:64px;line-height:1.6;"
                placeholder="每行一个值&#10;例如：选项A&#10;选项B"
                data-varname="${escAttr(varName)}" data-type="array"
                oninput="handleVarInput(this)"></textarea>
             <div style="font-size:10px;color:var(--text3);margin-top:3px;">每行一个列表项</div>`
          : `<input style="width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--font-main);font-size:13px;padding:8px 12px;outline:none;"
                placeholder="输入「${escHtml(varName)}」的值..."
                data-varname="${escAttr(varName)}" data-type="text"
                oninput="handleVarInput(this)">`
        }
      </div>`
    }).join('')
  }

  updatePreview()
  openDrawer()
}

function openDrawer() {
  const drawer = document.getElementById('use-drawer')
  drawer.style.width = '360px'
  drawer.style.borderLeftWidth = '1px'
}

function closeDrawer() {
  const drawer = document.getElementById('use-drawer')
  drawer.style.width = '0'
  drawer.style.borderLeftWidth = '0'
  currentUsePrompt = null
}

// Single handler for all variable inputs
function handleVarInput(el) {
  const varName = el.getAttribute('data-varname')
  const type = el.getAttribute('data-type')
  if (!varName) return
  currentVarValues[varName] = type === 'array'
    ? el.value.split('\n').map(s => s.trim()).filter(Boolean)
    : el.value
  updatePreview()
}

function updateVar(name, value) { currentVarValues[name] = value; updatePreview() }
function updateArrVar(name, value) { currentVarValues[name] = value.split('\n').map(s => s.trim()).filter(Boolean); updatePreview() }

function updatePreview() {
  if (!currentUsePrompt) return
  const rendered = JinjaRenderer.render(currentUsePrompt.content, currentVarValues)
  const pre = document.getElementById('drawer-preview')
  if (pre) pre.textContent = rendered
  const cc = document.getElementById('drawer-char-count')
  if (cc) cc.textContent = rendered.length + ' 字符'
}

function switchUseTab() {} // no-op

function copyRendered() {
  if (!currentUsePrompt) return
  const rendered = JinjaRenderer.render(currentUsePrompt.content, currentVarValues)

  if (window.utools) utools.copyText(rendered)
  else navigator.clipboard?.writeText(rendered)

  Storage.addHistory({
    promptId: currentUsePrompt.id,
    promptTitle: currentUsePrompt.title,
    variables: { ...currentVarValues },
    renderedContent: rendered
  })
  Storage.updatePrompt(currentUsePrompt.id, {
    useCount: (currentUsePrompt.useCount || 0) + 1
  })

  showToast('已复制到剪贴板 ✓', 'success')
  closeDrawer()
  renderAll()
}

// ===== HISTORY =====
function renderHistory() {
  const history = Storage.getHistory()
  const search = document.getElementById('history-search')?.value?.toLowerCase() || ''
  const filtered = search
    ? history.filter(h => h.promptTitle?.toLowerCase().includes(search) || h.renderedContent?.toLowerCase().includes(search))
    : history

  const el = document.getElementById('history-content')
  if (filtered.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">◷</div>
      <div class="empty-title">暂无历史记录</div>
      <div class="empty-desc">使用提示词后会自动记录在这里</div>
    </div>`
    return
  }

  el.innerHTML = filtered.map(h => {
    const date = new Date(h.usedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    const vars = Object.entries(h.variables || {}).filter(([,v]) => v && (Array.isArray(v) ? v.length : true))
      .map(([k,v]) => `${k}: ${Array.isArray(v) ? v.join(',') : v}`).slice(0, 3).join(' · ')
    return `
    <div class="history-item" onclick="copyHistoryItem('${h.id}')">
      <div class="history-title">${escHtml(h.promptTitle || '未知提示词')}</div>
      <div class="history-meta">${date}${vars ? ' · ' + escHtml(vars) : ''}</div>
      <div class="history-preview">${escHtml(h.renderedContent?.slice(0, 150) || '')}</div>
    </div>`
  }).join('')
}

function copyHistoryItem(id) {
  const history = Storage.getHistory()
  const h = history.find(item => item.id === id)
  if (!h) return
  if (window.utools) utools.copyText(h.renderedContent)
  else navigator.clipboard?.writeText(h.renderedContent)
  showToast('已复制历史记录', 'success')
}

function clearAllHistory() {
  if (!confirm('确定清空所有历史记录吗？')) return
  Storage.clearHistory()
  renderHistory()
  showToast('历史记录已清空', 'info')
}

// ===== AI CONFIG =====
function initProviderSelect() {
  const select = document.getElementById('cfg-provider')
  if (!select) return
  select.innerHTML = AIService.PROVIDERS.map(p =>
    `<option value="${p.id}">${p.name}</option>`
  ).join('')
}

function onProviderChange() {
  const providerId = document.getElementById('cfg-provider').value
  const provider = AIService.PROVIDERS.find(p => p.id === providerId)
  if (!provider) return
  
  const defaultUrl = AIService.getDefaultBaseUrl(providerId)
  document.getElementById('cfg-url').placeholder = defaultUrl
  
  const presets = document.getElementById('model-presets')
  presets.innerHTML = (provider.models || []).map(m =>
    `<a href="javascript:" style="color:var(--accent2);font-size:10.5px;margin-right:6px" onclick="document.getElementById('cfg-model').value='${m}'">${m}</a>`
  ).join('')
}

function renderAIConfigs() {
  const configs = Storage.getAIConfigs()
  const el = document.getElementById('ai-config-content')

  if (configs.length === 0) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🤖</div>
      <div class="empty-title">还没有 AI 配置</div>
      <div class="empty-desc">添加 AI 模型配置后，可以使用 AI 生成和优化提示词</div>
    </div>`
    return
  }

  el.innerHTML = configs.map(c => `
    <div class="config-card ${c.isDefault ? 'default' : ''}">
      <div class="config-header">
        <div>
          <div class="config-name">${escHtml(c.name)}</div>
          <div class="config-provider">${c.provider} · ${c.model}</div>
        </div>
        ${c.isDefault ? '<span class="config-default-badge">默认</span>' : ''}
        <div class="config-actions" style="margin-left:auto">
          ${!c.isDefault ? `<button class="config-btn" onclick="setDefaultConfig('${c.id}')">设为默认</button>` : ''}
          <button class="config-btn" onclick="editAIConfig('${c.id}')">编辑</button>
          <button class="config-btn del" onclick="deleteAIConfig('${c.id}')">删除</button>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text3);font-family:var(--font-mono)">
        ${c.baseUrl || AIService.getDefaultBaseUrl(c.provider)}
      </div>
    </div>`).join('')
}

function showAddAIConfig() {
  state.editingConfigId = null
  document.getElementById('modal-ai-config-title').textContent = '添加 AI 配置'
  document.getElementById('cfg-name').value = ''
  document.getElementById('cfg-key').value = ''
  document.getElementById('cfg-url').value = ''
  document.getElementById('cfg-model').value = ''
  document.getElementById('test-result').textContent = ''
  onProviderChange()
  openModal('modal-ai-config')
}

function editAIConfig(id) {
  const cfg = Storage.getAIConfigs().find(c => c.id === id)
  if (!cfg) return
  state.editingConfigId = id
  document.getElementById('modal-ai-config-title').textContent = '编辑 AI 配置'
  document.getElementById('cfg-name').value = cfg.name
  document.getElementById('cfg-provider').value = cfg.provider
  document.getElementById('cfg-key').value = cfg.apiKey
  document.getElementById('cfg-url').value = cfg.baseUrl || ''
  document.getElementById('cfg-model').value = cfg.model
  document.getElementById('test-result').textContent = ''
  onProviderChange()
  openModal('modal-ai-config')
}

function saveAIConfig() {
  const name = document.getElementById('cfg-name').value.trim()
  if (!name) { showToast('请输入配置名称', 'error'); return }

  const data = {
    name,
    provider: document.getElementById('cfg-provider').value,
    apiKey: document.getElementById('cfg-key').value.trim(),
    baseUrl: document.getElementById('cfg-url').value.trim(),
    model: document.getElementById('cfg-model').value.trim() || 'gpt-3.5-turbo'
  }

  if (state.editingConfigId) {
    Storage.updateAIConfig(state.editingConfigId, data)
    showToast('配置已更新', 'success')
  } else {
    Storage.addAIConfig(data)
    showToast('配置已添加', 'success')
  }

  closeModal('modal-ai-config')
  renderAIConfigs()
}

function deleteAIConfig(id) {
  if (!confirm('确定删除此配置？')) return
  Storage.deleteAIConfig(id)
  renderAIConfigs()
  showToast('配置已删除', 'info')
}

function setDefaultConfig(id) {
  const configs = Storage.getAIConfigs().map(c => ({ ...c, isDefault: c.id === id }))
  Storage.saveAIConfigs(configs)
  renderAIConfigs()
}

async function testAIConfig() {
  const btn = document.getElementById('test-btn')
  const result = document.getElementById('test-result')
  const cfg = {
    provider: document.getElementById('cfg-provider').value,
    apiKey: document.getElementById('cfg-key').value.trim(),
    baseUrl: document.getElementById('cfg-url').value.trim(),
    model: document.getElementById('cfg-model').value.trim() || 'gpt-3.5-turbo'
  }
  
  btn.disabled = true
  result.textContent = '测试中...'
  result.style.color = 'var(--text2)'

  const res = await AIService.testConnection(cfg)
  btn.disabled = false
  
  if (res.success) {
    result.textContent = '✅ 连接成功'
    result.style.color = 'var(--green)'
  } else {
    result.textContent = '❌ ' + res.message
    result.style.color = 'var(--red)'
  }
}

// ===== AI GENERATE =====
function showAIGenerate() {
  document.getElementById('ai-gen-desc').value = ''
  document.getElementById('ai-gen-output').textContent = '等待生成...'
  document.getElementById('ai-gen-actions').style.display = 'none'
  openModal('modal-ai-gen')
}

// Also accessible from main toolbar
document.addEventListener('DOMContentLoaded', () => {
  const toolbar = document.querySelector('.toolbar.primary')
  // Toolbar AI gen button added dynamically if needed
})

async function runAIGenerate() {
  const desc = document.getElementById('ai-gen-desc').value.trim()
  if (!desc) { showToast('请描述你需要什么提示词', 'error'); return }

  const config = Storage.getDefaultAIConfig()
  if (!config) { showToast('请先在"AI 配置"中添加 AI 模型', 'error'); return }

  const btn = document.getElementById('ai-gen-btn')
  const spinner = document.getElementById('ai-gen-spinner')
  btn.disabled = true
  spinner.style.display = ''
  
  const output = document.getElementById('ai-gen-output')
  output.textContent = ''
  output.classList.add('streaming')

  try {
    state.aiGenResult = await AIService.generatePrompt(
      desc, Storage.getSettings(), config,
      (chunk, full) => { output.textContent = full }
    )
    output.classList.remove('streaming')
    document.getElementById('ai-gen-actions').style.display = ''
  } catch(e) {
    output.classList.remove('streaming')
    output.textContent = '生成失败：' + e.message
    showToast('AI 生成失败', 'error')
  } finally {
    btn.disabled = false
    spinner.style.display = 'none'
  }
}

async function regenAI() {
  runAIGenerate()
}

function useAIGenResult() {
  if (!state.aiGenResult) return
  
  // Check if isJinja
  const isJinja = JinjaRenderer.isJinjaTemplate(state.aiGenResult)
  
  // Pre-fill the add prompt form
  document.getElementById('p-content').value = state.aiGenResult
  state.isJinjaMode = isJinja
  document.getElementById('jinja-switch').classList.toggle('on', isJinja)
  updateJinjaButtons()
  updateVarsHint()
  
  closeModal('modal-ai-gen')
  
  if (!document.getElementById('modal-prompt').style.display || document.getElementById('modal-prompt').style.display === 'none') {
    showAddPrompt()
    document.getElementById('p-content').value = state.aiGenResult
  }
}

// ===== AI OPTIMIZE =====
function showAIOptimize() {
  document.getElementById('opt-instruction').value = ''
  document.getElementById('ai-opt-output').textContent = '点击"开始优化"生成结果...'
  document.getElementById('ai-opt-actions').style.display = 'none'
  openModal('modal-ai-opt')
}

function setOptInstruction(text) {
  document.getElementById('opt-instruction').value = text
}

async function runAIOptimize() {
  const content = document.getElementById('p-content').value.trim()
  if (!content) { showToast('提示词内容为空', 'error'); return }

  const config = Storage.getDefaultAIConfig()
  if (!config) { showToast('请先配置 AI 模型', 'error'); return }

  const instruction = document.getElementById('opt-instruction').value.trim()

  const btn = document.getElementById('ai-opt-btn')
  const spinner = document.getElementById('ai-opt-spinner')
  btn.disabled = true
  spinner.style.display = ''

  const output = document.getElementById('ai-opt-output')
  output.textContent = ''
  output.classList.add('streaming')

  try {
    state.aiOptResult = await AIService.optimizePrompt(
      content, instruction, Storage.getSettings(), config,
      (chunk, full) => { output.textContent = full }
    )
    output.classList.remove('streaming')
    document.getElementById('ai-opt-actions').style.display = ''
  } catch(e) {
    output.classList.remove('streaming')
    output.textContent = '优化失败：' + e.message
    showToast('AI 优化失败', 'error')
  } finally {
    btn.disabled = false
    spinner.style.display = 'none'
  }
}

async function reoptimizeAI() {
  runAIOptimize()
}

function applyOptResult() {
  if (!state.aiOptResult) return
  document.getElementById('p-content').value = state.aiOptResult
  const isJinja = JinjaRenderer.isJinjaTemplate(state.aiOptResult)
  state.isJinjaMode = isJinja
  document.getElementById('jinja-switch').classList.toggle('on', isJinja)
  updateJinjaButtons()
  updateVarsHint()
  closeModal('modal-ai-opt')
  showToast('已应用优化结果', 'success')
}

async function aiExtractVariables() {
  const content = document.getElementById('p-content').value.trim()
  if (!content) { showToast('提示词内容为空', 'error'); return }

  const config = Storage.getDefaultAIConfig()
  if (!config) { 
    showToast('请先配置 AI 模型', 'error')
    return
  }

  showToast('AI 正在提取变量...', 'info')
  try {
    const result = await AIService.extractVariables(content, config, null)
    document.getElementById('p-content').value = result
    updateVarsHint()
    showToast('变量提取完成', 'success')
  } catch(e) {
    showToast('提取失败：' + e.message, 'error')
  }
}

// ===== CATEGORIES =====
function initColorPresets() {
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4']
  const el = document.getElementById('color-presets')
  if (!el) return
  el.innerHTML = colors.map(c => `
    <div onclick="document.getElementById('cat-color').value='${c}'" 
         style="width:20px;height:20px;border-radius:50%;background:${c};cursor:pointer;flex-shrink:0;border:2px solid transparent"
         onmouseover="this.style.borderColor='white'" onmouseout="this.style.borderColor='transparent'"></div>
  `).join('')
}

function showAddCategory() {
  document.getElementById('cat-name').value = ''
  document.getElementById('cat-color').value = '#6366f1'
  openModal('modal-cat')
}

function saveCategory() {
  const name = document.getElementById('cat-name').value.trim()
  if (!name) { showToast('请输入分类名称', 'error'); return }
  const color = document.getElementById('cat-color').value
  Storage.addCategory(name, color)
  closeModal('modal-cat')
  renderAll()
  showToast('分类已创建', 'success')
}

// ===== BACKUP =====
function renderBackup() {
  const el = document.getElementById('backup-content')
  const prompts = Storage.getPrompts()
  const history = Storage.getHistory()
  const backups = Storage.getBackupList()
  const settings = Storage.getSettings()
  const autoBackup = settings.autoBackup !== false
  const lastBackup = settings.lastBackupAt
    ? new Date(settings.lastBackupAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
    : '从未备份'

  el.innerHTML = `
  <div class="backup-section">
    <div class="backup-title">📊 当前数据</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      ${[['提示词', prompts.length], ['历史记录', history.length], ['备份数量', backups.length]].map(([label, count]) => `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:var(--accent2);font-family:var(--font-mono)">${count}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px">${label}</div>
        </div>`).join('')}
    </div>
  </div>

  <div class="backup-section">
    <div class="backup-title">☁️ uTools 云备份</div>

    <!-- Auto backup toggle -->
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border:1px solid var(${autoBackup ? '--accent' : '--border'});border-radius:10px;margin-bottom:12px;transition:border-color 0.2s;">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600;color:var(--text)">自动备份</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">
          关闭插件时自动同步到 uTools 云端 &nbsp;·&nbsp; 上次备份：<span style="color:var(--${autoBackup ? 'green' : 'text3'})">${lastBackup}</span>
        </div>
      </div>
      <div onclick="toggleAutoBackup()" style="
        width:40px;height:22px;border-radius:11px;cursor:pointer;
        background:${autoBackup ? 'var(--accent)' : 'var(--bg4)'};
        border:1px solid ${autoBackup ? 'var(--accent)' : 'var(--border2)'};
        position:relative;transition:all 0.2s;flex-shrink:0;">
        <div style="
          position:absolute;top:2px;
          left:${autoBackup ? '20px' : '2px'};
          width:16px;height:16px;border-radius:50%;
          background:white;transition:left 0.2s;
          box-shadow:0 1px 3px rgba(0,0,0,0.2);"></div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
      <button class="btn btn-primary" onclick="doCloudBackup()">📤 立即备份</button>
      <span style="font-size:11px;color:var(--text3)">备份数量上限 30 条，超出自动删除最旧的</span>
    </div>

    <div id="backup-list">
      ${backups.length === 0
        ? '<div style="font-size:12px;color:var(--text3);padding:8px 0">暂无云端备份记录</div>'
        : backups.slice(0, 10).map(b => `
          <div class="backup-item">
            <div class="backup-item-info">
              <div class="backup-item-key" style="font-size:12px;color:var(--text);font-family:var(--font-mono)">📦 ${b.date}</div>
            </div>
            <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px" onclick="restoreBackup('${b.key}')">恢复</button>
            <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px;color:var(--red)" onclick="deleteBackup('${b.key}')">删除</button>
          </div>`).join('')}
    </div>
  </div>

  <div class="backup-section">
    <div class="backup-title">💾 本地文件备份</div>
    <div class="backup-desc">将数据导出为 JSON 文件保存到本地，或从 JSON 文件导入恢复。</div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-secondary" onclick="exportJSON()">📥 导出 JSON</button>
      <label class="btn btn-secondary" style="cursor:pointer">
        📤 导入 JSON
        <input type="file" accept=".json" style="display:none" onchange="importJSON(this)">
      </label>
    </div>
  </div>

  <div class="backup-section">
    <div class="backup-title" style="color:var(--red)">⚠️ 危险操作</div>
    <button class="btn btn-danger" onclick="clearAllData()">🗑 清空所有数据</button>
  </div>
  `
}

function doCloudBackup() {
  const result = Storage.backupToUtools()
  if (result.success) {
    showToast(`备份成功 (${Math.round(result.size/1024)}KB)`, 'success')
    renderBackup()
  } else {
    showToast('备份失败：' + result.message, 'error')
  }
}

function toggleAutoBackup() {
  const settings = Storage.getSettings()
  const newVal = settings.autoBackup === false ? true : false
  Storage.saveSettings({ ...settings, autoBackup: newVal })
  renderBackup()
  showToast(newVal ? '已开启自动备份' : '已关闭自动备份', 'info')
}

function deleteBackup(key) {
  if (!confirm('确定删除此备份？')) return
  try {
    if (window.utools) utools.dbStorage.removeItem(key)
    showToast('备份已删除', 'info')
    renderBackup()
  } catch(e) {
    showToast('删除失败：' + e.message, 'error')
  }
}

function restoreBackup(key) {
  if (!confirm('确定从此备份恢复？当前数据将被覆盖！')) return
  const result = Storage.restoreFromBackup(key)
  if (result.success) {
    showToast('恢复成功', 'success')
    renderAll()
  } else {
    showToast('恢复失败：' + result.message, 'error')
  }
}

function exportJSON() {
  const data = Storage.exportAll()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `promptmind-backup-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
  showToast('导出成功', 'success')
}

function importJSON(input) {
  const file = input.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    if (!confirm('导入将覆盖现有数据，确定继续？')) return
    const result = Storage.importAll(e.target.result)
    if (result.success) {
      showToast('导入成功', 'success')
      renderAll()
    } else {
      showToast(result.message, 'error')
    }
  }
  reader.readAsText(file)
  input.value = ''
}

function clearAllData() {
  if (!confirm('⚠️ 警告：这将删除所有提示词、历史记录和设置！此操作不可撤销！\n\n确定清空所有数据吗？')) return
  if (!confirm('最后确认：真的要清空所有数据吗？')) return
  ;[Storage.KEYS.PROMPTS, Storage.KEYS.CATEGORIES, Storage.KEYS.HISTORY, Storage.KEYS.SETTINGS].forEach(key => {
    if (window.utools) {
      try { utools.db.remove(key) } catch(e) {}
    }
  })
  showToast('数据已清空', 'info')
  renderAll()
}

// ===== MODAL HELPERS =====
function openModal(id) {
  document.getElementById(id).style.display = 'flex'
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none'
}

function closeModalOutside(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id)
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.panel-overlay').forEach(el => {
      if (el.style.display !== 'none') el.style.display = 'none'
    })
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault()
    showAddPrompt()
  }
})

// ===== TOAST =====
let toastTimer
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.className = 'show ' + type
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { t.className = '' }, 2500)
}

// ===== UTILS =====
function escHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escAttr(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function deleteCategory(e, id) {
  e.stopPropagation()

  if (!confirm('确定删除这个分类吗？')) return

  Storage.deleteCategory(id)

  // 把属于这个分类的提示词分类清空
  const prompts = Storage.getPrompts()
  prompts.forEach(p => {
    if (p.category === id) p.category = ''
  })
  Storage.savePrompts(prompts)

  renderAll()
}
