# 用户故事看板 · 实践手册

这份手册回答"板子该怎么摆、卡片上该放什么、什么时候该加泳道"。它服务于 `user-story-board` skill，也是插件面板设计取舍的依据。

## 1. 层级：容器先于卡片

从宏观到微观：

```
产品 Product
 └── 项目 / 专题 Project        ← 分隔看板的容器
      └── 看板 Board（迭代）    ← 时间盒或持续价值流
           └── 用户故事 Story   ← 卡片
                └── 任务 Task   ← 卡片的子项，不单独上板
```

- **一个项目 = 一个独立看板空间**。不同目标的故事物理隔离，避免"一锅粥"。
- 项目上面可以有产品层，小团队/个人可以只有一个产品。
- 故事数量决定结构：< 10 张，一个项目一块板；10–30 张，项目待办池 + 迭代板；> 30 张，按子项目或用户旅程阶段拆板。
- 迭代板只放**当前承诺**的故事；其余留在项目待办池（`boardId = null`）。

依据：PMI《敏捷实践指南》的 Epic → Story → Task 分层，以及 Azure DevOps 的 Epic → Feature → Story → Task 映射。看板通常只放 Story 及以上，Task 贴在卡片背面/子任务区。

## 2. 列：5 列是起点，不是教条

| 列 | 进入条件 | 离开条件 |
|---|---|---|
| 待办 Backlog | 候选故事，价值/成本粗估过 | 被选进本次迭代 |
| 待开发 To do | 已承诺、AC 清楚、可开工 | 有人拉走并开始做 |
| 开发中 In progress | 有人在写/联调 | 自测 + AC 自查通过 |
| 待验收 To verify | 等 PO/测试验收或演示 | 验收通过且满足 DoD |
| 已完成 Done | 满足 DoD | 本迭代内不再改，改动开新故事 |

经验区间：**5–9 列**。少于 5 列通常隐藏了工作真正排队的地方；多于 9 列往往是在建模子步骤，应该变成卡片里的 checklist（[Kanban 设计 FAQ](https://github.com/gethamster/skills/blob/7c00f4d4f6f72d2b9450fda6d015382b660cb7ad/skills/designing-kanban-boards/references/faq.md)）。每一列应当有"不同的人负责、不同的 WIP 行为或不同的拉动策略"，否则合并。

## 3. WIP：让超载立刻可见

- 开发中默认上限 3，待验收默认上限 5；可在看板设置里覆盖。
- **数字要显示在列头上**，超限变色。真正的约束来自"每个人一眼看到超了"，不是软件阻止拖动（[Quire: Kanban boards](https://quire.io/blog/p/kanban-boards-for-project-management.html)）。
- 超限时口头暴露："开发中 4 张，超过上限 3，建议先验收/配对再拉新卡"，而不是偷偷换列。
- WIP 限制只对"进行中/等待中"的列有意义；待办和已完成不设上限。

## 4. 卡片：一个可扫描的工作单元

卡片不是文档，是**让人在 3 秒内决定要不要拉它**的单位。我们的卡片字段：

| 字段 | 作用 |
|---|---|
| `US-01` 编号 | 口头沟通、跨文档引用的稳定锚点 |
| 标题（动宾短语） | 卡片上最响的字，回答"做什么" |
| 价值一句话（"以便于…"） | 防止做着做着忘了为谁做 |
| 优先级 P0–P3 | 决定先拉哪张 |
| 故事点 | 看负载与速度 |
| 负责人 | 避免"三个人做 = 没人做" |
| AC 完成度 `2/4` | 不打开卡片也知道验收还剩多少 |
| 标签 | 领域/场景的快速筛选 |
| 阻塞标记 | 红色，一眼看到卡在哪 |

卡面保持 5–8 个信息点；详细内容放右侧抽屉。标题是卡片上唯一的"门"，其余都是元数据（参考 [board card anatomy](https://cdn.jsdelivr.net/npm/@gavin-hu/my-pi-agent@0.20.0/docs/extensions/board.md)）。

验收标准写成 **Given / When / Then**，Then 必须是可观察结果。AC 用 checklist 存，完成一条勾一条，卡片上的完成度随之变化（[Wekan: cards as user stories](https://github.com/wekan/wekan/blob/60377a4dc262149b1c69aed534baab03798198f8/docs/Features/Cards/Scrum.md)）。

## 5. 泳道：只在"分类需要不同处理"时加

默认一条泳道（按状态分列）就够了。以下情况才切泳道：

- 同一块板上并行几条 Epic，需要分开看进度；
- 不同优先级的卡混在一起看不清；
- 多人协作，需要按负责人看负载。

我们的面板支持按 Epic / 优先级 / 负责人分组。注意：泳道是**阅读视角**，不改变数据；拖动仍然只改状态，不改 Epic/负责人。

## 6. 看板旁边的信息发射源

一块板不孤立，团队还会看：

1. 产品路线图（Epic 级时间轴）
2. 发布计划（哪次发布包含哪些故事）
3. 迭代燃尽图 / 累积流图（CFD）
4. 阻塞清单（站会专用）
5. DoD 公示

插件 v1 在「概览」里提供状态分布、WIP 健康度、阻塞清单和最近动态；燃尽图/CFD 留给后续版本。

## 7. 站会怎么用

每天 15 分钟，只问三个问题：

1. 从昨天到现在，哪些卡往前动了？
2. 哪些卡卡住了？为什么？
3. 今天谁拉哪张新卡？

不要让人汇报"我昨天写了什么代码"，而是看卡在不在流动。面板上的"最近动态"就是第一个问题的答案。

## 8. 常见误区

| 误区 | 后果 | 正确做法 |
|---|---|---|
| 所有故事堆一个板 | Done 列越来越长，当前重点看不清 | 项目 + 迭代分层 |
| 把 Task 当 Story | 板子变成任务坟场 | Task 写进 AC/子任务 |
| WIP 不限制 | 人人多任务切换，交付为 0 | 列头显示上限，超限暴露 |
| 没有 DoD | "完成"永远扯皮 | 把 DoD 贴在看板旁 |
| 只更新不回顾 | 同样的问题反复出现 | 每迭代看 CFD + 阻塞原因 |
| 为了排序重排 US 编号 | 引用全乱 | 编号稳定，排序用优先级/拖动 |

## 9. 敏捷机制速查

- **DoD**：代码提交并 CR 通过；自测通过（含 AC 检查）；产品验收通过；无 P0/P1 遗留 Bug。
- **Refinement**：进迭代前在项目待办池里把 AC 和估算补清楚。
- **阻塞可视化**：`blocked` + 原因，比口头同步可靠。
- **完成定义不是"编码完"**：是"潜在可发布"。

## 10. 延伸阅读

- [PMI《敏捷实践指南》](https://www.pmi.org/pmbok-guide-standards/practice-guide/agile) — Epic/Story/Task 分层、看板与 Scrum 混合、WIP 与流动效率
- [Azure DevOps: Epics, features and user stories](https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/define-features-epics?view=azure-devops) — 工作项层级与迭代路径
- [Quire: How to use Kanban boards](https://quire.io/blog/p/kanban-boards-for-project-management.html) — WIP 计数的可见性
- [Wekan: cards as user stories](https://github.com/wekan/wekan/blob/60377a4dc262149b1c69aed534baab03798198f8/docs/Features/Cards/Scrum.md) — AC checklist 与卡片进度
- [Designing effective Kanban boards](https://github.com/gethamster/skills/blob/7c00f4d4f6f72d2b9450fda6d015382b660cb7ad/skills/designing-kanban-boards/references/faq.md) — 列数、泳道触发条件
- [Kanban board layout conventions](https://github.com/wimpysworld/nix-config/blob/0a9d96469f79097ec88b3d8f0b91598308450df2/home-manager/_mixins/agentic/assistants/skills/diagram-design/references/type-kanban.md) — 列宽、列头、WIP chip 的视觉约定
