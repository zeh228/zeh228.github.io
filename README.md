# 雪原孤亭 · 极寒之境

基于 Three.js 的 3D 虚拟空间:暴雪、狂风、流雾、闪电交织的恶劣天气中,一座中式重檐六角亭屹立在雪原中央。

## 场景特性

- ❄ **暴雪粒子** — 15000 枚雪花,随风速与阵风实时改变轨迹
- 🌬 **风痕流线** — 横向疾驰的白色流线,表现狂风
- 🌫 **地面流雾** + 指数雾 — 能见度随风暴强度变化
- ⚡ **随机闪电** — 三连脉冲闪光,照亮天空
- 🏯 **中式重檐六角亭** — 石台基、台阶、栏杆、斗拱、双层翘檐、宝顶,亭内悬挂暖灯
- 🏔 **程序化地形** — FBM 噪声生成雪原、远山、乱石、枯灌木
- 🔊 **程序合成风声** — WebAudio 布朗噪声合成,点击按钮开启
- 🎛 **风暴强度滑块** — 实时调节风雪烈度

## 本地运行

```bash
cd virtual-space
node server.js          # 默认端口 8080
# 或指定端口: node server.js 3000
# 没有 Node 也可以: python3 -m http.server 8080
```

浏览器打开 <http://localhost:8080>

## 部署到自己的服务器

整个目录是纯静态文件(Three.js 已本地化到 `lib/`,不依赖任何外网 CDN),直接上传即可。

### 方式一:Node 直接托管

```bash
# 上传
scp -r virtual-space user@你的服务器IP:~/
# 登录服务器后台运行
ssh user@你的服务器IP
cd ~/virtual-space
nohup node server.js 8080 > server.log 2>&1 &
# 或使用 pm2: pm2 start server.js --name snow-pavilion
```

### 方式二:Nginx 托管(推荐生产环境)

```nginx
server {
    listen 80;
    server_name 你的域名;
    root /home/user/virtual-space;
    index index.html;
    location / {
        try_files $uri $uri/ =404;
    }
}
```

```bash
scp -r virtual-space user@你的服务器IP:/home/user/
sudo nginx -t && sudo systemctl reload nginx
```

> 注意:服务器防火墙/安全组需放行对应端口(8080 或 80)。

## 目录结构

```
virtual-space/
├── index.html            # 照片级全景版首页(多场景)
├── pano.js               # 全景版:360° 环视 + 风雪天气 + 场景系统
├── scenes.json           # 场景清单(加新场景改这里)
├── classic.html          # 可漫游 3D 低模版
├── main.js               # 低模版场景代码
├── server.js             # 零依赖静态服务器
├── assets/
│   └── pano.jpg          # 等距柱状全景图(2:1)
├── lib/
│   ├── three.module.js   # Three.js r160(本地化)
│   └── OrbitControls.js  # 轨道相机控制器
└── README.md
```

## 添加新场景

1. 用 AI 生成一张**等距柱状全景图**(equirectangular,比例 2:1,如 4096×2048),命名如 `assets/dusk.jpg`
2. 在 `scenes.json` 中追加一条:

```json
{
  "id": "dusk2",
  "name": "黄昏·新景",
  "desc": "一句话描述",
  "file": "assets/dusk.jpg",
  "tint": [1.1, 0.85, 0.65],
  "exposure": 0.95,
  "storm": 0.5,
  "moon": false
}
```

刷新页面即可在右上角选择新场景。`tint` 为 RGB 色彩分级(1.0 为原色),`exposure` 控制明暗,`storm` 为该场景默认风暴强度(0.3~1.8)。
