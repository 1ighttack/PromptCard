// preload.js - uTools 预加载脚本，提供 Node.js 能力

const { contextBridge } = require('electron')
const path = require('path')
const os = require('os')

// 暴露给渲染进程的 API
window.preload = {
  // 获取系统信息
  getOS: () => os.platform(),
  getHome: () => os.homedir(),
  
  // 文件系统操作（用于备份/恢复）
  fs: {
    readFile: (filePath) => {
      const fs = require('fs')
      return fs.readFileSync(filePath, 'utf-8')
    },
    writeFile: (filePath, content) => {
      const fs = require('fs')
      fs.writeFileSync(filePath, content, 'utf-8')
    },
    exists: (filePath) => {
      const fs = require('fs')
      return fs.existsSync(filePath)
    }
  },
  
  // 打开外部链接
  openExternal: (url) => {
    const { shell } = require('electron')
    shell.openExternal(url)
  },
  
  // 获取插件目录
  getPluginPath: () => {
    return __dirname
  }
}
