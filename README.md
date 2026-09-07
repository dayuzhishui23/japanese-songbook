# 日语歌本

一个浏览器端日语学唱工具，可为用户自行提供的歌词生成罗马音和中文跟唱音，并支持多歌曲管理、逐行编辑和本机音源对时。

- 歌词、歌曲资料和时间点只保存在当前浏览器。
- 音频文件只在当前页面中读取，不会上传。
- 网站不内置或抓取完整歌词。

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
