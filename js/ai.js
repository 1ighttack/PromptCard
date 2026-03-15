// ai.js - AI 服务模块

window.AIService = (function() {

  async function callAI(config, messages, onChunk) {
    if (!config) throw new Error('请先配置 AI 模型')
    
    const baseUrl = config.baseUrl || getDefaultBaseUrl(config.provider)
    const url = baseUrl.replace(/\/$/, '') + '/chat/completions'
    
    const body = {
      model: config.model,
      messages,
      max_tokens: 2000,
      stream: !!onChunk
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`API 错误 ${response.status}: ${err}`)
    }

    if (onChunk) {
      // 流式读取
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
        for (const line of lines) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content || ''
            if (delta) {
              fullText += delta
              onChunk(delta, fullText)
            }
          } catch(e) {}
        }
      }
      return fullText
    } else {
      const data = await response.json()
      return data.choices?.[0]?.message?.content || ''
    }
  }

  function getDefaultBaseUrl(provider) {
    const urls = {
      'openai': 'https://api.openai.com/v1',
      'deepseek': 'https://api.deepseek.com/v1',
      'zhipu': 'https://open.bigmodel.cn/api/paas/v4',
      'moonshot': 'https://api.moonshot.cn/v1',
      'qwen': 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      'ollama': 'http://localhost:11434/v1',
      'lmstudio': 'http://localhost:1234/v1'
    }
    return urls[provider] || 'https://api.openai.com/v1'
  }

  // 生成提示词
  async function generatePrompt(description, settings, config, onChunk) {
    const systemPrompt = settings?.aiGenerateSystemPrompt || 
      '你是一个专业的 AI 提示词工程师，请帮我创建高质量的提示词模板。使用 {{变量名}} 语法标记可复用的变量。'
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请根据以下描述，创建一个专业的 AI 提示词模板：\n\n${description}\n\n要求：\n1. 使用 {{变量名}} 标记关键变量\n2. 结构清晰，逻辑完整\n3. 只输出提示词内容，不需要额外解释` }
    ]

    return callAI(config, messages, onChunk)
  }

  // 优化提示词
  async function optimizePrompt(content, instruction, settings, config, onChunk) {
    const systemPrompt = settings?.aiOptimizeSystemPrompt || 
      '你是一个提示词优化专家，请帮我改进和优化提示词，使其更具体、更清晰、更有效。'
    
    const optimizeInstruction = instruction || '使提示词更加具体、清晰和有效'
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请优化以下提示词，${optimizeInstruction}：\n\n${content}\n\n要求：只输出优化后的提示词，不需要额外解释。` }
    ]

    return callAI(config, messages, onChunk)
  }

  // 提取变量
  async function extractVariables(content, config, onChunk) {
    const messages = [
      { role: 'system', content: '你是一个提示词变量提取专家。' },
      { role: 'user', content: `请分析以下提示词，将其中可以参数化的部分用 {{变量名}} 替换，输出处理后的模板：\n\n${content}\n\n要求：\n1. 只替换真正可变的内容\n2. 变量名使用中文或英文均可\n3. 只输出处理后的模板内容` }
    ]

    return callAI(config, messages, onChunk)
  }

  // 测试连接
  async function testConnection(config) {
    try {
      const result = await callAI(config, [
        { role: 'user', content: '请回复"连接成功"' }
      ], null)
      return { success: true, message: result }
    } catch(e) {
      return { success: false, message: e.message }
    }
  }

  const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
    { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'] },
    { id: 'zhipu', name: '智谱 GLM', models: ['glm-4', 'glm-4-flash', 'glm-3-turbo'] },
    { id: 'moonshot', name: 'Moonshot Kimi', models: ['moonshot-v1-8k', 'moonshot-v1-32k'] },
    { id: 'qwen', name: '阿里通义千问', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'] },
    { id: 'ollama', name: 'Ollama (本地)', models: ['llama3', 'qwen2', 'mistral', 'deepseek-r1'] },
    { id: 'lmstudio', name: 'LM Studio (本地)', models: ['local-model'] },
    { id: 'custom', name: '自定义', models: [] }
  ]

  return {
    generatePrompt,
    optimizePrompt,
    extractVariables,
    testConnection,
    getDefaultBaseUrl,
    PROVIDERS
  }
})()
