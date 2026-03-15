/*!
 * Nunjucks (slim build for uTools plugin)
 * Lightweight Jinja2-compatible template engine
 * We'll implement a minimal Jinja2 parser inline
 */

// Minimal Jinja2-compatible template renderer
window.JinjaRenderer = (function() {
  
  function render(template, context) {
    try {
      return processTemplate(template, context)
    } catch(e) {
      return '[模板错误: ' + e.message + ']'
    }
  }

  function processTemplate(template, context) {
    // Guard: must be a string
    if (typeof template !== 'string') return ''
    // Handle {% for %} loops
    template = processFor(template, context)
    // Handle {% if/elif/else/endif %}
    template = processIf(template, context)
    // Handle {{ variable }} and {{ variable | filter }}
    template = processVariables(template, context)
    // Clean up any leftover tags
    template = template.replace(/\{%[^%]*%\}/g, '').trim()
    return template
  }

  function processFor(template, context) {
    if (typeof template !== 'string') return ''
    const VARNAME = '[\\w\\u4e00-\\u9fa5]+'
    const forRegex = new RegExp(
      '\\{%[-\\s]*for\\s+(' + VARNAME + ')\\s+in\\s+(' + VARNAME + ')\\s*[-\\s]*%\\}' +
      '([\\s\\S]*?)' +
      '\\{%[-\\s]*endfor\\s*[-\\s]*%\\}',
      'g'
    )
    return template.replace(forRegex, (match, varName, listName, body) => {
      if (typeof body !== 'string') return ''
      const list = resolvePath(context, listName)
      if (!Array.isArray(list)) return ''
      return list.map((item, index) => {
        const loopContext = Object.assign({}, context, {
          [varName]: item,
          loop: {
            index: index + 1,
            index0: index,
            first: index === 0,
            last: index === list.length - 1
          }
        })
        return processTemplate(body, loopContext)
      }).join('')
    })
  }

  function processIf(template, context) {
    if (typeof template !== 'string') return ''

    // Strategy: find each if...endif block manually so we handle
    // elif/else correctly without relying on one giant fragile regex.
    // We locate the outermost {% if %}...{% endif %} and replace it.
    const IF_OPEN  = /\{%-?\s*if\s+([\s\S]*?)\s*-?%\}/
    const ELIF_TAG = /\{%-?\s*elif\s+([\s\S]*?)\s*-?%\}/
    const ELSE_TAG = /\{%-?\s*else\s*-?%\}/
    const ENDIF_TAG = /\{%-?\s*endif\s*-?%\}/
    const ANY_IF = /\{%-?\s*(?:if|elif|else|endif)\b[\s\S]*?-?%\}/g

    // Find first {% if %}
    const startMatch = IF_OPEN.exec(template)
    if (!startMatch) return template

    // Walk through all if-family tags to find the matching endif
    // (handles nesting correctly)
    let depth = 0
    let pos = 0
    let ifStart = -1
    let ifConditionStr = ''
    let endifEnd = -1

    const tagRe = /\{%-?\s*(if|elif|else|endif)\b[\s\S]*?-?%\}/g
    let tagMatch
    while ((tagMatch = tagRe.exec(template)) !== null) {
      const tag = tagMatch[0]
      const keyword = tagMatch[1]
      if (keyword === 'if') {
        if (depth === 0) {
          ifStart = tagMatch.index
          ifConditionStr = tag.match(/\{%-?\s*if\s+([\s\S]*?)\s*-?%\}/)?.[1]?.trim() || ''
        }
        depth++
      } else if (keyword === 'endif') {
        depth--
        if (depth === 0) {
          endifEnd = tagMatch.index + tag.length
          break
        }
      }
    }

    // Could not find matching endif — return as-is
    if (ifStart === -1 || endifEnd === -1) return template

    const fullBlock = template.slice(ifStart, endifEnd)
    const before    = template.slice(0, ifStart)
    const after     = template.slice(endifEnd)

    // Parse the fullBlock into branches: [ {cond, body}, ..., {cond:null, body} ]
    const branches = []
    // Strip outer {% if ... %} tag
    let rest = fullBlock.replace(/^\{%-?\s*if\s+[\s\S]*?-?%\}/, '')
    // Strip trailing {% endif %}
    rest = rest.replace(/\{%-?\s*endif\s*-?%\}$/, '')

    // Split on top-level {% elif %} and {% else %}
    // We'll scan character-by-character to respect nesting
    let branchBodies = []
    let branchConds  = [ifConditionStr]
    let buf = ''
    let d = 0
    const splitRe = /\{%-?\s*(if|elif|else|endif)\b[\s\S]*?-?%\}/g
    let last = 0
    let sm
    while ((sm = splitRe.exec(rest)) !== null) {
      const kw = sm[1]
      if (kw === 'if') {
        d++
        buf += rest.slice(last, sm.index + sm[0].length)
        last = sm.index + sm[0].length
      } else if (kw === 'endif') {
        d--
        buf += rest.slice(last, sm.index + sm[0].length)
        last = sm.index + sm[0].length
      } else if (d === 0 && (kw === 'elif' || kw === 'else')) {
        // Flush current branch body
        buf += rest.slice(last, sm.index)
        last = sm.index + sm[0].length
        branchBodies.push(buf)
        buf = ''
        if (kw === 'elif') {
          const elifCond = sm[0].match(/\{%-?\s*elif\s+([\s\S]*?)\s*-?%\}/)?.[1]?.trim() || ''
          branchConds.push(elifCond)
        } else {
          branchConds.push(null) // else branch
        }
      }
    }
    // Remaining after last split tag
    buf += rest.slice(last)
    branchBodies.push(buf)

    // Evaluate branches in order
    let result = ''
    let matched = false
    for (let i = 0; i < branchBodies.length; i++) {
      const cond = branchConds[i]
      if (matched) break
      if (cond === null || evalCondition(cond, context)) {
        result = processTemplate(branchBodies[i] || '', context)
        matched = true
      }
    }

    // Recurse: there may be more if-blocks in before/after/result
    return processIf(before, context) + result + processIf(after, context)
  }

  function evalCondition(condition, context) {
    // Support Unicode/Chinese var names
    const VARNAME = '[\\w\\u4e00-\\u9fa5]+'
    // Equality check: var == "val"
    const eqMatch = condition.match(new RegExp('^(' + VARNAME + ')\\s*==\\s*["\'](.+?)["\']$'))
    if (eqMatch) return String(resolvePath(context, eqMatch[1].trim())) === eqMatch[2]

    const neqMatch = condition.match(new RegExp('^(' + VARNAME + ')\\s*!=\\s*["\'](.+?)["\']$'))
    if (neqMatch) return String(resolvePath(context, neqMatch[1].trim())) !== neqMatch[2]

    const numEqMatch = condition.match(new RegExp('^(' + VARNAME + ')\\s*==\\s*(\\d+)$'))
    if (numEqMatch) return Number(resolvePath(context, numEqMatch[1].trim())) === Number(numEqMatch[2])

    const gtMatch = condition.match(new RegExp('^(' + VARNAME + ')\\s*>\\s*(\\d+)$'))
    if (gtMatch) return Number(resolvePath(context, gtMatch[1].trim())) > Number(gtMatch[2])

    const ltMatch = condition.match(new RegExp('^(' + VARNAME + ')\\s*<\\s*(\\d+)$'))
    if (ltMatch) return Number(resolvePath(context, ltMatch[1].trim())) < Number(ltMatch[2])

    // Negation
    const notMatch = condition.match(/^not\s+(.+)$/)
    if (notMatch) return !resolvePath(context, notMatch[1].trim())
    if (condition.startsWith('!')) return !resolvePath(context, condition.slice(1).trim())

    // Simple truthiness
    const val = resolvePath(context, condition.trim())
    return !!val
  }

  function processVariables(template, context) {
    // Match {{varName}}, {{varName | filter}}, supports Unicode/Chinese
    return template.replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (match, expr) => {
      const parts = expr.split('|').map(s => s.trim())
      let value = resolvePath(context, parts[0])
      for (let i = 1; i < parts.length; i++) {
        value = applyFilter(value, parts[i])
      }
      return value !== undefined && value !== null ? String(value) : ''
    })
  }

  function resolvePath(context, path) {
    if (!path) return ''
    path = path.trim()
    // String literal
    if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) {
      return path.slice(1, -1)
    }
    // Numeric literal
    if (/^\d+(\.\d+)?$/.test(path)) return Number(path)
    // Dot-path traversal
    const parts = path.split('.')
    let val = context
    for (const part of parts) {
      if (val === null || val === undefined) return ''
      val = val[part]
    }
    return val !== undefined ? val : ''
  }

  function applyFilter(value, filter) {
    const filterName = filter.split('(')[0].trim()
    const filterArg = filter.match(/\(["']?(.*?)["']?\)/)
    const arg = filterArg ? filterArg[1] : null

    switch(filterName) {
      case 'upper': return String(value).toUpperCase()
      case 'lower': return String(value).toLowerCase()
      case 'capitalize': return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase()
      case 'title': return String(value).replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
      case 'trim': return String(value).trim()
      case 'length': return Array.isArray(value) ? value.length : String(value).length
      case 'default': return value || arg || ''
      case 'join': return Array.isArray(value) ? value.join(arg || ', ') : value
      case 'replace':
        const replaceArgs = filter.match(/replace\(["'](.+?)["'],\s*["'](.+?)["']\)/)
        if (replaceArgs) return String(value).replace(new RegExp(replaceArgs[1], 'g'), replaceArgs[2])
        return value
      case 'truncate':
        const len = parseInt(arg) || 50
        return String(value).length > len ? String(value).slice(0, len) + '...' : value
      default: return value
    }
  }

  // Extract variables from template (both {{var}} and Jinja vars)
  function extractVariables(template) {
    const vars = new Set()
    // Match any variable name: English, Chinese, digits, underscore
    // Covers {{变量名}}, {{varName}}, {{var_name}} etc.
    const VARNAME = '[\\w\\u4e00-\\u9fa5\\u3040-\\u309f\\u30a0-\\u30ff]+'

    // {{variable}} style — capture before any | filter or whitespace
    const simpleRe = new RegExp('\\{\\{\\s*(' + VARNAME + ')(?:\\s*\\|[^}]*)?\\s*\\}\\}', 'g')
    let m
    while ((m = simpleRe.exec(template)) !== null) {
      if (!['loop'].includes(m[1])) vars.add(m[1])
    }

    // for loop list variables: {% for x in LIST %}
    const forRe = new RegExp('\\{%[-\\s]*for\\s+' + VARNAME + '\\s+in\\s+(' + VARNAME + ')\\s*[-\\s]*%\\}', 'g')
    while ((m = forRe.exec(template)) !== null) {
      vars.add(m[1])
    }

    // if/elif condition variables: {% if VAR == ... %} or {% if VAR %}
    const ifRe = /\{%[-\s]*(?:if|elif)\s+([\s\S]*?)[-\s]*%\}/g
    const RESERVED = new Set(['and','or','not','in','is','true','false','none','True','False','None','loop'])
    const wordRe = new RegExp('[\\w\\u4e00-\\u9fa5]+', 'g')
    while ((m = ifRe.exec(template)) !== null) {
      const cond = m[1]
      let wm
      while ((wm = wordRe.exec(cond)) !== null) {
        const w = wm[0]
        // skip reserved words, pure numbers, and single chars that are loop vars
        if (!RESERVED.has(w) && !/^\d+$/.test(w)) vars.add(w)
      }
    }

    return [...vars]
  }

  function isJinjaTemplate(template) {
    return /\{%[\s\S]*?%\}/.test(template)
  }

  return { render, extractVariables, isJinjaTemplate }
})()
