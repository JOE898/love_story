# 我们的 999 天 ❤

情侣恋爱纪念网页 —— 手机上下滑动的「一屏一图一文」恋爱纪念册。

- **在线访问**：https://JOE898.github.io/love_story/
- **管理后台**：https://JOE898.github.io/love_story/admin.html

## 给我们自己的使用说明

### 改文案 / 换照片（完全不用碰代码）

1. 手机或电脑浏览器打开 `admin.html`
2. 粘贴 GitHub Token 登录（创建方法见下）
3. 编辑任意一屏的标题、正文、日期；上传或更换照片（自动压缩）；增加、删除、排序页面
4. 点「发布上线」→ 约 1 分钟后网站自动更新，对方手机上刷新即可看到

### 管理后台 Token 创建（Fine-grained，推荐）

1. GitHub 网页 → 右上角头像 → **Settings** → 左侧最底 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. Repository access 选 **Only select repositories** → 勾选 `love_story`
3. Permissions → Repository permissions → **Contents** 设为 **Read and write**
4. 生成后立即复制（只显示一次），粘贴到后台登录框即可

> Token 只保存在你自己浏览器的 localStorage 中，只会发送给 GitHub 官方 API，不经过任何第三方。

### 网站结构

| 文件 | 作用 |
|------|------|
| `index.html` | 前台页面 |
| `admin.html` | 管理后台 |
| `data/content.json` | 全部内容：文字、图片、纪念日、页面顺序 |
| `images/` | 所有照片 |

- 每次在后台发布 = 一次 git 提交，全部修改历史都在 GitHub 仓库里，改错了可以在 GitHub 网页上随时回退

## 技术说明

- 原生 HTML / CSS / JavaScript，零依赖、零构建，GitHub Pages 免费托管
- 纪念日 2024-01-19，在一起天数自动计算（在一起第一天记为第 1 天）
- 上传的照片会在浏览器端自动压缩（长边 1600px JPEG），不会撑大仓库
