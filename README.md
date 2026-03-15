# 提示词Card 插件

基于 [AI Gist](https://getaigist.com) 项目的 uTools 插件版本，让你在任意应用中快速调用提示词。

## 功能特性

- **模板管理** — 支持 `{{变量}}` 语法和 Jinja2 模板（if/for/filter）
- **变量填充** — 使用时动态填入变量，一键复制
- **历史追踪** — 自动记录每次使用的提示词和变量值
- **AI 辅助** — 支持 AI 生成、优化提示词、提取变量
- **分类管理** — 支持标签、分类、收藏、评分、卡片/表格视图
- **数据备份** — uTools 云备份 + 本地 JSON 导出/导入

## 界面展示
![image](https://github.com/1ighttack/PromptCard/blob/main/%E5%9B%BE%E7%89%87/1-%E7%95%8C%E9%9D%A2.png)
![image](https://github.com/1ighttack/PromptCard/blob/main/%E5%9B%BE%E7%89%87/2-ai%E9%85%8D%E7%BD%AE.png)
![image](https://github.com/1ighttack/PromptCard/blob/main/%E5%9B%BE%E7%89%87/3-%E5%A4%87%E4%BB%BD%E6%81%A2%E5%A4%8D.png)
![image](https://github.com/1ighttack/PromptCard/blob/main/%E5%9B%BE%E7%89%87/4-%E7%95%8C%E9%9D%A2%E9%A2%9C%E8%89%B2.png)

## 文件结构

```
aigist-utools/
├── plugin.json       # 插件配置
├── preload.js        # 预加载脚本（Node.js API）
├── index.html        # 主界面
├── logo.png          # 插件图标（128x128）
├── lib/
│   └── jinja.js      # Jinja2 模板引擎
└── js/
    ├── storage.js    # uTools db 数据存储
    ├── ai.js         # AI 服务（OpenAI 兼容接口）
    └── app.js        # 主应用逻辑
```

## 快捷键

- `Ctrl/Cmd + N` — 新建提示词
- `Esc` — 关闭弹窗
- 在 uTools 输入框输入 `ps:关键词` — 直接搜索提示词

## 数据存储

所有数据使用 `utools.db` API 存储，键名前缀为 `aigist_`：
- `aigist_prompts` — 提示词列表
- `aigist_categories` — 分类数据
- `aigist_history` — 使用历史
- `aigist_ai_configs` — AI 配置
- `aigist_settings` — 应用设置

云备份使用 `utools.dbStorage`，支持 uTools 官方的云同步。

## 支持的 AI 服务

- OpenAI（GPT-4, GPT-3.5）
- DeepSeek
- 智谱 GLM
- Moonshot Kimi
- 阿里通义千问
- Ollama（本地）
- LM Studio（本地）
- 任何 OpenAI 兼容接口

## License

MIT
