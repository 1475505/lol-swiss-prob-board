# LOL S赛瑞士轮抽签概率分析工具

【算分工具】根据LOL S赛瑞士轮抽签规则和回避规则，模拟瑞士轮的对阵情况看板，提供模拟抽签服务、指定胜者计算下一轮抽签，战队对手交手概率的工具。

## 🎯 项目简介

本项目是一个纯前端的概率分析工具。

## 功能展示

### 主界面 - 瑞士轮看板
- 清晰展示5轮瑞士轮的完整赛程
- 用户可以指定未来的比赛战队和结果
- 保持规则合法性，满足回避规则

> 瑞士轮看板模拟时，可能因为回避规则，导致最后比赛无可选对手的情况。建议先指定所有比赛的队伍A，再依次选择队伍B


### 抽签模拟弹窗
- 模拟各个轮次的抽签
- 显示可能的对阵安排

### 概率推演分析
- **自定义比赛胜率(默认50%)，推测下一轮签运**
- 支持各个轮次的下一轮推演

## 📊 数据维护

### 比赛数据位置
比赛数据存储在 <mcfile name="matches.json" path="./app/public/matches.json"></mcfile> 文件中。

### 数据格式说明
```json
{
  "teams": [
    { "name": "AL", "zone": "LPL" },
    { "name": "BLG", "zone": "LPL" }
  ],
  "rounds": [
    {
      "round": 3,
      "group": "1-1",
      "teamA": "G2",
      "teamB": "BLG",
      "winner": "G2"
    }
  ]
}
```

> 支持用null表示未完成的比赛

## 🛠️ 技术栈

- **前端框架**：[Svelte 5](https://svelte.dev/) - 现代化的响应式前端框架
- **构建工具**：[Vite](https://vitejs.dev/) - 快速的前端构建工具
- **样式框架**：[TailwindCSS](https://tailwindcss.com/) - 实用优先的CSS框架
- **开发语言**：JavaScript/TypeScript
- **部署平台**：GitHub Pages
- **CI/CD**：GitHub Actions

## 🚀 部署和使用

### 本地开发
1. **克隆项目**
```bash
git clone https://github.com/your-username/lol-swiss-prob-board.git
cd lol-swiss-prob-board/app
```

2. **安装依赖**
```bash
npm install
```

3. **启动开发服务器**
```bash
npm run dev
```

4. **访问应用**
打开浏览器访问 `http://localhost:5173`

### 生产部署
项目已配置GitHub Actions自动部署到GitHub Pages：

1. **推送到主分支**
```bash
git push origin main
```

2. **自动构建部署**
GitHub Actions会自动构建并部署到GitHub Pages

3. **访问线上版本**
部署完成后可通过GitHub Pages URL访问

## 项目限制

- 大部分代码由AI生成，质量极低，单一功能存在多次重复实现
- 不支持第一轮抽签，因为涉及种子池。后续可实现
- 概率推演里的双队模式不知道是AI是写了什么，先禁用
- 暂未支持数据的导入导出

---

**注意**：本项目仅用于学习和娱乐目的，不代表官方立场。所有概率计算基于数学模型，实际比赛结果可能存在差异。