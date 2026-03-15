// storage.js - 数据存储管理模块，使用 uTools db API

window.Storage = (function() {
  
  const KEYS = {
    PROMPTS: 'promptcard_prompts',
    CATEGORIES: 'promptcard_categories',
    HISTORY: 'promptcard_history',
    AI_CONFIGS: 'promptcard_ai_configs',
    SETTINGS: 'promptcard_settings'
  }

  // ===== 通用 uTools db 操作 =====
  function dbGet(key) {
    try {
      const doc = window.utools ? utools.db.get(key) : null
      return doc ? doc.data : null
    } catch(e) {
      return null
    }
  }

  function dbSet(key, data) {
    try {
      if (!window.utools) return false
      const existing = utools.db.get(key)
      if (existing) {
        utools.db.put({ _id: key, _rev: existing._rev, data })
      } else {
        utools.db.put({ _id: key, data })
      }
      return true
    } catch(e) {
      console.error('dbSet error:', e)
      return false
    }
  }

  // ===== 提示词管理 =====
  function getPrompts() {
    return dbGet(KEYS.PROMPTS) || []
  }

  function savePrompts(prompts) {
    return dbSet(KEYS.PROMPTS, prompts)
  }

  function addPrompt(prompt) {
    const prompts = getPrompts()
    const newPrompt = {
      id: Date.now().toString(),
      title: prompt.title || '未命名提示词',
      content: prompt.content || '',
      description: prompt.description || '',
      category: prompt.category || '',
      tags: prompt.tags || [],
      isJinja: prompt.isJinja || false,
      isFavorite: false,
      rating: 0,
      useCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    prompts.unshift(newPrompt)
    savePrompts(prompts)
    return newPrompt
  }

  function updatePrompt(id, updates) {
    const prompts = getPrompts()
    const idx = prompts.findIndex(p => p.id === id)
    if (idx === -1) return false
    prompts[idx] = { ...prompts[idx], ...updates, updatedAt: new Date().toISOString() }
    return savePrompts(prompts)
  }

  function deletePrompt(id) {
    const prompts = getPrompts().filter(p => p.id !== id)
    return savePrompts(prompts)
  }

  function getPromptById(id) {
    return getPrompts().find(p => p.id === id) || null
  }

  // ===== 分类管理 =====
  function getCategories() {
    return dbGet(KEYS.CATEGORIES) || []
  }

  function saveCategories(categories) {
    return dbSet(KEYS.CATEGORIES, categories)
  }

  function addCategory(name, color) {
    const categories = getCategories()
    const newCat = {
      id: Date.now().toString(),
      name,
      color: color || '#6366f1',
      createdAt: new Date().toISOString()
    }
    categories.push(newCat)
    saveCategories(categories)
    return newCat
  }

  function deleteCategory(id) {
    const categories = getCategories().filter(c => c.id !== id)
    return saveCategories(categories)
  }

  // ===== 历史记录 =====
  function getHistory() {
    return dbGet(KEYS.HISTORY) || []
  }

  function addHistory(entry) {
    const history = getHistory()
    const newEntry = {
      id: Date.now().toString(),
      promptId: entry.promptId,
      promptTitle: entry.promptTitle,
      variables: entry.variables || {},
      renderedContent: entry.renderedContent || '',
      usedAt: new Date().toISOString()
    }
    history.unshift(newEntry)
    // 只保留最近500条
    if (history.length > 500) history.splice(500)
    dbSet(KEYS.HISTORY, history)
    return newEntry
  }

  function clearHistory() {
    return dbSet(KEYS.HISTORY, [])
  }

  // ===== AI 配置 =====
  function getAIConfigs() {
    return dbGet(KEYS.AI_CONFIGS) || []
  }

  function saveAIConfigs(configs) {
    return dbSet(KEYS.AI_CONFIGS, configs)
  }

  function addAIConfig(config) {
    const configs = getAIConfigs()
    const newConfig = {
      id: Date.now().toString(),
      name: config.name || '新配置',
      provider: config.provider || 'openai',
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || '',
      model: config.model || 'gpt-3.5-turbo',
      isDefault: configs.length === 0,
      createdAt: new Date().toISOString()
    }
    configs.push(newConfig)
    saveAIConfigs(configs)
    return newConfig
  }

  function updateAIConfig(id, updates) {
    const configs = getAIConfigs()
    const idx = configs.findIndex(c => c.id === id)
    if (idx === -1) return false
    configs[idx] = { ...configs[idx], ...updates }
    return saveAIConfigs(configs)
  }

  function deleteAIConfig(id) {
    const configs = getAIConfigs().filter(c => c.id !== id)
    return saveAIConfigs(configs)
  }

  function getDefaultAIConfig() {
    const configs = getAIConfigs()
    return configs.find(c => c.isDefault) || configs[0] || null
  }

  // ===== 设置 =====
  function getSettings() {
    return dbGet(KEYS.SETTINGS) || {
      theme: 'light',
      language: 'zh-CN',
      defaultView: 'card',
      autoBackup: true,
      aiGenerateSystemPrompt: '你是一个专业的 AI 提示词工程师，请帮我创建高质量的提示词模板。',
      aiOptimizeSystemPrompt: '你是一个提示词优化专家，请帮我改进和优化提示词，使其更具体、更清晰、更有效。'
    }
  }

  function saveSettings(settings) {
    return dbSet(KEYS.SETTINGS, settings)
  }

  // ===== 备份与恢复 =====
  function exportAll() {
    return JSON.stringify({
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      prompts: getPrompts(),
      categories: getCategories(),
      history: getHistory(),
      aiConfigs: getAIConfigs().map(c => ({ ...c, apiKey: '***' })), // 不导出 apiKey
      settings: getSettings()
    }, null, 2)
  }

  function importAll(jsonStr) {
    try {
      const data = JSON.parse(jsonStr)
      if (data.prompts) savePrompts(data.prompts)
      if (data.categories) saveCategories(data.categories)
      if (data.history) dbSet(KEYS.HISTORY, data.history)
      if (data.settings) saveSettings(data.settings)
      return { success: true, message: '导入成功' }
    } catch(e) {
      return { success: false, message: '导入失败: ' + e.message }
    }
  }

  function backupToUtools() {
    try {
      const data = exportAll()
      const key = 'promptcard_backup_' + new Date().toISOString().split('T')[0]
      if (window.utools) {
        utools.dbStorage.setItem(key, data)
        // Save last backup time
        const s = getSettings()
        saveSettings({ ...s, lastBackupAt: new Date().toISOString() })
      }
      return { success: true, key, size: data.length }
    } catch(e) {
      return { success: false, message: e.message }
    }
  }

  function getBackupList() {
    if (!window.utools) return []
    try {
      const allDocs = utools.db.allDocs()
      return allDocs.filter(d => d._id && d._id.startsWith('promptcard_backup_'))
        .map(d => ({ key: d._id, date: d._id.replace('promptcard_backup_', '') }))
        .sort((a, b) => b.date.localeCompare(a.date))
    } catch(e) {
      return []
    }
  }

  function restoreFromBackup(key) {
    try {
      const data = window.utools ? utools.dbStorage.getItem(key) : null
      if (!data) return { success: false, message: '备份不存在' }
      return importAll(data)
    } catch(e) {
      return { success: false, message: e.message }
    }
  }

  // ===== 初始化示例数据 =====
  function initSampleData() {
    const prompts = getPrompts()
    if (prompts.length > 0) return
    
    const sampleCategories = [
      { id: 'cat1', name: '写作助手', color: '#6366f1', createdAt: new Date().toISOString() },
      { id: 'cat2', name: '代码开发', color: '#10b981', createdAt: new Date().toISOString() },
      { id: 'cat3', name: '数据分析', color: '#f59e0b', createdAt: new Date().toISOString() }
    ]
    saveCategories(sampleCategories)

    const samplePrompts = [
      {
        id: 'p1',
        title: '产品分析报告',
        content: '请帮我分析 {{产品名称}} 的市场竞争力。\n\n重点关注：\n- 目标用户群体\n- 核心竞争优势\n- 潜在风险与机会\n\n分析深度：{{分析深度}}',
        description: '快速生成产品市场分析报告',
        category: 'cat1',
        tags: ['产品', '分析', '市场'],
        isJinja: false,
        isFavorite: true,
        rating: 5,
        useCount: 12,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'p2',
        title: '代码审查（Jinja模板）',
        content: '请帮我审查以下 {{语言}} 代码：\n\n```{{语言}}\n{{代码内容}}\n```\n\n{% if 审查重点 == "安全" %}\n请重点关注安全漏洞和注入风险。\n{% elif 审查重点 == "性能" %}\n请重点关注性能瓶颈和优化建议。\n{% else %}\n请进行全面的代码质量审查。\n{% endif %}\n\n{% if 需要示例 %}\n请为每个建议提供改进示例代码。\n{% endif %}',
        description: '灵活的代码审查模板，支持多种审查重点',
        category: 'cat2',
        tags: ['代码', '审查', 'Jinja'],
        isJinja: true,
        isFavorite: false,
        rating: 4,
        useCount: 8,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'p3',
        title: '功能列表分析（循环）',
        content: '请分析以下功能的实现方案：\n\n{% for 功能 in 功能列表 %}\n### {{loop.index}}. {{功能}}\n- 技术实现思路\n- 预估工作量\n- 潜在风险\n\n{% endfor %}\n\n优先级：{{优先级}}',
        description: '使用循环模板批量分析功能列表',
        category: 'cat2',
        tags: ['功能', '规划', 'Jinja', '循环'],
        isJinja: true,
        isFavorite: false,
        rating: 4,
        useCount: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]
    savePrompts(samplePrompts)
  }

  return {
    // 提示词
    getPrompts, savePrompts, addPrompt, updatePrompt, deletePrompt, getPromptById,
    // 分类
    getCategories, saveCategories, addCategory, deleteCategory,
    // 历史
    getHistory, addHistory, clearHistory,
    // AI配置
    getAIConfigs, addAIConfig, updateAIConfig, deleteAIConfig, getDefaultAIConfig,
    // 设置
    getSettings, saveSettings,
    // 备份恢复
    exportAll, importAll, backupToUtools, getBackupList, restoreFromBackup,
    // 初始化
    initSampleData,
    KEYS
  }
})()
