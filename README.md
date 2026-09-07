# 日语歌本

一个日语学唱工具。搜索歌曲后自动取得时间轴歌词，生成罗马音和中文跟唱音，并随在线音源逐句高亮。

- 搜索、歌词和音频通过运行时接口取得，仓库不内置完整歌词或音频。
- 已添加的歌曲、校音和人工修改只保存在当前浏览器。
- 在线来源可能失效；无法取得时页面会明确提示。

## 本地运行

```bash
npm ci
npm run dev
```

## GitHub Pages 构建

```bash
npm run build:pages
npm run preview:pages
```

GitHub Pages 版本使用 Sites 部署提供的运行时接口。
