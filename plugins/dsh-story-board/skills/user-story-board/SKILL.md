---
name: user-story-board
description: >
  创建、查看和推进用户故事看板：产品（Product）→ 项目（Project）→ 看板（Board）→
  用户故事（User Story）四层结构，五列状态泳道、WIP 提醒、卡片拖拽与故事详情。
  当用户提到"看板 / 故事看板 / story board / kanban / 敏捷看板"、"把用户故事放上看板"、
  "导入用户故事 / 落板"、"新建项目 / 新建迭代 / 建一块板"、"现在看板上有什么 /
  谁在做什么 / 哪些卡住了 / 阻塞"、"把某条故事拖到开发中 / 待验收 / 完成"、
  "调整优先级 / 负责人 / 故事点"、"WIP 超了"、"站会看板"，或者要把
  user-story-crafter 产出的故事文档变成可追踪的卡片时，都使用本 skill。
  即使用户没说出"看板"两个字，只要是在管理"故事的状态与流动"，也适用。
---

# User Story Board

这个 skill 操作一个真实存在的 DSH 插件：侧边栏里的「用户故事看板」。面板本身是给人看的；你的入口是三件工具 `story_board_query` / `story_board_apply` / `story_board_import`。**面板和工具写同一份数据**，所以你在对话里移动的卡片，用户刷新面板就能看到，反之亦然。

## 一、先分清四层容器（这是不混乱的前提）

| 层 | 回答什么问题 | 例子 | 规则 |
|---|---|---|---|
| 产品 Product | 我们在做什么东西？ | 滴滴出行 | 最高一层，用来分隔业务方向；可记录 `repoUrl` / `localPath` |
| 项目 Project | 这一段时间集中解决什么问题？ | 郊区 → 火车站赶车场景 | **一个项目 = 一个隔离的看板空间**，不同项目的故事不混在一起 |
| 看板 Board | 这次迭代具体做哪几件事？ | 迭代 1 · 叫车决策 | 一块板对应一次迭代或一条持续价值流 |
| 故事 Story | 这张卡现在卡在哪？ | US-01 预估到达时间 | 卡的最小单元，不是 Task |

故事不进任何看板时属于**项目待办池**（`boardId = null`，状态 `backlog`）。项目总池放候选故事，看板只放当前迭代承诺的故事。

## 二、五个状态与 WIP

| 状态 id | 列名 | 含义 | 默认 WIP |
|---|---|---|---|
| `backlog` | 待办 | 候选池，不承诺全部做 | 不限 |
| `todo` | 待开发 | 已排进本次迭代、准备开做 | 不限 |
| `in_progress` | 开发中 | coding / 联调中 | 3 |
| `verify` | 待验收 | 开发自测完，等 PO/测试验收 | 5 |
| `done` | 已完成 | 满足 DoD，不再随意改 | 不限 |

WIP 是**提醒而不是硬拦截**：移动一定成功，结果里返回 `warnings: [{code:"wip_exceeded", ...}]`。看到警告要如实告诉用户"这列已经 4 张，超过上限 3"，不要重试、不要把卡偷偷塞进别的列。

DoD 示例（回答用户时可以引用）：代码提交并 CR 通过、自测通过（含 AC 检查）、产品验收通过、无 P0/P1 遗留 Bug。只有满足 DoD 才移到 `done`。

## 三、工具：先读后写

### 1. `story_board_query` — 读

| view | 用途 |
|---|---|
| `overview` | 数量、状态分布、WIP 超限、阻塞、最近动态。开场先看这个 |
| `products` | 产品列表（带项目/看板/故事数） |
| `projects` | 项目列表，可按 `productId` 过滤 |
| `boards` | 看板列表，可按 `projectId` 过滤，带每列 WIP |
| `stories` | 故事列表，按 `projectId` / `boardId` / `status` / `priority` / `assignee` / `epic` / `query` 过滤 |
| `story` | 单条故事，用 `id` 或 `key: "US-03"` |
| `board` | 一块板 + 全部故事 + WIP，适合渲染看板摘要 |

**任何需要 id 的写操作之前，先 query。** 永远不要猜 id、猜故事编号。

### 2. `story_board_apply` — 写

动作：`create_product` / `update_product` / `delete_product`；`create_project` / `update_project` / `delete_project`；`create_board` / `update_board` / `delete_board`；`create_story` / `update_story` / `move_story` / `delete_story` / `seed_demo` / `reset_store`。

常用参数（其余见工具 schema）：

```json
// 新建产品（repoUrl/localPath 把产品与代码 checkout 关联）
{"action":"create_product","name":"dsh-story-board","key":"STORY",
 "repoUrl":"wyf0931/dsh-story-board","localPath":"/Users/you/code/dsh-story-board"}

// 新建故事
{"action":"create_story","projectId":"prj_…","boardId":"brd_…","title":"预估到达时间",
 "asA":"赶高铁的乘客","iWant":"在叫车前看到预估到达时间","soThat":"判断还来不来得及",
 "acceptanceCriteria":["Given … When … Then …"],"priority":"P1","estimate":3,
 "assignee":"张三","epic":"叫车决策","tags":["地图","赶车"],"status":"todo"}

// 推进卡片（拖拽等价操作）
{"action":"move_story","id":"us_…","status":"in_progress"}

// 新建迭代板
{"action":"create_board","projectId":"prj_…","name":"迭代 2","goal":"…",
 "startDate":"2026-11-25","endDate":"2026-12-08","wip":{"in_progress":4}}
```

删除产品/项目会级联删除子实体；执行前先把影响数量告诉用户，得到明确同意再删。`reset_store` 是**清空全部数据**（可选 `seedDemo`），只在用户明确说要"重来/清空"时使用，不要把它当普通清理。

### 3. `story_board_import` — 一份文档一次落板（首选）

这是 `user-story-crafter` 的天然下游：文档写完后，一次调用把整组故事放到看板。支持三种输入：

- `stories`: 结构化数组（**上下文里已有故事时首选**）
- `markdown`: 文档全文
- `markdownPath`: 文档路径（**刚写盘时首选**，工具会读文件）

目标层级按名字自动创建：`productName` / `projectName` / `boardName`。**幂等**：同项目内 key 或标题相同的故事会被更新，不会重复创建，所以文档改完可以再导一次。**产品代码关联**：传 `repoUrl` / `localPath` / `description` / `color`（扁平参数）即可把产品与本地 checkout / 仓库挂钩；若产品已存在，只回填其中为空的字段，不会覆盖你手动改过的值。

```json
{"markdownPath":"user-stories-郊区赶车.md",
 "productName":"滴滴出行","projectName":"郊区赶车场景",
 "boardName":"迭代 1 · 叫车决策"}

// 反向导入一个已有项目（把产品与代码 checkout 关联；建一块板让故事直接落在看板待办列）
{"productName":"dsh-story-board","productKey":"STORY",
 "repoUrl":"wyf0931/dsh-story-board","localPath":"/Users/you/code/dsh-story-board",
 "description":"…","projectName":"产品现状梳理","boardName":"产品现状梳理",
 "defaultStatus":"backlog","stories":[…]}
```

## 四、标准流程

### A. 把一份用户故事文档放上看板

1. `story_board_query {view:"projects"}`，确认是否已有对应项目和看板；有就复用，没有再用名字创建。
2. `story_board_import`：优先 `markdownPath`（文档刚写盘时），或 `stories` 数组。
3. 看返回的 `created` / `updated` / `warnings`，用 3 行以内汇报：建了什么产品/项目/看板、多少张卡、有没有 WIP 超限。
4. 如果用户要"开始做"，按优先级挑 3–5 张 `move_story` 到 `todo`，再挑 1–3 张到 `in_progress`；不要一次把所有卡都拉进迭代。
5. 告诉用户打开侧边栏「用户故事看板」查看；面板里可以拖拽。

### B. 新建项目 / 迭代

1. 先 `query products`；没有产品先 `create_product`（一个产品足够，不要为每个小需求建产品）。
2. `create_project` 必须挂在一个产品下；写清 `objective`（一句话目标）。
3. `create_board` 挂在项目下；第一块板通常叫「迭代 1 · <主题>」。
4. 只建用户明确要求的层级；不要为了"完整"擅自造一堆空项目/空看板。

### C. 站会 / 日常推进

1. `query {view:"board", boardId}` 拿当前板。
2. 用一段话汇报：各列数量、WIP 是否超限、阻塞卡、昨天动了什么。
3. 用户说"把 X 移到 Y"时，先 `query {view:"story", key:"US-xx"}` 拿 id，再 `move_story`；不要按标题猜 id。
4. 发现卡在同一列超过一周（`updatedAt` 旧）时主动提示，但不要自动搬动。
5. 阻塞要在故事上标 `blocked:true` + `blockedReason`，不要只在对话里说。

### D. 单条故事的新建 / 修改

新建用 `create_story`；修改用 `update_story`（只传要改的字段）。故事编号 `US-01` 在项目内稳定递增，**不要为了排序重排编号**；排序用 `priority` 和看板拖动。

### E. 从已有项目反向推导用户故事（导入产品）

用户想把一个**已经存在的本地项目**纳入看板管理时：

1. 确认本地项目路径（面板「产品」Tab 右上角的**导入产品**按钮可以选目录、自动生成提示词，并把提示词预填进一个新 DSH 对话的输入框，按 Enter 发送；用户也可以直接把路径发给你）。
2. **先实地探查代码，不要凭空编**：读 README、工程清单（package.json / pyproject.toml / go.mod…）、入口与路由、数据模型、前端页面；只读，不要改文件。
3. 归纳产品定位（2-3 句）、**识别独立的「端 / 视角」**（不同人群使用的不同界面或入口，如 终端用户端 / 运营后台 / 开放平台 / 内部工具；小项目可能只有一个端，别硬拆）与每个端的主要角色，再从**用户价值**出发推导故事。每条故事：
   - **`asA` / `iWant` / `soThat` 与 `acceptanceCriteria` 必填**——只给 `title` 会得到一张空白卡片（这是最常见的失败）；篇幅紧张时宁可少几条，也要每条写全；
   - **`epic` 用「端 · 功能域」**（如「用户端 · 账号」「运营端 · 内容管理」），这样看板按 Epic 泳道分组时不同端天然分开，不会混成一列；
   - **`tags` 带上端名**（如「用户端」「运营端」）再加功能标签；
   - 遵循 INVEST，**不写纯技术故事**（把"接入 Redis""重构模块"转成用户可感知的价值或并入某条 AC）。
4. 用 `story_board_import` 落板，并带上产品代码关联：`productName` / `productKey` / `repoUrl` / `localPath` / `description` + `projectName`（常用"产品现状梳理"）+ `stories` 数组。**插件现在保证导入一定有一块看板**：即使你不传 `boardName`，也会用项目名默认建一块板，故事直接落在看板（默认 `todo` 列），用户点项目就能看到看板。建议仍显式传 `boardName` + `defaultStatus:"backlog"`（让故事先落待办列）。**默认所有端放同一块板**，靠 epic 泳道区分；**仅当某个端是真正独立的产品面、且它的故事较多（≥ 6 条）时**，才再调一次 import 为它单开一块板（`boardName` 按该端命名，只把该端的故事放进这次调用），避免看板碎片化。
5. 用 3 行以内汇报：建了哪个产品/项目、多少条故事、有没有 WIP 提示；提示用户打开「用户故事看板」查看。
6. 若产品已存在但没关联代码，导入时会**只回填空字段**，不会覆盖用户改过的 `repoUrl` / `localPath`。

## 五、导入格式（与 user-story-crafter 的模板对齐）

Markdown 解析器认识模板里的这种形状：

```markdown
**US-01：预估到达时间，判断是否来得及**

作为一个住在郊区的乘客，
我想要输入目的地后看到「预计到达火车站的时间」，
以便于判断是否能赶上高铁。

AC
- Given 用户输入起点和终点
- When 系统返回预估结果
- Then 显示预计行程时长
- And 若晚于发车时间则给出警示

优先级：P1
估算：3 Story Point
负责人：@张三
标签：地图, 路线
```

也接受 `### US-01 标题`、`#### US-01：标题` 等标题形式；英文 Connextra（As a…, I want…, so that…）同样识别。解析不确定时，改用 `stories` 数组显式传字段，别跟文档格式较劲。

## 六、看板面板怎么用（回答用户时可以指路）

- **五个 Tab**：概览 / 产品 / 项目 / 看板 / 故事。
- **看板**：五列状态泳道；右上角可切换按 Epic / 优先级 / 负责人的泳道分组；卡片可拖动换列，拖到某张卡上可插到它前面。
- **筛选**：搜索、负责人、优先级、Epic；筛选只影响显示，不改数据。
- **卡片字段**：编号、标题、优先级、阻塞标记、负责人、故事点、AC 完成度、标签。
- **故事详情**：点卡片打开右侧抽屉，编辑 Connextra、AC 清单、状态、优先级、估算、负责人、Epic、标签、阻塞原因。
- **故事 Tab**：表格视图，可直接改状态，适合批量浏览。
- **空状态**：提供「载入示例（滴滴赶车 · 9 个故事）」，想快速看效果就用它。

## 七、质量规则（别把看板用坏）

1. **一个项目一个看板空间**：不要把两个不相关的目标塞进同一块板。
2. **故事不是 Task**：Task 写在 AC 或故事描述里，不要为"写接口""改样式"建故事卡。
3. **看板只放当前迭代**：候选故事留在项目待办池（不设 `boardId`），不要全堆在 `todo`。
4. **WIP 超限要暴露**：如实汇报警告，不要通过新建列/新建板绕过。
5. **Done 要有 DoD**：AC 未验收不要移到 `done`。
6. **阻塞可视化**：`blocked:true` + 原因，比在对话里说一句"卡住了"有用。
7. **编号稳定**：US-07 永远是 US-07，讨论、拆 Task、写 PRD 都靠它对齐。

## 八、与 user-story-crafter 的衔接

- 用户给一个模糊场景 → 先用 `user-story-crafter` 走完"吃透输入 → 澄清 → 还原旅程 → 输出文档"。
- 文档写盘后 → 回到本 skill，用 `story_board_import` 落板；不要把文档内容在对话里重复一遍再逐条 `create_story`。
- 落板后 → 用 `story_board_query {view:"board"}` 做一次"当前迭代建议"：挑 3–5 张进 `todo`，1–3 张进 `in_progress`。
- 用户要改故事 → 优先 `update_story`，不要删了重建（会丢编号和历史）。

## 九、数据与边界

- 数据文件：`$DSH_HOME/story-board/store.json`（默认 `~/.dsh/story-board/store.json`），由插件原子写入。**不要手改这个文件**，也不要让用户手改；需要改数据就调工具。
- 工具在所有会话可用；面板在侧边栏。子会话/委派会话也能调用工具，写入的是同一份数据。
- 删除是不可逆的；产品/项目会级联。删之前先 `query` 数清子实体，并把数量告诉用户。
- `reset_store` 会清空产品/项目/看板/故事/动态；除非用户明确要求"从零开始"，否则用删除具体实体的方式。

更细的看板约定、卡片字段和 WIP/DoD 讨论见 [references/board-playbook.md](references/board-playbook.md)。
