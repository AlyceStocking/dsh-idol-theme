# 多角色主题可行性与适配成本

检查日期：2026-10-13。基线：`AlyceStocking/dsh-yukimi-theme` 的 `main`，提交 `4b162a3572e894e71001f3cefd0105519d5c4461`。私有研究仓库：`AlyceStocking/dsh-idol-theme`。

## 结论

可以低成本收录大量角色的**素材目录**，并让用户选择其中一个角色作为当前主题及桌宠。首先需要一次中等规模的数据结构改造；之后普通角色主要是增加清单，例外素材、配色与专属台词需要人工校验。素材目录小，不等于全角色图片同时下载、解码的成本小。

原仓库公开，GitHub 的原生 fork 必须继承公开可见性，因此本仓库是保留 main 历史的独立私有副本，原仓库配置为 `upstream`。没有引入 `web_outdated` 上额外的 npm 发布提交 `eeb917a`；未来发布时应单独评估其打包改动。

## 素材规律：文件标题可复用，CDN 哈希不能直接替换

| 用途 | 雪美文件标题 | 爱丽丝对应标题 |
| --- | --- | --- |
| 签名 | `Yukimi-sign.png` | `Arisu-sign.png` |
| 服装图标 | `CGSS-Yukimi-icon-1.png` | `CGSS-Arisu-icon-1.png` |
| 小人 | `CGSS-Yukimi-Petit-1-1.png` | `CGSS-Arisu-Petit-1-1.png` |
| CGSS 背景 | `CGSS-Yukimi-SSR-1.png` | `CGSS-Arisu-SSR-1.png` |
| 特训后背景 | `CGSS-Yukimi-SSR-1+.png` | `CGSS-Arisu-SSR-1+.png` |

真实小人 URL：

- 雪美：`https://patchwiki.biligame.com/images/imascg/7/7f/6currqdaigi46vyxec0tmzkyybgnas8.png`
- 爱丽丝：`https://patchwiki.biligame.com/images/imascg/3/39/pid5z3wqqgdr0jscrse7pjyi4ynv6rh.png`

共同前缀是 `https://patchwiki.biligame.com/images/imascg/`，后续目录及文件名是不可从角色名直接替换得到的存储标识。不要猜测哈希算法或枚举 CDN 地址。建议在构建/维护阶段通过 MediaWiki API 生成静态清单：

1. `action=parse&page=橘爱丽丝&prop=images|revid` 获取该页实际引用的文件标题及版本。
2. 按角色的显式 `wikiStem` 分类，排除页面中其他角色、唱片、漫画和音频。
3. `action=query&prop=imageinfo&iiprop=url|size|mime|sha1&titles=File:...` 批量解析真实 URL、尺寸、文件大小及内容指纹。
4. 按数值服装/姿势编号和稀有度排序，保存稳定 ID。页面图片顺序不能直接作为偏好索引。

## 两个角色的实测目录

数据来自 [佐城雪美页面](https://wiki.biligame.com/imascg/佐城雪美)、[橘爱丽丝页面](https://wiki.biligame.com/imascg/橘爱丽丝) 及站点 API。完整元数据见 [bwiki-samples.json](bwiki-samples.json)。

| 项目 | 雪美 | 爱丽丝 |
| --- | ---: | ---: |
| 页面全部引用图片（包含无关图片） | 236 | 343 |
| 签名 | 1 | 1 |
| 服装图标 | 13 | 14 |
| 小人 | 52：13 套 × 4 姿势 | 56：14 套 × 4 姿势 |
| CGSS 背景 | 26 | 28 |
| Mobamas 卡图 | 38 | 41 |
| 分类后缺失 imageinfo | 0 | 0 |
| 小人图尺寸 | 全部 256×256 | 全部 256×256 |
| 小人编码文件大小合计 | 1,208,982 B | 1,266,716 B |
| 小人 RGBA 理论大小 | 13 MiB | 14 MiB |
| 全部 CGSS 背景编码大小合计 | 32,411,209 B | 33,208,111 B |
| 仅 title + URL 的紧凑 JSON 大小 | 16,770 B | 17,947 B |

现有 `lib/assets.js` 中 107 个素材 URL 全部能在雪美分类清单中找到。两个角色分别抽查第一张小人 CDN HEAD，均返回 HTTP 200 / image/png。未下载、解码或在桌宠中渲染爱丽丝全部素材；目录完整性不等于全量图片可用性。一次更广的顺序 HEAD 检查遇到超时，因此不声称整个 CDN 稳定或所有素材可访问。

这里的 Mobamas 数量包括特训前后；现有主题只挑选其中 15 张。爱丽丝列表包含 `CG-Arisu-R-3+.jpg`，但没有对应的特训前文件，已说明不能假设所有编号、前后版本都成对出现。两位角色的规律不能证明全角色均有相同素材覆盖率。

## 额外适配成本

| 部分 | 当前绑定与风险 | 建议 | 成本 |
| --- | --- | --- | --- |
| 素材模型 | `lib/assets.js` 是单角色常量；ICONS 与 PETITS 靠数组位置对齐 | 角色清单、服装 ID、姿势 ID、默认背景 ID；可选签名/Mobamas，缺图降级 | 一次性中 |
| 默认值及偏好 | `lib/client.js`、`lib/desktop-state.js`、`desktop/logic.js`、`desktop/renderer.js` 重复写死 `cardIndex:7`、`CARDS[23]`；部分校验固定 4 姿势或使用首套长度 | 统一 schema，增加 `characterId` 和每角色偏好；旧配置迁移到 Yukimi；角色切换原子校验并回退默认值 | 一次性中高 |
| 加载竞态 | renderer 仅比较服装/姿势索引；不同角色的相同索引会碰撞，`spritesWarmed` 只初始化一次 | 请求身份包括角色 ID；切换成功后同步背景/签名/小人，旧图保留至新图解码；按角色预热 | 一次性中 |
| 预加载与缓存 | `desktop/renderer.js:146` 预热全部 PETITS；`desktop/sprite-cache.js` Map 持有已加载 Image，`desktop/main.cjs` 的 maskCache 也无淘汰 | 当前角色/当前及下一套优先；跨角色 LRU 或内存预算；闲置预热可取消。单 Electron 实例复用 | 一次性中，决定运行开销 |
| 选择面板 | Web 与 desktop 各自生成选择器；背景预览虽有 lazy loading，但 URL 仍为原图 | 增加角色搜索与分组；仅渲染当前角色，使用 API 生成缩略图 URL；按需/虚拟列表 | 一次性中 |
| 白名单与分发 | `desktop/main.cjs:221` 启动时固定允许图片集合；本地协议资源 Map 固定；`scripts/package-desktop.mjs:13` 仅复制 assets.js | 清单驱动的精确 URL 白名单；分片清单加入本地协议与打包，保留 CSP，不开放任意 URL。客户端生成器也要支持角色数据 | 一次性中 |
| 台词 | `lib/assets.js` 的 LINES、`lib/desktop-state.js:25` 的 NOTICE_LINES、renderer 提示语、HTML 标题都使用雪美语气；通知生成时已经选好了文本 | 把点击/完成/等待/审批/失败文案放进角色包；确定切换角色后已有气泡是否重选文案。可用通用文案兜底 | 框架中；逐角色文案需持续人工工作 |
| 视觉 | 深蓝 token 固定在 `lib/client.js`，背景 cover 与签名布局是统一规则 | 第一版共享配色；个性配色、背景焦点和小人大小作为可选覆盖项，保持文字对比度 | 共用低；逐角色精修中 |
| 品牌及并存 | 包名、RPC `/yukimi`、配置目录、协议名、桌宠标题和安装器校验都绑定 Yukimi | 初期研究不改正式安装；若作为另一个产品并存，统一改命名空间并设计迁移，避免两个插件竞争主题/配置 | 一次性中 |
| 验证 | 现有测试大量使用雪美索引和数据，且只有单角色 renderer 竞态用例 | 增加双角色往返、缺图/少姿势、旧偏好迁移、气泡保留、缓存上限与离线失败检查；拖动/会话事件/置顶逻辑可复用 | 一次性中 |

目录、图标、小人、卡面和签名的整理可以高度自动化；每角色“专属主题色 + 贴合性格的原创提醒文案”无法仅靠 URL 规则解决。角色别名/英文 stem、文件后缀、编号缺口、缺少某类素材也需要清单校验与例外表。

## 开销判断

- **安装体积**：只装 URL 清单、按需联网取图片，新增角色不需要复制一份 Electron。以本次两个角色的 title+URL 数据估算，假设 200 个规模相近的角色，清单约 3.3 MiB；这只是外推，不是全角色实测，实际清单还含默认值与文案。
- **运行内存**：一张 256×256 RGBA 约 256 KiB，雪美全部 52 张约 13 MiB。若误将 200 个类似角色全部预热，仅精灵像素就约 2.5–2.7 GiB；不包括 Image 对象、GPU、副本及背景。当前结构不能直接平铺全角色预加载。
- **网络**：两个样本全部小人各约 1.2 MB，但每角色背景原图合计约 32–33 MB。应只加载当前背景、对预览使用缩略图，并保留请求并发上限；首次取图与 CDN 失败仍是实际成本。
- **单角色活跃模式**：目录按需读取，预热当前/下一套，设置有界缓存，运行成本可以接近现在的雪美版，与收录人数基本解耦。该判断是设计推导，尚未通过多角色原型测量。

## 推荐实施次序

1. 先做雪美 + 爱丽丝两角色：结构化清单、稳定 ID、全链路偏好迁移、选择器与图片切换；暂共用现有配色。
2. 加入缓存预算、缩略图、缺失素材兜底、角色切换竞态与气泡文案策略，完成桌面端实测。
3. 再建设角色索引、别名映射与批量清单生成器。维护阶段分批更新并缓存 API 结果，不在每次启动时遍历 BWiki。
4. 最后逐角色补充配色和专属原创文案；图片来源、作者/权利信息随清单保存，收录规模与素材再分发范围分开考虑。

本次只增加审计脚本和证据文件，没有实现角色切换、修改正式 DSH 安装或批量抓取全站图片。复现元数据审计：`node scripts/audit-bwiki.mjs`；可加 `--check-cdn` 对每个角色的一张小人执行 HEAD 检查。

### 本次检查边界

审计脚本实际调用 API 成功，新增脚本语法检查通过。新克隆的 `npm run check` 在源码语法检查之后，失败于原有 `build-client.mjs --check` 的行尾比较：Windows checkout 有 618 处 CRLF，而生成块固定用 LF。使用未修改的 HEAD Git blob 执行同样的生成逻辑通过，工作区内容归一为 LF 后与 blob 一致，确认并非素材真的过期。这是现有构建校验的跨平台适配点，应在后续重构时让比较统一换行或用 `.gitattributes` 固定 LF；本次没有改动运行时代码来绕过它。没有再次执行桌面交互、全角色渲染或运行内存基准。

参考：[GitHub fork 可见性规则](https://docs.github.com/en/pull-requests/reference/forks)、[BWiki API](https://wiki.biligame.com/imascg/api.php)。
