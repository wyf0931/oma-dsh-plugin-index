/**
 * dsh-story-board — browser half.
 *
 * One full-page panel registered in the `main` slot, opened from a sidebar
 * entry. Five tabs: overview, products, projects, board, stories. The board
 * is a status-lane view (the five reference statuses) with optional swimlanes
 * by epic / priority / assignee, drag-and-drop between lanes, WIP chips, and
 * a story drawer that edits the Connextra sentence and the AC checklist.
 *
 * Plain React from the browser module table; own markup and styles; theme
 * tokens only, so light/dark and user themes follow the host. Data goes
 * through the plugin's authenticated /api/story-board routes; the agent tools
 * write the same store, so the panel and the model never diverge.
 */

window.__ModuleLoader__.load({
	id: 'dsh-story-board',
	factory(require) {
		const React = require('react');
		const ReactDOM = require('react-dom');
		const h = React.createElement;
		const { useCallback, useEffect, useMemo, useRef, useState } = React;

		const NS = 'dsh-story-board';
		const PANEL_ID = 'dsh-story-board';
		const STORAGE_KEY = 'dsh-story-board/selection';

		/* ------------------------------------------------------------------ */
		/* Tokens and dictionaries                                            */
		/* ------------------------------------------------------------------ */

		const STATUS_TONE = {
			backlog: 'var(--dsw-alias-label-tertiary)',
			todo: 'var(--dsw-alias-link)',
			in_progress: 'var(--dsw-alias-state-business-primary)',
			verify: 'var(--dsw-alias-state-warn-primary)',
			done: 'var(--dsw-alias-state-success-primary)'
		};
		const PRIORITY_TONE = {
			P0: 'var(--dsw-alias-state-error-primary)',
			P1: 'var(--dsw-alias-state-warn-primary)',
			P2: 'var(--dsw-alias-label-secondary)',
			P3: 'var(--dsw-alias-label-tertiary)'
		};
		const COLOR_TONE = {
			blue: 'var(--dsw-alias-brand-primary)',
			green: 'var(--dsw-alias-state-success-primary)',
			amber: 'var(--dsw-alias-state-warn-primary)',
			red: 'var(--dsw-alias-state-error-primary)',
			slate: 'var(--dsw-alias-label-tertiary)'
		};

		const DICT = {
			zh: {
				'app.title': '用户故事看板',
				'app.subtitle': '产品 → 项目 → 看板 → 故事',
				'common.refresh': '刷新',
				'common.new': '新建',
				'common.save': '保存',
				'common.saving': '保存中…',
				'common.cancel': '取消',
				'common.delete': '删除',
				'common.edit': '编辑',
				'common.close': '关闭',
				'common.confirm': '确认',
				'common.loading': '正在加载…',
				'common.retry': '重试',
				'common.all': '全部',
				'common.none': '无',
				'common.unassigned': '未分配',
				'common.uncategorized': '未分组',
				'common.stories': '故事',
				'common.projects': '项目',
				'common.boards': '看板',
				'common.products': '产品',
				'common.blocked': '阻塞',
				'common.updated': '更新于',
				'common.open': '打开',
				'common.add': '添加',
				'common.search': '搜索',
				'common.loadFailed': '看板数据加载失败',
				'common.emptyStore': '还没有数据',
				'toast.saved': '已保存',
				'toast.created': '已创建',
				'toast.deleted': '已删除',
				'toast.moved': '已移动',
				'toast.seeded': '示例已载入',
				'toast.wip': 'WIP 超限：{status} {count} 张（上限 {limit}）',
				'tabs.overview': '概览',
				'tabs.products': '产品',
				'tabs.projects': '项目',
				'tabs.board': '看板',
				'tabs.stories': '故事',
				'context.product': '产品',
				'context.project': '项目',
				'context.board': '看板',
				'context.allBoards': '全部看板',
				'context.newProduct': '新建产品',
				'context.newProject': '新建项目',
				'context.newBoard': '新建看板',
				'status.backlog': '待办',
				'status.todo': '待开发',
				'status.in_progress': '开发中',
				'status.verify': '待验收',
				'status.done': '已完成',
				'status.backlog.hint': '候选池，不承诺全部做',
				'status.todo.hint': '已排进本次迭代',
				'status.in_progress.hint': '编写与联调中',
				'status.verify.hint': '等待验收与演示',
				'status.done.hint': '满足 DoD 才算完成',
				'overview.kpi.products': '产品',
				'overview.kpi.projects': '项目',
				'overview.kpi.boards': '看板',
				'overview.kpi.stories': '故事',
				'overview.kpi.points': '故事点',
				'overview.kpi.blocked': '阻塞',
				'overview.distribution': '状态分布',
				'overview.distributionHint': '看板不是任务清单：关注故事在不在流动。',
				'overview.wip': 'WIP 健康度',
				'overview.wipHealthy': '所有列都在 WIP 上限内。',
				'overview.wipOver': '{board} · {status} {count}/{limit}',
				'overview.blockers': '阻塞清单',
				'overview.noBlockers': '没有阻塞的故事。',
				'overview.activity': '最近动态',
				'overview.noActivity': '还没有动态。创建第一个产品或载入示例。',
				'overview.emptyTitle': '从一条真实旅程开始',
				'overview.emptyHint': '一个产品下可以有多个项目，每个项目用独立看板隔离目标，避免所有故事混成一锅粥。先建一个产品，或直接载入示例看效果。',
				'overview.seed': '载入示例（滴滴赶车 · 9 个故事）',
				'overview.createProduct': '创建第一个产品',
				'overview.flow': '故事层级',
				'overview.flow.product': '产品',
				'overview.flow.project': '项目',
				'overview.flow.board': '看板',
				'overview.flow.story': '故事',
				'overview.flowHint': '一个项目 = 一个隔离的看板空间；看板只放当前迭代的故事。',
				'product.newTitle': '新建产品',
				'product.editTitle': '编辑产品',
				'product.name': '产品名称',
				'product.namePlaceholder': '例如：滴滴出行',
				'product.key': '产品 Key',
				'product.keyHint': '2–12 位字母或数字，用于卡片与沟通',
				'product.description': '一句话描述',
				'product.descriptionPlaceholder': '这个产品解决什么问题？',
				'product.color': '标识色',
				'product.color.blue': '蓝',
				'product.color.green': '绿',
				'product.color.amber': '琥珀',
				'product.color.red': '红',
				'product.color.slate': '灰',
				'product.empty': '还没有产品',
				'product.emptyHint': '产品是最高一层容器，用来分隔不同业务方向。',
				'product.deleteTitle': '删除产品',
				'product.deleteMessage': '将同时删除该产品下的 {projects} 个项目、{boards} 个看板和 {stories} 个故事。此操作不可撤销。',
				'product.manage': '管理项目',
				'product.codeSection': '代码关联',
				'product.repo': '代码仓库',
				'product.repoPlaceholder': 'https://github.com/owner/repo',
				'product.repoHint': '支持 owner/repo 简写；保存时归一化为仓库地址',
				'product.localPath': '本地项目路径',
				'product.localPathPlaceholder': '/Users/you/code/project',
				'product.localPathHint': '产品对应的本地项目根目录；可直接输入，或点击「选择…」调用系统目录选择器',
				'product.choosePath': '选择…',
				'product.choosing': '选择中…',
				'product.pickerUnavailable': '当前环境没有系统目录选择器，请直接输入本地路径',
				'product.codeEmpty': '未关联代码仓库或本地路径',
				'import.button': '导入产品',
				'import.title': '从已有项目导入产品',
				'import.desc': '选择一个本地项目目录，自动生成一段「反向推导用户故事」的提示词，在 DSH 中运行后即可把已有项目变成看板上的产品与故事。',
				'import.step1': '1 · 选择项目并填写基本信息',
				'import.step2': '2 · 检查提示词并在 DSH 中运行',
				'import.path': '本地项目路径',
				'import.pathHint': '选择目录后自动填入产品名与 Key；也可直接输入路径',
				'import.repo': '代码仓库（可选）',
				'import.name': '产品名称',
				'import.key': '产品 Key',
				'import.focus': '重点关注（可选）',
				'import.focusPlaceholder': '例如：只关注结算与优惠券链路',
				'import.language': '提示词语言',
				'import.language.zh': '中文',
				'import.language.en': 'English',
				'import.compose': '生成提示词',
				'import.composing': '生成中…',
				'import.promptLabel': '提示词预览（可编辑）',
				'import.promptHint': '运行时会以这段文本作为用户消息发给 DSH；它会指示模型先探查代码再落板。',
				'import.run': '在 DSH 中运行',
				'import.running': '正在运行…',
				'import.copy': '复制提示词',
				'import.copied': '已复制提示词。粘贴到 DSH 对话即可运行。',
				'import.runDone': '已把提示词填入新的 DSH 对话框，确认后按 Enter 发送即可。',
				'import.runFallback': '无法自动打开对话，已复制提示词；请粘贴到 DSH 对话运行。',
				'import.needPath': '请先选择或输入本地项目路径',
				'import.openBoard': '打开看板',
				'import.editProduct': '编辑产品',
				'project.newTitle': '新建项目',
				'project.editTitle': '编辑项目',
				'project.name': '项目名称',
				'project.namePlaceholder': '例如：郊区 → 火车站赶车场景',
				'project.key': '项目 Key',
				'project.objective': '项目目标',
				'project.objectivePlaceholder': '这一段时间集中解决什么问题？',
				'project.description': '背景与范围',
				'project.start': '开始日期',
				'project.end': '结束日期',
				'project.product': '所属产品',
				'project.empty': '还没有项目',
				'project.emptyHint': '项目用来隔离目标；不同项目的故事不会混在同一块看板上。',
				'project.progress': '完成度',
				'project.deleteTitle': '删除项目',
				'project.deleteMessage': '将同时删除该项目的 {boards} 个看板和 {stories} 个故事。此操作不可撤销。',
				'project.openBoard': '打开看板',
				'project.allProducts': '全部产品',
				'project.boardsCount': '{n} 个看板',
				'project.storiesCount': '{n} 个故事',
				'board.newTitle': '新建看板',
				'board.editTitle': '编辑看板',
				'board.name': '看板名称',
				'board.namePlaceholder': '例如：迭代 1 · 叫车决策',
				'board.goal': '迭代目标',
				'board.goalPlaceholder': '这两周要交付的核心链路是什么？',
				'board.start': '开始日期',
				'board.end': '结束日期',
				'board.wip': 'WIP 上限',
				'board.wipHint': '开发中默认 3、待验收默认 5；超限会提醒但不阻止拖动。',
				'board.empty': '这个项目还没有看板',
				'board.emptyHint': '一个看板对应一次迭代（或一条持续流动的价值流）。先建一块板，再把故事拉进来。',
				'board.newStory': '新建故事',
				'board.edit': '编辑看板',
				'board.progress': '完成 {done}/{total}',
				'board.group.none': '不分组',
				'board.group.epic': '按 Epic 泳道',
				'board.group.priority': '按优先级泳道',
				'board.group.assignee': '按负责人泳道',
				'board.filter.assignee': '负责人',
				'board.filter.priority': '优先级',
				'board.filter.epic': 'Epic',
				'board.filter.search': '搜索故事标题、编号、标签…',
				'board.noMatch': '没有符合筛选条件的故事',
				'board.filter.clear': '清除筛选',
				'board.dropHere': '拖到这里',
				'board.wipOver': 'WIP 超限',
				'board.column': '{n} 张',
				'stories.newTitle': '新建故事',
				'stories.empty': '还没有故事',
				'stories.emptyHint': '从一条可验收的小故事开始；故事应在一个迭代内可交付。',
				'stories.search': '搜索故事…',
				'stories.count': '共 {n} 个故事',
				'stories.key': '编号',
				'stories.title': '故事',
				'stories.status': '状态',
				'stories.priority': '优先级',
				'stories.estimate': '估算',
				'stories.assignee': '负责人',
				'stories.epic': 'Epic',
				'stories.tags': '标签',
				'stories.updated': '更新',
				'stories.board': '看板',
				'stories.allBoards': '全部看板',
				'stories.backlogOnly': '仅待办池',
				'story.newTitle': '新建故事',
				'story.editTitle': '编辑故事',
				'story.title': '标题',
				'story.titlePlaceholder': '动宾短语，一眼看懂做什么',
				'story.asA': '作为一个…',
				'story.asAPlaceholder': '角色 / 画像，例如：赶高铁的乘客',
				'story.iWant': '我想要…',
				'story.iWantPlaceholder': '功能或能力，而不是技术方案',
				'story.soThat': '以便于…',
				'story.soThatPlaceholder': '用户真正得到的好处',
				'story.connextra': '用户故事（Connextra）',
				'story.planning': '排期与归属',
				'story.ac': '验收标准（AC）',
				'story.acHint': '写可判定的结果；正常、边界、异常各覆盖一条更稳。',
				'story.acPlaceholder': 'Given… When… Then…',
				'story.addAc': '添加一条验收标准',
				'story.noAc': '还没有验收标准',
				'story.priority': '优先级',
				'story.estimate': '故事点',
				'story.assignee': '负责人',
				'story.assigneePlaceholder': '姓名或 @ 昵称',
				'story.epic': 'Epic',
				'story.epicPlaceholder': '可选，用于泳道分组',
				'story.tags': '标签',
				'story.tagsPlaceholder': '逗号分隔，例如：地图, 路线',
				'story.status': '状态',
				'story.board': '所属看板',
				'story.boardBacklog': '项目待办池（不放进迭代）',
				'story.blocked': '标记为阻塞',
				'story.blockedReason': '阻塞原因',
				'story.blockedPlaceholder': '例如：依赖地图 API v2',
				'story.deleteTitle': '删除故事',
				'story.deleteMessage': '确认删除 {key} {title}？此操作不可撤销。',
				'story.meta': '创建于 {created} · 更新于 {updated}',
				'story.noProject': '请先创建项目和看板',
				'wip.warning': '{status} 已 {count} 张，超过 WIP 上限 {limit}',
				'wip.none': 'WIP 正常',
				'activity.productCreated': '创建了产品',
				'activity.productUpdated': '更新了产品',
				'activity.productDeleted': '删除了产品',
				'activity.projectCreated': '创建了项目',
				'activity.projectUpdated': '更新了项目',
				'activity.projectDeleted': '删除了项目',
				'activity.boardCreated': '创建了看板',
				'activity.boardUpdated': '更新了看板',
				'activity.boardDeleted': '删除了看板',
				'activity.storyCreated': '创建了故事',
				'activity.storyUpdated': '更新了故事',
				'activity.storyMoved': '推进了故事',
				'activity.storyDeleted': '删除了故事',
				'activity.storyImported': '导入了故事',
				'activity.demoSeeded': '载入了示例',
				'time.now': '刚刚',
				'time.min': '{n} 分钟前',
				'time.hour': '{n} 小时前',
				'time.day': '{n} 天前',
				'points': '{n} SP',
				'acProgress': '{done}/{total}',
				'delete.confirm': '确认删除',
				'error.actionFailed': '操作失败'
			},
			en: {
				'app.title': 'User story board',
				'app.subtitle': 'Products → projects → boards → stories',
				'common.refresh': 'Refresh',
				'common.new': 'New',
				'common.save': 'Save',
				'common.saving': 'Saving…',
				'common.cancel': 'Cancel',
				'common.delete': 'Delete',
				'common.edit': 'Edit',
				'common.close': 'Close',
				'common.confirm': 'Confirm',
				'common.loading': 'Loading…',
				'common.retry': 'Retry',
				'common.all': 'All',
				'common.none': 'None',
				'common.unassigned': 'Unassigned',
				'common.uncategorized': 'Uncategorized',
				'common.stories': 'stories',
				'common.projects': 'projects',
				'common.boards': 'boards',
				'common.products': 'products',
				'common.blocked': 'Blocked',
				'common.updated': 'Updated',
				'common.open': 'Open',
				'common.add': 'Add',
				'common.search': 'Search',
				'common.loadFailed': 'Could not load the board',
				'common.emptyStore': 'Nothing here yet',
				'toast.saved': 'Saved',
				'toast.created': 'Created',
				'toast.deleted': 'Deleted',
				'toast.moved': 'Moved',
				'toast.seeded': 'Demo loaded',
				'toast.wip': 'WIP exceeded: {status} has {count} (limit {limit})',
				'tabs.overview': 'Overview',
				'tabs.products': 'Products',
				'tabs.projects': 'Projects',
				'tabs.board': 'Board',
				'tabs.stories': 'Stories',
				'context.product': 'Product',
				'context.project': 'Project',
				'context.board': 'Board',
				'context.allBoards': 'All boards',
				'context.newProduct': 'New product',
				'context.newProject': 'New project',
				'context.newBoard': 'New board',
				'status.backlog': 'Backlog',
				'status.todo': 'To do',
				'status.in_progress': 'In progress',
				'status.verify': 'To verify',
				'status.done': 'Done',
				'status.backlog.hint': 'Candidate pool, no commitment',
				'status.todo.hint': 'Committed to this iteration',
				'status.in_progress.hint': 'Being built and tested',
				'status.verify.hint': 'Waiting for PO / QA review',
				'status.done.hint': 'Meets the definition of done',
				'overview.kpi.products': 'Products',
				'overview.kpi.projects': 'Projects',
				'overview.kpi.boards': 'Boards',
				'overview.kpi.stories': 'Stories',
				'overview.kpi.points': 'Story points',
				'overview.kpi.blocked': 'Blocked',
				'overview.distribution': 'Status distribution',
				'overview.distributionHint': 'A board is not a task list: watch whether stories flow.',
				'overview.wip': 'WIP health',
				'overview.wipHealthy': 'Every column is within its WIP limit.',
				'overview.wipOver': '{board} · {status} {count}/{limit}',
				'overview.blockers': 'Blockers',
				'overview.noBlockers': 'No blocked stories.',
				'overview.activity': 'Recent activity',
				'overview.noActivity': 'No activity yet. Create a product or load the demo.',
				'overview.emptyTitle': 'Start from a real journey',
				'overview.emptyHint': 'A product holds projects; each project keeps its own board so unrelated stories never mix. Create a product, or load the demo to see the shape.',
				'overview.seed': 'Load demo (Didi station run · 9 stories)',
				'overview.createProduct': 'Create the first product',
				'overview.flow': 'Story hierarchy',
				'overview.flow.product': 'Product',
				'overview.flow.project': 'Project',
				'overview.flow.board': 'Board',
				'overview.flow.story': 'Story',
				'overview.flowHint': 'One project = one isolated board space; a board holds only the current iteration.',
				'product.newTitle': 'New product',
				'product.editTitle': 'Edit product',
				'product.name': 'Product name',
				'product.namePlaceholder': 'e.g. Didi',
				'product.key': 'Product key',
				'product.keyHint': '2–12 letters or digits, used on cards and in conversation',
				'product.description': 'One-line description',
				'product.descriptionPlaceholder': 'What problem does this product solve?',
				'product.color': 'Accent',
				'product.color.blue': 'Blue',
				'product.color.green': 'Green',
				'product.color.amber': 'Amber',
				'product.color.red': 'Red',
				'product.color.slate': 'Slate',
				'product.empty': 'No products yet',
				'product.emptyHint': 'A product is the top container that separates business directions.',
				'product.deleteTitle': 'Delete product',
				'product.deleteMessage': 'This also deletes {projects} projects, {boards} boards, and {stories} stories. It cannot be undone.',
				'product.manage': 'Manage projects',
				'product.codeSection': 'Code links',
				'product.repo': 'Repository',
				'product.repoPlaceholder': 'https://github.com/owner/repo',
				'product.repoHint': 'owner/repo shorthand is accepted and normalized to a repository URL',
				'product.localPath': 'Local project path',
				'product.localPathPlaceholder': '/Users/you/code/project',
				'product.localPathHint': 'Local project root for this product; type it or use Choose… to open the system folder picker',
				'product.choosePath': 'Choose…',
				'product.choosing': 'Choosing…',
				'product.pickerUnavailable': 'This environment has no system folder picker; type the path directly',
				'product.codeEmpty': 'No repository or local path linked',
				'import.button': 'Import product',
				'import.title': 'Import a product from an existing project',
				'import.desc': 'Pick a local project folder, auto-compose a reverse-engineering prompt, and run it in DSH to turn the existing project into a product with user stories on the board.',
				'import.step1': '1 · Choose a project and fill in the basics',
				'import.step2': '2 · Review the prompt and run it in DSH',
				'import.path': 'Local project path',
				'import.pathHint': 'Picking a folder fills in the product name and key; you can also type a path',
				'import.repo': 'Repository (optional)',
				'import.name': 'Product name',
				'import.key': 'Product key',
				'import.focus': 'Focus (optional)',
				'import.focusPlaceholder': 'e.g. focus on checkout and coupons',
				'import.language': 'Prompt language',
				'import.language.zh': '中文',
				'import.language.en': 'English',
				'import.compose': 'Compose prompt',
				'import.composing': 'Composing…',
				'import.promptLabel': 'Prompt preview (editable)',
				'import.promptHint': 'This text is sent to DSH as the user message; it tells the model to explore the code first, then land the stories.',
				'import.run': 'Run in DSH',
				'import.running': 'Running…',
				'import.copy': 'Copy prompt',
				'import.copied': 'Prompt copied. Paste it into a DSH conversation to run.',
				'import.runDone': 'Prompt filled into a new DSH conversation — review it and press Enter to send.',
				'import.runFallback': 'Could not open a conversation automatically; the prompt is copied — paste it into a DSH conversation.',
				'import.needPath': 'Pick or type a local project path first',
				'import.openBoard': 'Open board',
				'import.editProduct': 'Edit product',
				'project.newTitle': 'New project',
				'project.editTitle': 'Edit project',
				'project.name': 'Project name',
				'project.namePlaceholder': 'e.g. Suburb → station run',
				'project.key': 'Project key',
				'project.objective': 'Objective',
				'project.objectivePlaceholder': 'What are we solving in this period?',
				'project.description': 'Background and scope',
				'project.start': 'Start date',
				'project.end': 'End date',
				'project.product': 'Product',
				'project.empty': 'No projects yet',
				'project.emptyHint': 'Projects isolate goals; stories from different projects never share a board.',
				'project.progress': 'Progress',
				'project.deleteTitle': 'Delete project',
				'project.deleteMessage': 'This also deletes {boards} boards and {stories} stories. It cannot be undone.',
				'project.openBoard': 'Open board',
				'project.allProducts': 'All products',
				'project.boardsCount': '{n} boards',
				'project.storiesCount': '{n} stories',
				'board.newTitle': 'New board',
				'board.editTitle': 'Edit board',
				'board.name': 'Board name',
				'board.namePlaceholder': 'e.g. Iteration 1 · ride decision',
				'board.goal': 'Iteration goal',
				'board.goalPlaceholder': 'What must ship in these two weeks?',
				'board.start': 'Start date',
				'board.end': 'End date',
				'board.wip': 'WIP limits',
				'board.wipHint': 'In progress defaults to 3 and to verify to 5; a breach warns but never blocks the drop.',
				'board.empty': 'This project has no board yet',
				'board.emptyHint': 'A board is one iteration (or one continuous value stream). Create one, then pull stories in.',
				'board.newStory': 'New story',
				'board.edit': 'Edit board',
				'board.progress': 'Done {done}/{total}',
				'board.group.none': 'No grouping',
				'board.group.epic': 'Swimlanes by epic',
				'board.group.priority': 'Swimlanes by priority',
				'board.group.assignee': 'Swimlanes by assignee',
				'board.filter.assignee': 'Assignee',
				'board.filter.priority': 'Priority',
				'board.filter.epic': 'Epic',
				'board.filter.search': 'Search title, key, tags…',
				'board.noMatch': 'No stories match these filters',
				'board.filter.clear': 'Clear filters',
				'board.dropHere': 'Drop here',
				'board.wipOver': 'WIP exceeded',
				'board.column': '{n}',
				'stories.newTitle': 'New story',
				'stories.empty': 'No stories yet',
				'stories.emptyHint': 'Start with one testable story; it should fit inside one iteration.',
				'stories.search': 'Search stories…',
				'stories.count': '{n} stories',
				'stories.key': 'Key',
				'stories.title': 'Story',
				'stories.status': 'Status',
				'stories.priority': 'Priority',
				'stories.estimate': 'Estimate',
				'stories.assignee': 'Assignee',
				'stories.epic': 'Epic',
				'stories.tags': 'Tags',
				'stories.updated': 'Updated',
				'stories.board': 'Board',
				'stories.allBoards': 'All boards',
				'stories.backlogOnly': 'Backlog only',
				'story.newTitle': 'New story',
				'story.editTitle': 'Edit story',
				'story.title': 'Title',
				'story.titlePlaceholder': 'A verb phrase that says what gets built',
				'story.asA': 'As a…',
				'story.asAPlaceholder': 'Role or persona, e.g. passenger catching a train',
				'story.iWant': 'I want…',
				'story.iWantPlaceholder': 'The capability, not the technical solution',
				'story.soThat': 'So that…',
				'story.soThatPlaceholder': 'The benefit the user actually gets',
				'story.connextra': 'User story (Connextra)',
				'story.planning': 'Planning and ownership',
				'story.ac': 'Acceptance criteria',
				'story.acHint': 'Write observable results; cover the happy path, a boundary, and a failure.',
				'story.acPlaceholder': 'Given… When… Then…',
				'story.addAc': 'Add an acceptance criterion',
				'story.noAc': 'No acceptance criteria yet',
				'story.priority': 'Priority',
				'story.estimate': 'Story points',
				'story.assignee': 'Assignee',
				'story.assigneePlaceholder': 'Name or @handle',
				'story.epic': 'Epic',
				'story.epicPlaceholder': 'Optional; used for swimlanes',
				'story.tags': 'Tags',
				'story.tagsPlaceholder': 'Comma separated, e.g. map, route',
				'story.status': 'Status',
				'story.board': 'Board',
				'story.boardBacklog': 'Project backlog (not in an iteration)',
				'story.blocked': 'Mark as blocked',
				'story.blockedReason': 'Blocked reason',
				'story.blockedPlaceholder': 'e.g. waiting on map API v2',
				'story.deleteTitle': 'Delete story',
				'story.deleteMessage': 'Delete {key} {title}? This cannot be undone.',
				'story.meta': 'Created {created} · updated {updated}',
				'story.noProject': 'Create a project and board first',
				'wip.warning': '{status} has {count}, above the WIP limit of {limit}',
				'wip.none': 'WIP healthy',
				'activity.productCreated': 'Created product',
				'activity.productUpdated': 'Updated product',
				'activity.productDeleted': 'Deleted product',
				'activity.projectCreated': 'Created project',
				'activity.projectUpdated': 'Updated project',
				'activity.projectDeleted': 'Deleted project',
				'activity.boardCreated': 'Created board',
				'activity.boardUpdated': 'Updated board',
				'activity.boardDeleted': 'Deleted board',
				'activity.storyCreated': 'Created story',
				'activity.storyUpdated': 'Updated story',
				'activity.storyMoved': 'Moved story',
				'activity.storyDeleted': 'Deleted story',
				'activity.storyImported': 'Imported stories',
				'activity.demoSeeded': 'Loaded demo',
				'time.now': 'just now',
				'time.min': '{n} min ago',
				'time.hour': '{n} h ago',
				'time.day': '{n} d ago',
				'points': '{n} SP',
				'acProgress': '{done}/{total}',
				'delete.confirm': 'Delete',
				'error.actionFailed': 'Action failed'
			}
		};

		/** Translate one key with `{name}` interpolation; unknown keys stay visible. */
		function translate(dict, key, vars) {
			const raw = dict[key] ?? key;
			if (vars === undefined) return raw;
			return raw.replace(/\{(\w+)\}/g, (whole, name) => (vars[name] === undefined ? whole : String(vars[name])));
		}

		/* ------------------------------------------------------------------ */
		/* Styles                                                             */
		/* ------------------------------------------------------------------ */

		const CSS = `
.sb-root{height:100%;min-height:0;display:flex;flex-direction:column;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:13px;line-height:1.5}
.sb-head{display:flex;align-items:flex-start;gap:12px;padding:16px 22px 10px;flex:none}
.sb-head-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);flex:none}
.sb-head-text{flex:1;min-width:0}
.sb-title{font-size:18px;font-weight:650;margin:0;line-height:1.25;letter-spacing:-.01em}
.sb-subtitle{margin:2px 0 0;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.sb-head-actions{display:flex;align-items:center;gap:6px;flex:none}
.sb-tabs{display:flex;gap:2px;padding:0 22px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;overflow-x:auto;scrollbar-width:none}
.sb-tab{position:relative;padding:9px 12px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12.5px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.sb-tab:hover{color:var(--dsw-alias-label-primary)}
.sb-tab-active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}
.sb-tab-count{margin-left:6px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.sb-tab-active .sb-tab-count{color:var(--dsw-alias-label-secondary)}
.sb-body{flex:1;min-height:0;display:flex;flex-direction:column}
.sb-scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px 22px 44px}
.sb-context{display:flex;align-items:center;gap:8px;padding:10px 22px;flex:none;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1)}
.sb-ctx-group{display:flex;align-items:center;gap:5px}
.sb-ctx-label{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding-right:1px}
.sb-select{height:28px;max-width:260px;padding:0 26px 0 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background-color:var(--dsw-alias-bg-layer-2);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-position:right 7px center;background-repeat:no-repeat;background-size:12px 12px;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;appearance:none;outline:none;cursor:pointer}
.sb-select:hover{border-color:var(--dsw-alias-border-l3)}
.sb-select:focus-visible{border-color:var(--dsw-alias-border-l4)}
.sb-spacer{flex:1;min-width:0}
.sb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 11px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s,color .12s}
.sb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}
.sb-btn:focus-visible{outline:2px solid var(--dsw-alias-border-l4);outline-offset:1px}
.sb-btn:disabled{opacity:.45;cursor:not-allowed}
.sb-btn-primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-weight:600}
.sb-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);opacity:.92}
.sb-btn-ghost{border-color:transparent;color:var(--dsw-alias-label-secondary)}
.sb-btn-ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.sb-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.sb-btn-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.sb-btn-sm{height:26px;padding:0 8px;font-size:12px}
.sb-icon-btn{width:28px;height:28px;padding:0;flex:none}
.sb-icon-btn.sb-btn-sm{width:24px;height:24px}
.sb-form{display:flex;flex-direction:column;gap:13px}
.sb-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sb-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.sb-field-label{font-size:11.5px;color:var(--dsw-alias-label-secondary);display:flex;align-items:center;gap:4px}
.sb-required{color:var(--dsw-alias-state-error-primary)}
.sb-field-hint{font-size:10.5px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.sb-input-row{display:flex;align-items:center;gap:6px;min-width:0}
.sb-input-row .sb-input{flex:1;min-width:0}
.sb-field-error{font-size:10.5px;line-height:1.5;color:var(--dsw-alias-state-error-primary)}
.sb-input,.sb-textarea{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none;line-height:1.5}
.sb-input{height:35px}
.sb-btn-field{height:35px;padding:0 12px;border-radius:7px;font-size:12.5px}
.sb-input:focus,.sb-textarea:focus{border-color:var(--dsw-alias-border-l4)}
.sb-textarea{min-height:56px;resize:vertical}
.sb-import-prompt{min-height:260px;font-family:var(--dsw-alias-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;line-height:1.6;white-space:pre-wrap}
.sb-input::placeholder,.sb-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}
.sb-check{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.sb-check input{accent-color:var(--dsw-alias-brand-primary);width:14px;height:14px;margin:0}
.sb-key-chip{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:1.6;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap;letter-spacing:.01em}
.sb-priority{font-size:10.5px;font-weight:650;letter-spacing:.02em;font-variant-numeric:tabular-nums}
.sb-tag{font-size:10.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.sb-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;line-height:1.7;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:nowrap}
.sb-badge-danger{color:var(--dsw-alias-state-error-primary)}
.sb-badge-success{color:var(--dsw-alias-state-success-primary)}
.sb-badge-warn{color:var(--dsw-alias-state-warn-primary)}
.sb-avatar{width:17px;height:17px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:650;flex:none;text-transform:uppercase}
.sb-overlay{position:fixed;inset:0;z-index:400;background:var(--dsw-alias-bg-mask-1);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:var(--dsw-mask-blur)}
.sb-modal{width:min(500px,calc(100vw - 32px));max-height:calc(100vh - 48px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:var(--dsw-elevation-prominent);overflow:hidden}
.sb-modal-wide{width:min(640px,calc(100vw - 32px))}
.sb-modal-head{padding:15px 18px 10px;display:flex;align-items:flex-start;gap:10px;flex:none}
.sb-modal-title{font-size:14.5px;font-weight:650;margin:0;flex:1;min-width:0;line-height:1.35}
.sb-modal-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin:3px 0 0}
.sb-modal-body{padding:4px 18px 16px;overflow:auto;min-height:0}
.sb-modal-foot{padding:11px 18px;border-top:1px solid var(--dsw-alias-border-l1);display:flex;align-items:center;gap:8px;justify-content:flex-end;flex:none}
.sb-drawer-overlay{position:fixed;inset:0;z-index:400;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}
.sb-drawer{position:fixed;top:0;right:0;bottom:0;z-index:401;width:min(560px,100vw);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent)}
.sb-drawer-head{padding:14px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);display:flex;align-items:center;gap:8px;flex:none}
.sb-drawer-title{font-size:14px;font-weight:650;margin:0;flex:1;min-width:0}
.sb-drawer-body{flex:1;min-height:0;overflow:auto;padding:16px 18px 24px}
.sb-drawer-foot{padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l1);display:flex;align-items:center;gap:8px;flex:none}
.sb-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:500;display:flex;align-items:center;gap:8px;max-width:min(560px,calc(100vw - 32px));padding:8px 13px;border-radius:9px;background:var(--dsw-alias-toast-bg);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent);font-size:12px;border:1px solid var(--dsw-alias-border-l1)}
.sb-toast-warn{color:var(--dsw-alias-state-warn-primary)}
.sb-toast-error{color:var(--dsw-alias-state-error-primary)}
.sb-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px}
.sb-kpi{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:11px;padding:12px 14px;min-width:0}
.sb-kpi-value{font-size:23px;font-weight:650;line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.sb-kpi-label{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:3px}
.sb-grid-2wide{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:12px;align-items:start}
.sb-panel{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:15px 16px;min-width:0}
.sb-panel-title{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;font-weight:650;margin:0 0 11px;line-height:1.3}
.sb-panel-hint{font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-weight:400;margin-top:8px;line-height:1.55}
.sb-bar{display:flex;height:9px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.sb-bar-seg{height:100%;transition:width .25s ease}
.sb-legend{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:13px}
.sb-legend-row{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dsw-alias-label-secondary);min-width:0}
.sb-legend-row b{margin-left:auto;color:var(--dsw-alias-label-primary);font-weight:600;font-variant-numeric:tabular-nums}
.sb-dot{width:7px;height:7px;border-radius:999px;flex:none}
.sb-list{display:flex;flex-direction:column;gap:1px}
.sb-list-row{display:flex;align-items:center;gap:8px;padding:7px 6px;border-radius:7px;cursor:pointer;min-width:0}
.sb-list-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sb-list-main{min-width:0;flex:1}
.sb-list-title{font-size:12px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-list-sub{font-size:10.5px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.sb-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:9px;padding:46px 20px;color:var(--dsw-alias-label-secondary)}
.sb-empty-icon{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary)}
.sb-empty-title{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary)}
.sb-empty-hint{font-size:12px;max-width:430px;line-height:1.7}
.sb-hero{max-width:760px;margin:8px auto 0;padding:8px 4px}
.sb-hero-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;padding:26px 26px 22px}
.sb-hero-title{font-size:20px;font-weight:650;margin:0 0 6px;letter-spacing:-.01em}
.sb-hero-hint{font-size:12.5px;color:var(--dsw-alias-label-secondary);line-height:1.75;margin:0 0 18px;max-width:580px}
.sb-hero-actions{display:flex;gap:9px;flex-wrap:wrap}
.sb-flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:18px 0 6px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.sb-flow-node{padding:3px 9px;border-radius:7px;background:var(--dsw-alias-bg-layer-2);white-space:nowrap}
.sb-flow-arrow{color:var(--dsw-alias-label-tertiary);font-size:10px}
.sb-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}
.sb-prod{position:relative;display:flex;flex-direction:column;gap:9px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:15px 15px 13px 17px;overflow:hidden;min-width:0}
.sb-prod::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--sb-accent,var(--dsw-alias-brand-primary))}
.sb-prod-head{display:flex;align-items:center;gap:7px;min-width:0}
.sb-prod-name{font-size:13.5px;font-weight:650;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-prod-desc{font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-secondary);min-height:37px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sb-prod-code{display:flex;flex-direction:column;gap:4px;padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l1);min-width:0}
.sb-code-row{display:flex;align-items:center;gap:6px;min-width:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);text-decoration:none}
a.sb-code-row:hover{color:var(--dsw-alias-brand-primary)}
.sb-code-row svg{flex:none;opacity:.75}
.sb-code-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.sb-code-path .sb-code-text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10.5px}
.sb-code-empty{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.sb-meta-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}
.sb-card-actions{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.sb-rows{display:flex;flex-direction:column;gap:7px}
.sb-row{display:flex;align-items:center;gap:13px;padding:11px 13px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;min-width:0}
.sb-row:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}
.sb-row-main{flex:1;min-width:0}
.sb-row-title{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;min-width:0}
.sb-row-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-row-sub{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-row-meta{display:flex;align-items:center;gap:12px;flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.sb-progress{width:110px;height:6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;flex:none}
.sb-progress-fill{height:100%;background:var(--dsw-alias-state-success-primary);border-radius:999px}
.sb-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:13px}
.sb-toolbar-title{font-size:12.5px;font-weight:600;margin-right:2px}
.sb-board-wrap{flex:1;min-height:0;display:flex;flex-direction:column;gap:9px;padding:12px 18px 16px;overflow:hidden}
.sb-board-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none;min-width:0}
.sb-board-heading{min-width:0;flex:1}
.sb-board-name{font-size:13.5px;font-weight:650;display:flex;align-items:center;gap:8px;min-width:0;margin:0}
.sb-board-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-board-goal{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-board-meta{display:flex;align-items:center;gap:10px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);flex-wrap:wrap}
.sb-filters{display:flex;align-items:center;gap:7px;flex-wrap:wrap;flex:none}
.sb-search{position:relative;display:flex;align-items:center}
.sb-search svg{position:absolute;left:8px;color:var(--dsw-alias-label-tertiary);pointer-events:none}
.sb-search input{height:28px;width:200px;box-sizing:border-box;padding:0 9px 0 27px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}
.sb-search input:focus{border-color:var(--dsw-alias-border-l4)}
.sb-lanes{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:2px 2px 18px}
.sb-grid{display:grid;grid-template-columns:repeat(5,minmax(176px,1fr));gap:8px;min-width:928px;align-items:start}
.sb-col-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:6px;padding:4px 2px 7px;background:var(--dsw-alias-bg-base);min-width:0}
.sb-col-head .sb-dot{width:8px;height:8px}
.sb-col-title{font-size:11.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sb-col-count{font-size:10.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none}
.sb-wip{margin-left:auto;flex:none;font-size:9.5px;line-height:1.7;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.sb-wip-over{color:var(--dsw-alias-state-warn-primary);border:1px solid var(--dsw-alias-state-warn-primary)}
.sb-lane-band{grid-column:1 / -1;display:flex;align-items:center;gap:7px;padding:12px 2px 2px;margin-top:3px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;font-weight:650;color:var(--dsw-alias-label-secondary);min-width:0}
.sb-lane-band span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-lane-count{font-weight:400;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.sb-cell{min-height:112px;background:var(--dsw-alias-bg-layer-2);border:1px solid transparent;border-radius:10px;padding:7px;display:flex;flex-direction:column;gap:7px;transition:border-color .12s,background .12s}
.sb-cell-over{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-3)}
.sb-cell-empty{display:flex;align-items:center;justify-content:center;min-height:94px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;font-size:10.5px;color:var(--dsw-alias-label-tertiary);text-align:center;padding:8px}
.sb-card{display:flex;flex-direction:column;gap:5px;box-sizing:border-box;min-height:108px;padding:9px 10px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;cursor:grab;user-select:none;box-shadow:none}
.sb-card:hover{border-color:var(--dsw-alias-border-l3)}
.sb-card:active{cursor:grabbing}
.sb-card-dragging{opacity:.45}
.sb-card-top{display:flex;align-items:center;gap:5px;min-width:0}
.sb-card-title{font-size:12.5px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.sb-card-value{font-size:10.5px;line-height:1.45;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-card-foot{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:auto;min-width:0}
.sb-card-metric{display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
.sb-card-tags{display:flex;gap:5px;overflow:hidden;min-width:0}
.sb-table-wrap{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
.sb-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;min-width:900px}
.sb-th{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-base);text-align:left;font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-secondary);padding:7px 9px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.sb-td{padding:8px 9px;border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top}
.sb-tr{cursor:pointer}
.sb-tr:hover .sb-td{background:var(--dsw-alias-interactive-bg-hover)}
.sb-story-cell{min-width:200px}
.sb-story-cell-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}
.sb-story-cell-value{font-size:10.5px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px;margin-top:1px}
.sb-mini-select{height:24px;max-width:124px;padding:0 20px 0 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background-color:var(--dsw-alias-bg-layer-2);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-position:right 5px center;background-repeat:no-repeat;background-size:10px 10px;color:var(--dsw-alias-label-primary);font:inherit;font-size:11px;appearance:none;outline:none;cursor:pointer}
.sb-ac-list{display:flex;flex-direction:column;gap:6px}
.sb-ac-row{display:flex;align-items:flex-start;gap:7px}
.sb-ac-row .sb-check{margin-top:8px;flex:none}
.sb-ac-row .sb-input{flex:1}
.sb-blocked-box{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:9px 10px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-layer-2)}
.sb-form-section{border-top:1px solid var(--dsw-alias-border-l1);padding-top:13px;margin-top:2px;display:flex;flex-direction:column;gap:10px}
.sb-form-section-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sb-form-section-title{font-size:11.5px;font-weight:650;color:var(--dsw-alias-label-primary)}
.sb-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media (max-width:900px){
  .sb-grid-2wide{grid-template-columns:1fr}
  .sb-head{padding:14px 16px 8px}
  .sb-tabs{padding:0 16px}
  .sb-context{padding:10px 16px}
  .sb-scroll{padding:14px 16px 40px}
  .sb-board-wrap{padding:10px 12px 14px}
  .sb-search input{width:150px}
}
`;

		/** Install the stylesheet once and remove it when the plugin unloads. */
		function ensureCss() {
			const tag = `${NS}/styles`;
			if (typeof document === 'undefined' || document.querySelector(`style[data-plugin-css=${JSON.stringify(tag)}]`) !== null) return undefined;
			const style = document.createElement('style');
			style.dataset.plugin = NS;
			style.dataset.pluginCss = tag;
			style.textContent = CSS;
			document.head.appendChild(style);
			return style;
		}

		/* ------------------------------------------------------------------ */
		/* API                                                                */
		/* ------------------------------------------------------------------ */

		async function post(path, body) {
			const response = await fetch(`api/story-board/${path}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body ?? {})
			});
			if (response.ok !== true) throw new Error(`HTTP ${String(response.status)}`);
			const data = await response.json();
			if (data === null || typeof data !== 'object' || data.ok !== true) {
				const error = new Error(data?.error?.message ?? 'story board request failed');
				if (typeof data?.error?.code === 'string') error.code = data.error.code;
				throw error;
			}
			return data;
		}

		const api = {
			state: async () => (await post('state', {})).value,
			command: async (body) => post('command', body),
			pickDirectory: async () => (await post('pick-directory', {})).value,
			composeImport: async (body) => (await post('compose-import', body)).value
		};

		/**
		 * Bridge to the DSH conversation runtime, wired in `apply` once `ctx` is
		 * known. The panel hands the composed prompt to a conversation through the
		 * `uiWorkspace` client service — `startSession` opens the workspace's blank
		 * conversation and, given `{ prompt }`, pre-fills its composer draft. That
		 * is the same "New Session returns to the blank's unsent draft" path the
		 * GUI uses, so the prompt lands in the input box ready to send with Enter;
		 * it needs no session remote the panel does not carry.
		 *
		 * The caller degrades to copying the prompt only when even this service is
		 * unavailable, so the flow always finishes.
		 */
		let dsh = null;
		function makeDshBridge(ctx) {
			const workspace = () => (typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined);
			return {
				/**
				 * Open a DSH conversation with `text` pre-filled in the composer, so
				 * the user reviews it and presses Enter rather than copy-pasting.
				 * Resolves true when the conversation was opened, false otherwise.
				 */
				async fillConversation(text) {
					const service = workspace();
					if (typeof service?.startSession !== 'function') return false;
					// Absent workspaceId inherits the current/most-recent workspace, so
					// the prompt opens in the conversation the user is already using.
					service.startSession(undefined, { prompt: text, whenDraftExists: 'replace' });
					return true;
				},
				/** Best-effort: open a fresh blank conversation for a manual paste. */
				async openBlankConversation() {
					try {
						workspace()?.startSession?.();
						return true;
					} catch {
						return false;
					}
				}
			};
		}

		/* ------------------------------------------------------------------ */
		/* Icons                                                              */
		/* ------------------------------------------------------------------ */

		const Icon = {
			logo: (size = 20) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
				h('rect', { x: 3.2, y: 4.2, width: 4.4, height: 15.6, rx: 1.5, fill: 'currentColor', opacity: .32 }),
				h('rect', { x: 9.8, y: 4.2, width: 4.4, height: 15.6, rx: 1.5, fill: 'currentColor', opacity: .62 }),
				h('rect', { x: 16.4, y: 4.2, width: 4.4, height: 15.6, rx: 1.5, fill: 'currentColor' })),
			plus: (size = 13) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' },
				h('path', { d: 'M8 3.5v9M3.5 8h9' })),
			refresh: (size = 14) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('path', { d: 'M13 8a5 5 0 1 1-1.5-3.55' }),
				h('path', { d: 'M13 2.8v3.1H9.9' })),
			search: (size = 13) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' },
				h('circle', { cx: 7, cy: 7, r: 4.2 }),
				h('path', { d: 'M10.2 10.2L13.5 13.5' })),
			close: (size = 13) => h('svg', { width: size, height: size, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' },
				h('path', { d: 'M3.5 3.5l7 7M10.5 3.5l-7 7' })),
			trash: (size = 13) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('path', { d: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-8.2' })),
			edit: (size = 13) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('path', { d: 'M10.8 2.9l2.3 2.3L5.6 12.7l-3 .7.7-3z' })),
			check: (size = 10) => h('svg', { width: size, height: size, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('path', { d: 'M2.5 6.4l2.3 2.3L9.6 3.5' })),
			alert: (size = 12) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' },
				h('path', { d: 'M8 2.8l5.4 9.4H2.6L8 2.8z' }),
				h('path', { d: 'M8 6.4v2.4M8 10.6v.1' })),
			board: (size = 18) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' },
				h('rect', { x: 3.5, y: 4.5, width: 5.2, height: 14, rx: 1.4 }),
				h('rect', { x: 9.9, y: 4.5, width: 5.2, height: 9, rx: 1.4 }),
				h('rect', { x: 16.3, y: 4.5, width: 4.2, height: 12, rx: 1.4 })),
			chevron: (size = 10) => h('svg', { width: size, height: size, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('path', { d: 'M3 4.5L6 7.5L9 4.5' })),
			repo: (size = 12) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('circle', { cx: 4.4, cy: 3.4, r: 1.6 }),
				h('circle', { cx: 4.4, cy: 12.6, r: 1.6 }),
				h('circle', { cx: 11.6, cy: 6.4, r: 1.6 }),
				h('path', { d: 'M4.4 5v6M6 10.8c3.4 0 4-1.6 4-2.8V8' })),
			folder: (size = 12) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('path', { d: 'M2 4.2c0-.6.4-1 1-1h3l1.2 1.4H13c.6 0 1 .4 1 1v5.8c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1V4.2z' })),
			up: (size = 12) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('path', { d: 'M8 12.5V3.8M4.2 7.6L8 3.8l3.8 3.8' })),
			right: (size = 10) => h('svg', { width: size, height: size, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('path', { d: 'M4.5 3L7.5 6L4.5 9' })),
			empty: (size = 22) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
				h('rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 2.5 }),
				h('path', { d: 'M3 9h18M8 13h8M8 16h5' }))
		};

		/* ------------------------------------------------------------------ */
		/* Small helpers                                                      */
		/* ------------------------------------------------------------------ */

		const STATUS_RANK = { backlog: 0, todo: 1, in_progress: 2, verify: 3, done: 4 };
		const PRIORITY_ORDER = ['P0', 'P1', 'P2', 'P3'];

		function statusMeta(snapshot, id) {
			return (snapshot?.meta?.statuses ?? []).find((status) => status.id === id);
		}

		function statusLabel(t, id) {
			return t(`status.${id}`);
		}

		function wipLimit(board, status) {
			if (board?.wip !== undefined && board.wip !== null && Object.hasOwn(board.wip, status.id) === true) {
				const override = board.wip[status.id];
				if (override === null) return null;
				if (typeof override === 'number') return override;
			}
			return status.wip;
		}

		function effectiveWip(board, status, stories) {
			const limit = wipLimit(board, status);
			const count = stories.filter((story) => story.status === status.id).length;
			return { limit, count, exceeded: limit !== null && limit !== undefined && count > limit };
		}

		function formatDate(value) {
			return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : '';
		}

		/** Short, readable label for a repository URL: `owner/repo`. */
		function repoLabel(url) {
			if (typeof url !== 'string' || url === '') return '';
			const clean = url
				.replace(/^https?:\/\//i, '')
				.replace(/^www\./i, '')
				.replace(/^github\.com\//i, '')
				.replace(/\.git$/i, '')
				.replace(/\/+$/, '');
			return clean;
		}

		function relTime(t, value) {
			const then = typeof value === 'string' ? Date.parse(value) : NaN;
			if (Number.isFinite(then) !== true) return '';
			const diff = Math.max(0, Date.now() - then);
			const minutes = Math.floor(diff / 60000);
			if (minutes < 1) return t('time.now');
			if (minutes < 60) return t('time.min', { n: minutes });
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return t('time.hour', { n: hours });
			const days = Math.floor(hours / 24);
			if (days < 30) return t('time.day', { n: days });
			return formatDate(value);
		}

		/** Localized activity sentence for a store kind such as `story.created`. */
		function activityLabel(t, kind) {
			const camel = String(kind ?? '').split('.').map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)).join('');
			const key = `activity.${camel}`;
			const value = t(key);
			return value === key ? String(kind ?? '') : value;
		}

		function initials(name) {
			const clean = String(name ?? '').trim();
			if (clean === '') return '?';
			const at = clean.replace(/^@/, '');
			return at.slice(0, 1).toUpperCase();
		}

		function sortStories(stories) {
			return [...stories].sort((left, right) => {
				const byPriority = (PRIORITY_ORDER.indexOf(left.priority) === -1 ? 9 : PRIORITY_ORDER.indexOf(left.priority))
					- (PRIORITY_ORDER.indexOf(right.priority) === -1 ? 9 : PRIORITY_ORDER.indexOf(right.priority));
				if (byPriority !== 0) return byPriority;
				if (left.rank !== right.rank) return left.rank - right.rank;
				return String(left.key).localeCompare(String(right.key));
			});
		}

		function plural(t, key, count) {
			return t(key, { n: count });
		}

		/* ------------------------------------------------------------------ */
		/* Primitives                                                         */
		/* ------------------------------------------------------------------ */

		function Button({ children, variant, size, icon, title, onClick, disabled, type = 'button', className = '', ariaLabel }) {
			const classes = ['sb-btn'];
			if (variant !== undefined) classes.push(`sb-btn-${variant}`);
			if (size === 'sm') classes.push('sb-btn-sm');
			if (icon !== undefined && children === undefined) classes.push('sb-icon-btn');
			if (className !== '') classes.push(className);
			return h('button', {
				type,
				className: classes.join(' '),
				onClick,
				disabled: disabled === true,
				title,
				'aria-label': ariaLabel ?? title
			}, icon, children);
		}

		function Field({ label, hint, required, children }) {
			return h('label', { className: 'sb-field' },
				h('span', { className: 'sb-field-label' }, label, required === true ? h('span', { className: 'sb-required' }, '*') : undefined),
				children,
				hint === undefined ? undefined : h('span', { className: 'sb-field-hint' }, hint));
		}

		/** Keep Tab inside a dialog and focus its first field when nothing inside is focused yet. */
		function useFocusTrap(ref) {
			useEffect(() => {
				const node = ref.current;
				if (node === null || node === undefined) return undefined;
				if (node.contains(document.activeElement) !== true) {
					const firstField = node.querySelector('input:not([disabled]),textarea:not([disabled]),select:not([disabled])');
					if (firstField !== null) firstField.focus();
				}
				const onKeyDown = (event) => {
					if (event.key !== 'Tab') return;
					const items = [...node.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
						.filter((element) => element.getClientRects().length > 0);
					if (items.length === 0) return;
					const first = items[0];
					const last = items[items.length - 1];
					if (event.shiftKey === true && document.activeElement === first) {
						event.preventDefault();
						last.focus();
					} else if (event.shiftKey !== true && document.activeElement === last) {
						event.preventDefault();
						first.focus();
					}
				};
				node.addEventListener('keydown', onKeyDown);
				return () => node.removeEventListener('keydown', onKeyDown);
			}, [ref]);
		}

		function Modal({ title, subtitle, onClose, children, footer, wide }) {
			const modalRef = useRef(null);
			useFocusTrap(modalRef);
			useEffect(() => {
				const onKeyDown = (event) => {
					if (event.key === 'Escape') onClose();
				};
				window.addEventListener('keydown', onKeyDown);
				return () => window.removeEventListener('keydown', onKeyDown);
			}, [onClose]);
			if (typeof document === 'undefined') return null;
			return ReactDOM.createPortal(h('div', {
				className: 'sb-overlay',
				'data-window-drag-exclude': '',
				onMouseDown: (event) => {
					if (event.target === event.currentTarget) onClose();
				}
			}, h('div', {
				ref: modalRef,
				className: `sb-modal${wide === true ? ' sb-modal-wide' : ''}`,
				role: 'dialog',
				'aria-modal': 'true',
				'aria-label': title
			},
				h('div', { className: 'sb-modal-head' },
					h('div', { style: { flex: 1, minWidth: 0 } },
						h('h2', { className: 'sb-modal-title' }, title),
						subtitle === undefined ? undefined : h('p', { className: 'sb-modal-sub' }, subtitle)),
					h(Button, { variant: 'ghost', size: 'sm', icon: Icon.close(13), onClick: onClose, title: 'Close', ariaLabel: 'Close' })),
				h('div', { className: 'sb-modal-body' }, children),
				footer === undefined ? undefined : h('div', { className: 'sb-modal-foot' }, footer)
			)), document.body);
		}

		function Drawer({ title, subtitle, onClose, children, footer }) {
			const drawerRef = useRef(null);
			useFocusTrap(drawerRef);
			useEffect(() => {
				const onKeyDown = (event) => {
					if (event.key === 'Escape') onClose();
				};
				window.addEventListener('keydown', onKeyDown);
				return () => window.removeEventListener('keydown', onKeyDown);
			}, [onClose]);
			if (typeof document === 'undefined') return null;
			return ReactDOM.createPortal(h(React.Fragment, null,
				h('div', { className: 'sb-drawer-overlay', 'data-window-drag-exclude': '', onMouseDown: onClose }),
				h('aside', { ref: drawerRef, className: 'sb-drawer', 'data-window-drag-exclude': '', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
					h('div', { className: 'sb-drawer-head' },
						h('div', { style: { flex: 1, minWidth: 0 } },
							h('h2', { className: 'sb-drawer-title' }, title),
							subtitle === undefined ? undefined : h('p', { className: 'sb-modal-sub' }, subtitle)),
						h(Button, { variant: 'ghost', size: 'sm', icon: Icon.close(13), onClick: onClose, title: 'Close', ariaLabel: 'Close' })),
					h('div', { className: 'sb-drawer-body' }, children),
					footer === undefined ? undefined : h('div', { className: 'sb-drawer-foot' }, footer))
			), document.body);
		}

		function Empty({ title, hint, action }) {
			return h('div', { className: 'sb-empty' },
				h('div', { className: 'sb-empty-icon' }, Icon.empty(22)),
				h('div', { className: 'sb-empty-title' }, title),
				h('div', { className: 'sb-empty-hint' }, hint),
				action);
		}

		function KeyChip({ children }) {
			return h('span', { className: 'sb-key-chip' }, children);
		}

		function Priority({ value }) {
			return h('span', { className: 'sb-priority', style: { color: PRIORITY_TONE[value] ?? 'var(--dsw-alias-label-tertiary)' } }, value);
		}

		function Avatar({ name }) {
			return h('span', { className: 'sb-avatar', title: name }, initials(name));
		}

		/** Native select with the host's compact control look. */
		function Select({ value, onChange, options, ariaLabel, className = '', disabled }) {
			return h('select', {
				className: `sb-select ${className}`.trim(),
				value: value === undefined || value === null ? '' : value,
				onChange: (event) => onChange(event.target.value),
				'aria-label': ariaLabel,
				disabled: disabled === true
			}, options.map((option) => h('option', { key: option.value, value: option.value }, option.label)));
		}

		/* ------------------------------------------------------------------ */
		/* Overview                                                           */
		/* ------------------------------------------------------------------ */

		function Distribution({ snapshot, t }) {
			const statuses = snapshot.meta.statuses;
			const stories = snapshot.stories;
			const total = stories.length;
			return h('div', null,
				h('div', { className: 'sb-bar', role: 'img', 'aria-label': t('overview.distribution') },
					statuses.map((status) => {
						const count = stories.filter((story) => story.status === status.id).length;
						if (count === 0) return undefined;
						return h('div', {
							key: status.id,
							className: 'sb-bar-seg',
							style: { width: `${String((count / Math.max(1, total)) * 100)}%`, background: STATUS_TONE[status.id] },
							title: `${statusLabel(t, status.id)} ${String(count)}`
						});
					})),
				h('div', { className: 'sb-legend' },
					statuses.map((status) => {
						const count = stories.filter((story) => story.status === status.id).length;
						return h('div', { key: status.id, className: 'sb-legend-row' },
							h('span', { className: 'sb-dot', style: { background: STATUS_TONE[status.id] } }),
							h('span', null, statusLabel(t, status.id)),
							h('b', null, String(count)));
					})),
				h('p', { className: 'sb-panel-hint' }, t('overview.distributionHint')));
		}

		function Overview({ snapshot, context, onGoto, onSeed, onNewProduct, onOpenStory, onNewProject, busy, t }) {
			const stories = snapshot.stories;
			const products = snapshot.products;
			const projects = snapshot.projects;
			const boards = snapshot.boards;
			const points = stories.reduce((sum, story) => sum + (typeof story.estimate === 'number' ? story.estimate : 0), 0);
			const blocked = stories.filter((story) => story.blocked === true);
			const active = stories.filter((story) => story.status === 'in_progress').length;
			const done = stories.filter((story) => story.status === 'done').length;

			const wipRows = [];
			for (const board of boards) {
				const boardStories = stories.filter((story) => story.boardId === board.id);
				for (const status of snapshot.meta.statuses) {
					const limit = wipLimit(board, status);
					if (limit === null || limit === undefined) continue;
					const count = boardStories.filter((story) => story.status === status.id).length;
					if (count > limit) wipRows.push({ board, status, count, limit });
				}
			}

			if (products.length === 0) {
				return h('div', { className: 'sb-hero' },
					h('div', { className: 'sb-hero-card' },
						h('h2', { className: 'sb-hero-title' }, t('overview.emptyTitle')),
						h('p', { className: 'sb-hero-hint' }, t('overview.emptyHint')),
						h('div', { className: 'sb-hero-actions' },
							h(Button, { variant: 'primary', icon: Icon.plus(13), onClick: onNewProduct }, t('overview.createProduct')),
							h(Button, { icon: Icon.board(14), onClick: onSeed, disabled: busy === true }, t('overview.seed'))),
						h('div', { className: 'sb-flow' },
							h('span', { className: 'sb-flow-node' }, t('overview.flow.product')),
							h('span', { className: 'sb-flow-arrow' }, '→'),
							h('span', { className: 'sb-flow-node' }, t('overview.flow.project')),
							h('span', { className: 'sb-flow-arrow' }, '→'),
							h('span', { className: 'sb-flow-node' }, t('overview.flow.board')),
							h('span', { className: 'sb-flow-arrow' }, '→'),
							h('span', { className: 'sb-flow-node' }, t('overview.flow.story'))),
						h('p', { className: 'sb-panel-hint' }, t('overview.flowHint'))));
			}

			const kpis = [
				{ label: t('overview.kpi.products'), value: products.length },
				{ label: t('overview.kpi.projects'), value: projects.length },
				{ label: t('overview.kpi.boards'), value: boards.length },
				{ label: t('overview.kpi.stories'), value: stories.length },
				{ label: t('overview.kpi.points'), value: Math.round(points * 10) / 10 },
				{ label: t('overview.kpi.blocked'), value: blocked.length, tone: blocked.length > 0 ? 'var(--dsw-alias-state-error-primary)' : undefined }
			];

			const wipRowsView = wipRows.map((row) => h('div', {
				key: `${row.board.id}:${row.status.id}`,
				className: 'sb-list-row',
				onClick: () => onGoto(row.board.id)
			},
				h('span', { className: 'sb-badge sb-badge-warn' }, h('span', { className: 'sb-dot', style: { background: 'var(--dsw-alias-state-warn-primary)' } }), t('board.wipOver')),
				h('div', { className: 'sb-list-main' },
					h('div', { className: 'sb-list-title' }, row.board.name),
					h('div', { className: 'sb-list-sub' }, t('overview.wipOver', {
						board: row.board.name,
						status: statusLabel(t, row.status.id),
						count: row.count,
						limit: row.limit
					})))));

			const wipPanel = h('div', { className: 'sb-panel' },
				h('h3', { className: 'sb-panel-title' }, t('overview.wip')),
				wipRows.length === 0
					? h('div', { className: 'sb-legend-row' },
						h('span', { className: 'sb-dot', style: { background: 'var(--dsw-alias-state-success-primary)' } }),
						h('span', null, t('overview.wipHealthy')))
					: h('div', { className: 'sb-list' }, wipRowsView));

			const blockerRowsView = blocked.slice(0, 6).map((story) => h('div', {
				key: story.id,
				className: 'sb-list-row',
				onClick: () => onOpenStory(story)
			},
				Icon.alert(12),
				h('div', { className: 'sb-list-main' },
					h('div', { className: 'sb-list-title' }, `${story.key} ${story.title}`),
					h('div', { className: 'sb-list-sub' }, story.blockedReason || t('common.blocked')))));

			const blockerPanel = h('div', { className: 'sb-panel' },
				h('h3', { className: 'sb-panel-title' }, t('overview.blockers')),
				blocked.length === 0
					? h('div', { className: 'sb-legend-row' },
						h('span', { className: 'sb-dot', style: { background: 'var(--dsw-alias-state-success-primary)' } }),
						h('span', null, t('overview.noBlockers')))
					: h('div', { className: 'sb-list' }, blockerRowsView));

			const activityRowsView = [...snapshot.activity].reverse().slice(0, 10).map((entry) => h('div', {
				key: entry.id,
				className: 'sb-list-row',
				style: { cursor: 'default' }
			},
				h('div', { className: 'sb-list-main' },
					h('div', { className: 'sb-list-title', style: { fontWeight: 400 } }, `${activityLabel(t, entry.kind)} · ${entry.label}`),
					h('div', { className: 'sb-list-sub' }, relTime(t, entry.at)))));

			const activityPanel = h('div', { className: 'sb-panel', style: { marginTop: 12 } },
				h('h3', { className: 'sb-panel-title' },
					h('span', null, t('overview.activity')),
					h('span', { className: 'sb-panel-hint', style: { margin: 0 } }, `${String(active)} ${t('status.in_progress')} · ${String(done)} ${t('status.done')}`)),
				snapshot.activity.length === 0
					? h('div', { className: 'sb-list-sub' }, t('overview.noActivity'))
					: h('div', { className: 'sb-list' }, activityRowsView));

			return h('div', null,
				h('div', { className: 'sb-kpis' },
					kpis.map((kpi) => h('div', { key: kpi.label, className: 'sb-kpi' },
						h('div', { className: 'sb-kpi-value', style: kpi.tone === undefined ? undefined : { color: kpi.tone } }, String(kpi.value)),
						h('div', { className: 'sb-kpi-label' }, kpi.label)))),
				h('div', { className: 'sb-grid-2wide' },
					h('div', { className: 'sb-panel' },
						h('h3', { className: 'sb-panel-title' }, t('overview.distribution')),
						h(Distribution, { snapshot, t })),
					h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } }, wipPanel, blockerPanel)),
				activityPanel);
		}

		/* ------------------------------------------------------------------ */
		/* Products                                                           */
		/* ------------------------------------------------------------------ */

		function Products({ snapshot, onNew, onImport, onEdit, onDelete, onManage, onOpenProject, t }) {
			const products = snapshot.products;
			const projects = snapshot.projects;
			const boards = snapshot.boards;
			const stories = snapshot.stories;

			if (products.length === 0) {
				return h(Empty, {
					title: t('product.empty'),
					hint: t('product.emptyHint'),
					action: h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } },
						h(Button, { variant: 'primary', icon: Icon.plus(13), onClick: onNew }, t('context.newProduct')),
						h(Button, { icon: Icon.folder(13), onClick: onImport }, t('import.button')))
				});
			}

			return h('div', null,
				h('div', { className: 'sb-toolbar' },
					h('span', { className: 'sb-toolbar-title' }, `${t('common.products')} · ${String(products.length)}`),
					h('div', { className: 'sb-spacer' }),
					h(Button, { size: 'sm', icon: Icon.folder(12), onClick: onImport }, t('import.button')),
					h(Button, { variant: 'primary', size: 'sm', icon: Icon.plus(12), onClick: onNew }, t('context.newProduct'))),
				h('div', { className: 'sb-cards' }, products.map((product) => {
					const productProjects = projects.filter((project) => project.productId === product.id);
					const projectIds = new Set(productProjects.map((project) => project.id));
					const productBoards = boards.filter((board) => projectIds.has(board.projectId));
					const productStories = stories.filter((story) => projectIds.has(story.projectId));
					const doneCount = productStories.filter((story) => story.status === 'done').length;
					return h('div', { key: product.id, className: 'sb-prod', style: { '--sb-accent': COLOR_TONE[product.color] ?? COLOR_TONE.blue } },
						h('div', { className: 'sb-prod-head' },
							h(KeyChip, null, product.key),
							h('div', { className: 'sb-prod-name' }, product.name),
							h('span', { className: 'sb-badge' }, t(`product.color.${product.color}`))),
						h('div', { className: 'sb-prod-desc' }, product.description || '—'),
						h('div', { className: 'sb-prod-code' },
							product.repoUrl
								? h('a', { className: 'sb-code-row', href: product.repoUrl, target: '_blank', rel: 'noreferrer', title: product.repoUrl },
									Icon.repo(12),
									h('span', { className: 'sb-code-text' }, repoLabel(product.repoUrl)))
								: undefined,
							product.localPath
								? h('div', { className: 'sb-code-row sb-code-path', title: product.localPath },
									Icon.folder(12),
									h('span', { className: 'sb-code-text' }, product.localPath))
								: undefined,
							!product.repoUrl && !product.localPath
								? h('div', { className: 'sb-code-empty' }, t('product.codeEmpty'))
								: undefined),
						h('div', { className: 'sb-meta-row' },
							h('span', null, `${String(productProjects.length)} ${t('common.projects')}`),
							h('span', null, `${String(productBoards.length)} ${t('common.boards')}`),
							h('span', null, `${String(productStories.length)} ${t('common.stories')}`),
							h('span', { style: { color: 'var(--dsw-alias-state-success-primary)' } }, `${String(doneCount)} ${t('status.done')}`)),
						h('div', { className: 'sb-card-actions' },
							h(Button, { size: 'sm', onClick: () => onManage(product) }, t('product.manage')),
							productProjects.length > 0
								? h(Button, {
									size: 'sm',
									onClick: () => {
										const project = productProjects[0];
										onOpenProject(project);
									}
								}, t('project.openBoard'))
								: undefined,
							h(Button, { variant: 'ghost', size: 'sm', icon: Icon.edit(12), onClick: () => onEdit(product), title: t('common.edit') }),
							h(Button, { variant: 'ghost', size: 'sm', icon: Icon.trash(12), onClick: () => onDelete(product), title: t('common.delete') })));
				})));
		}

		/* ------------------------------------------------------------------ */
		/* Projects                                                           */
		/* ------------------------------------------------------------------ */

		function Projects({ snapshot, productFilter, onProductFilter, onNew, onEdit, onDelete, onOpen, t }) {
			const projects = snapshot.projects.filter((project) => productFilter === '' || project.productId === productFilter);
			const products = snapshot.products;
			const boards = snapshot.boards;
			const stories = snapshot.stories;

			return h('div', null,
				h('div', { className: 'sb-toolbar' },
					h('span', { className: 'sb-toolbar-title' }, `${t('common.projects')} · ${String(projects.length)}`),
					products.length > 1
						? h(Select, {
							value: productFilter,
							onChange: onProductFilter,
							ariaLabel: t('context.product'),
							options: [{ value: '', label: t('project.allProducts') }, ...products.map((product) => ({ value: product.id, label: product.name }))]
						})
						: undefined,
					h('div', { className: 'sb-spacer' }),
					h(Button, { variant: 'primary', size: 'sm', icon: Icon.plus(12), onClick: onNew, disabled: products.length === 0 }, t('context.newProject'))),
				products.length === 0
					? h(Empty, { title: t('product.empty'), hint: t('product.emptyHint') })
					: projects.length === 0
						? h(Empty, {
							title: t('project.empty'),
							hint: t('project.emptyHint'),
							action: h(Button, { variant: 'primary', size: 'sm', icon: Icon.plus(12), onClick: onNew }, t('context.newProject'))
						})
						: h('div', { className: 'sb-rows' }, projects.map((project) => {
							const product = products.find((entry) => entry.id === project.productId);
							const projectBoards = boards.filter((board) => board.projectId === project.id);
							const projectStories = stories.filter((story) => story.projectId === project.id);
							const done = projectStories.filter((story) => story.status === 'done').length;
							const percent = projectStories.length === 0 ? 0 : Math.round((done / projectStories.length) * 100);
							return h('div', { key: project.id, className: 'sb-row', onClick: () => onOpen(project) },
								h(KeyChip, null, project.key),
								h('div', { className: 'sb-row-main' },
									h('div', { className: 'sb-row-title' }, h('span', { className: 'sb-row-name' }, project.name)),
									h('div', { className: 'sb-row-sub' }, product?.name ?? '—', project.objective === '' ? undefined : ` · ${project.objective}`)),
								h('div', { className: 'sb-row-meta' },
									h('span', null, plural(t, 'project.boardsCount', projectBoards.length)),
									h('span', null, plural(t, 'project.storiesCount', projectStories.length)),
									h('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
										h('div', { className: 'sb-progress', title: `${String(percent)}%` },
											h('div', { className: 'sb-progress-fill', style: { width: `${String(percent)}%` } })),
										h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, `${String(percent)}%`))),
								h('div', { style: { display: 'flex', gap: 4, flex: 'none' }, onClick: (event) => event.stopPropagation() },
									h(Button, { variant: 'ghost', size: 'sm', icon: Icon.edit(12), onClick: () => onEdit(project), title: t('common.edit') }),
									h(Button, { variant: 'ghost', size: 'sm', icon: Icon.trash(12), onClick: () => onDelete(project), title: t('common.delete') })));
						})));
		}

		/* ------------------------------------------------------------------ */
		/* Board                                                              */
		/* ------------------------------------------------------------------ */

		function BoardCard({ story, onOpen, onDragStart, onDragEnd, dragging, t }) {
			const criteria = Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : [];
			const doneCriteria = criteria.filter((criterion) => criterion.done === true).length;
			const foot = [];
			if (story.assignee !== '') {
				foot.push(h('span', { key: 'assignee', style: { display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 } },
					h(Avatar, { name: story.assignee }),
					h('span', { className: 'sb-card-metric', style: { maxWidth: 74, overflow: 'hidden', textOverflow: 'ellipsis' } }, story.assignee)));
			}
			if (story.estimate !== null && story.estimate !== undefined) {
				foot.push(h('span', { key: 'estimate', className: 'sb-card-metric' }, t('points', { n: story.estimate })));
			}
			if (criteria.length > 0) {
				foot.push(h('span', { key: 'ac', className: 'sb-card-metric', title: t('story.ac') }, Icon.check(9), `${String(doneCriteria)}/${String(criteria.length)}`));
			}
			if (story.tags.length > 0) {
				const tags = story.tags.slice(0, 2).map((tag) => h('span', { key: tag, className: 'sb-tag' }, `#${tag}`));
				if (story.tags.length > 2) tags.push(h('span', { key: 'more', className: 'sb-tag' }, `+${String(story.tags.length - 2)}`));
				foot.push(h('span', { key: 'tags', className: 'sb-card-tags' }, tags));
			}

			return h('div', {
				className: `sb-card${dragging === true ? ' sb-card-dragging' : ''}`,
				draggable: true,
				onDragStart: (event) => onDragStart(event, story),
				onDragEnd,
				onClick: () => onOpen(story),
				role: 'button',
				tabIndex: 0,
				onKeyDown: (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onOpen(story);
					}
				},
				title: story.title
			},
				h('div', { className: 'sb-card-top' },
					h(KeyChip, null, story.key),
					h(Priority, { value: story.priority }),
					story.blocked === true
						? h('span', { className: 'sb-badge sb-badge-danger', title: story.blockedReason || t('common.blocked') }, Icon.alert(10), t('common.blocked'))
						: undefined),
				h('div', { className: 'sb-card-title' }, story.title),
				story.soThat === '' ? undefined : h('div', { className: 'sb-card-value' }, story.soThat),
				foot.length === 0 ? undefined : h('div', { className: 'sb-card-foot' }, foot));
		}

		/** One column header with its live count and WIP chip. */
		function ColumnHeader({ status, count, wip, t }) {
			return h('div', { className: 'sb-col-head', title: t(`status.${status.id}.hint`) },
				h('span', { className: 'sb-dot', style: { background: STATUS_TONE[status.id] } }),
				h('span', { className: 'sb-col-title' }, statusLabel(t, status.id)),
				h('span', { className: 'sb-col-count' }, String(count)),
				wip.limit === null || wip.limit === undefined
					? undefined
					: h('span', {
						className: `sb-wip${wip.exceeded === true ? ' sb-wip-over' : ''}`,
						title: wip.exceeded === true ? t('board.wipOver') : undefined
					}, `${String(wip.count)}/${String(wip.limit)}`));
		}

		/** One drop target cell holding its cards. */
		function BoardCell({ status, laneKey, stories, filtersActive, dragId, overCell, setOverCell, dropOn, onOpenStory, onDragStart, onDragEnd, t }) {
			const cellKey = `${laneKey}:${status.id}`;
			const isOver = overCell === cellKey;
			const cards = stories.map((story) => h('div', {
				key: story.id,
				onDragOver: (event) => {
					event.preventDefault();
					event.stopPropagation();
					event.dataTransfer.dropEffect = 'move';
					setOverCell(cellKey);
				},
				onDrop: (event) => {
					event.preventDefault();
					event.stopPropagation();
					dropOn(status.id, story.id);
				}
			}, h(BoardCard, {
				story,
				onOpen: onOpenStory,
				onDragStart,
				onDragEnd,
				dragging: dragId === story.id,
				t
			})));

			return h('div', {
				className: `sb-cell${isOver === true ? ' sb-cell-over' : ''}`,
				onDragOver: (event) => {
					event.preventDefault();
					event.dataTransfer.dropEffect = 'move';
					setOverCell(cellKey);
				},
				onDragLeave: (event) => {
					const related = event.relatedTarget;
					if (related instanceof Node !== true || event.currentTarget.contains(related) !== true) setOverCell(null);
				},
				onDrop: (event) => {
					event.preventDefault();
					dropOn(status.id);
				}
			},
				stories.length === 0
					? h('div', { className: 'sb-cell-empty' }, filtersActive === true ? t('board.noMatch') : t('board.dropHere'))
					: cards);
		}

		/** One swimlane: optional band plus five status cells. */
		function BoardLane({ lane, groupBy, statuses, board, filtered, filtersActive, dragId, overCell, setOverCell, dropOn, onOpenStory, onDragStart, onDragEnd, t }) {
			const cells = statuses.map((status) => {
				const stories = sortStories(lane.stories.filter((story) => story.status === status.id));
				return h(BoardCell, {
					key: `${lane.key}:${status.id}`,
					status,
					laneKey: lane.key,
					stories,
					filtersActive,
					dragId,
					overCell,
					setOverCell,
					dropOn,
					onOpenStory,
					onDragStart,
					onDragEnd,
					t
				});
			});
			const band = groupBy === 'none'
				? undefined
				: h('div', { className: 'sb-lane-band' },
					h('span', null, lane.label),
					h('span', { className: 'sb-lane-count' }, t('board.column', { n: lane.stories.length })));
			void board;
			void filtered;
			return h(React.Fragment, null, band, cells);
		}

		function BoardView({ snapshot, context, onMove, onNewStory, onEditBoard, onOpenStory, busy, t }) {
			const [query, setQuery] = useState('');
			const [assignee, setAssignee] = useState('');
			const [priority, setPriority] = useState('');
			const [epic, setEpic] = useState('');
			const [groupBy, setGroupBy] = useState('none');
			const [dragId, setDragId] = useState(null);
			const [overCell, setOverCell] = useState(null);
			const dragRef = useRef(null);

			const board = context.board ?? null;
			const statuses = snapshot.meta.statuses;
			const boardStories = useMemo(() => board === null ? [] : snapshot.stories.filter((story) => story.boardId === board.id), [snapshot, board]);

			const assignees = useMemo(() => [...new Set(boardStories.map((story) => story.assignee).filter((name) => name !== ''))].sort(), [boardStories]);
			const epics = useMemo(() => [...new Set(boardStories.map((story) => story.epic).filter((name) => name !== ''))].sort(), [boardStories]);

			const filtered = useMemo(() => {
				const needle = query.trim().toLowerCase();
				return boardStories.filter((story) => {
					if (assignee !== '' && story.assignee !== assignee) return false;
					if (priority !== '' && story.priority !== priority) return false;
					if (epic !== '' && story.epic !== epic) return false;
					if (needle !== '') {
						const haystack = `${story.key} ${story.title} ${story.asA} ${story.iWant} ${story.soThat} ${story.tags.join(' ')} ${story.epic}`.toLowerCase();
						if (haystack.includes(needle) !== true) return false;
					}
					return true;
				});
			}, [boardStories, query, assignee, priority, epic]);

			const lanes = useMemo(() => {
				if (groupBy === 'none') return [{ key: 'all', label: '', stories: filtered }];
				const bucketOf = (story) => {
					if (groupBy === 'epic') return story.epic === '' ? t('common.uncategorized') : story.epic;
					if (groupBy === 'priority') return story.priority;
					return story.assignee === '' ? t('common.unassigned') : story.assignee;
				};
				const grouped = new Map();
				for (const story of filtered) {
					const key = bucketOf(story);
					const bucket = grouped.get(key) ?? [];
					bucket.push(story);
					grouped.set(key, bucket);
				}
				const entries = [...grouped.entries()];
				if (groupBy === 'priority') {
					entries.sort((left, right) => {
						const leftRank = PRIORITY_ORDER.indexOf(left[0]);
						const rightRank = PRIORITY_ORDER.indexOf(right[0]);
						return (leftRank === -1 ? 9 : leftRank) - (rightRank === -1 ? 9 : rightRank);
					});
				} else {
					entries.sort((left, right) => left[0].localeCompare(right[0]));
				}
				return entries.map(([key, stories]) => ({ key, label: key, stories }));
			}, [filtered, groupBy, t]);

			if (board === null) {
				return h(Empty, {
					title: t('board.empty'),
					hint: t('board.emptyHint'),
					action: h(Button, { variant: 'primary', size: 'sm', icon: Icon.plus(12), onClick: onEditBoard }, t('context.newBoard'))
				});
			}

			const doneCount = boardStories.filter((story) => story.status === 'done').length;
			const total = boardStories.length;
			const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);
			const filtersActive = query !== '' || assignee !== '' || priority !== '' || epic !== '';

			const onDragStart = (event, story) => {
				dragRef.current = story.id;
				setDragId(story.id);
				event.dataTransfer.effectAllowed = 'move';
				try {
					event.dataTransfer.setData('text/plain', story.id);
				} catch {
					// Synthetic events may not expose a DataTransfer.
				}
			};
			const onDragEnd = () => {
				dragRef.current = null;
				setDragId(null);
				setOverCell(null);
			};
			const dropOn = (status, beforeId) => {
				const id = dragRef.current;
				onDragEnd();
				if (typeof id !== 'string' || id === '') return;
				void onMove(id, status, beforeId);
			};

			const headers = statuses.map((status) => h(ColumnHeader, {
				key: `head:${status.id}`,
				status,
				count: filtered.filter((story) => story.status === status.id).length,
				wip: effectiveWip(board, status, boardStories),
				t
			}));

			const laneViews = lanes.map((lane) => h(BoardLane, {
				key: `lane:${lane.key}`,
				lane,
				groupBy,
				statuses,
				board,
				filtered,
				filtersActive,
				dragId,
				overCell,
				setOverCell,
				dropOn,
				onOpenStory,
				onDragStart,
				onDragEnd,
				t
			}));

			return h('div', { className: 'sb-board-wrap' },
				h('div', { className: 'sb-board-bar' },
					h('div', { className: 'sb-board-heading' },
						h('h2', { className: 'sb-board-name' }, h('span', null, board.name)),
						h('div', { className: 'sb-board-goal' }, board.goal || '—'),
						h('div', { className: 'sb-board-meta' },
							board.startDate === '' && board.endDate === '' ? undefined : h('span', null, `${formatDate(board.startDate)} – ${formatDate(board.endDate)}`),
							h('span', null, t('board.progress', { done: doneCount, total })),
							h('div', { className: 'sb-progress', title: `${String(percent)}%` }, h('div', { className: 'sb-progress-fill', style: { width: `${String(percent)}%` } })))),
					h('div', { style: { display: 'flex', gap: 6, flex: 'none' } },
						h(Button, { size: 'sm', icon: Icon.edit(12), onClick: onEditBoard }, t('board.edit')),
						h(Button, { variant: 'primary', size: 'sm', icon: Icon.plus(12), onClick: onNewStory, disabled: busy === true }, t('board.newStory')))),
				h('div', { className: 'sb-filters' },
					h('div', { className: 'sb-search' }, Icon.search(13), h('input', {
						type: 'search',
						value: query,
						placeholder: t('board.filter.search'),
						onChange: (event) => setQuery(event.target.value),
						'aria-label': t('board.filter.search')
					})),
					assignees.length === 0 ? undefined : h(Select, {
						value: assignee,
						onChange: setAssignee,
						ariaLabel: t('board.filter.assignee'),
						options: [{ value: '', label: `${t('board.filter.assignee')}: ${t('common.all')}` }, ...assignees.map((name) => ({ value: name, label: name }))]
					}),
					h(Select, {
						value: priority,
						onChange: setPriority,
						ariaLabel: t('board.filter.priority'),
						options: [{ value: '', label: `${t('board.filter.priority')}: ${t('common.all')}` }, ...PRIORITY_ORDER.map((value) => ({ value, label: value }))]
					}),
					epics.length === 0 ? undefined : h(Select, {
						value: epic,
						onChange: setEpic,
						ariaLabel: t('board.filter.epic'),
						options: [{ value: '', label: `${t('board.filter.epic')}: ${t('common.all')}` }, ...epics.map((name) => ({ value: name, label: name }))]
					}),
					h('div', { className: 'sb-spacer' }),
					filtersActive === true
						? h(Button, {
							variant: 'ghost',
							size: 'sm',
							onClick: () => {
								setQuery('');
								setAssignee('');
								setPriority('');
								setEpic('');
							}
						}, t('board.filter.clear'))
						: undefined,
					h(Select, {
						value: groupBy,
						onChange: setGroupBy,
						ariaLabel: t('board.group.none'),
						options: [
							{ value: 'none', label: t('board.group.none') },
							{ value: 'epic', label: t('board.group.epic') },
							{ value: 'priority', label: t('board.group.priority') },
							{ value: 'assignee', label: t('board.group.assignee') }
						]
					})),
				h('div', { className: 'sb-lanes' },
					h('div', { className: 'sb-grid' }, headers, laneViews)));
		}

		/* ------------------------------------------------------------------ */
		/* Stories table                                                      */
		/* ------------------------------------------------------------------ */

		function StoriesTable({ snapshot, context, boardFilter, onBoardFilter, onNewStory, onOpenStory, onMove, busy, t }) {
			const [query, setQuery] = useState('');
			const [status, setStatus] = useState('');
			const [priority, setPriority] = useState('');
			const [assignee, setAssignee] = useState('');

			const project = context.project;
			const projectStories = useMemo(() => snapshot.stories.filter((story) => story.projectId === project?.id), [snapshot, project]);

			const assignees = useMemo(() => [...new Set(projectStories.map((story) => story.assignee).filter((name) => name !== ''))].sort(), [projectStories]);

			const rows = useMemo(() => {
				const needle = query.trim().toLowerCase();
				return sortStories(projectStories.filter((story) => {
					if (boardFilter === 'backlog' && story.boardId !== null) return false;
					if (boardFilter !== '' && boardFilter !== 'backlog' && story.boardId !== boardFilter) return false;
					if (status !== '' && story.status !== status) return false;
					if (priority !== '' && story.priority !== priority) return false;
					if (assignee !== '' && story.assignee !== assignee) return false;
					if (needle !== '' && `${story.key} ${story.title} ${story.tags.join(' ')} ${story.epic}`.toLowerCase().includes(needle) !== true) return false;
					return true;
				}));
			}, [projectStories, boardFilter, status, priority, assignee, query]);

			if (project === undefined) {
				return h(Empty, { title: t('project.empty'), hint: t('project.emptyHint') });
			}

			const boardOptions = [
				{ value: '', label: t('stories.allBoards') },
				{ value: 'backlog', label: t('stories.backlogOnly') },
				...context.projectBoards.map((board) => ({ value: board.id, label: board.name }))
			];

			return h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 22px 0' } },
				h('div', { className: 'sb-toolbar' },
					h('span', { className: 'sb-toolbar-title' }, t('stories.count', { n: rows.length })),
					h('div', { className: 'sb-search' }, Icon.search(13), h('input', {
						type: 'search',
						value: query,
						placeholder: t('stories.search'),
						onChange: (event) => setQuery(event.target.value),
						'aria-label': t('stories.search')
					})),
					h(Select, {
						value: boardFilter,
						onChange: onBoardFilter,
						ariaLabel: t('stories.board'),
						options: boardOptions
					}),
					h(Select, {
						value: status,
						onChange: setStatus,
						ariaLabel: t('stories.status'),
						options: [{ value: '', label: `${t('stories.status')}: ${t('common.all')}` }, ...snapshot.meta.statuses.map((entry) => ({ value: entry.id, label: statusLabel(t, entry.id) }))]
					}),
					h(Select, {
						value: priority,
						onChange: setPriority,
						ariaLabel: t('stories.priority'),
						options: [{ value: '', label: `${t('stories.priority')}: ${t('common.all')}` }, ...PRIORITY_ORDER.map((value) => ({ value, label: value }))]
					}),
					assignees.length === 0 ? undefined : h(Select, {
						value: assignee,
						onChange: setAssignee,
						ariaLabel: t('stories.assignee'),
						options: [{ value: '', label: `${t('stories.assignee')}: ${t('common.all')}` }, ...assignees.map((name) => ({ value: name, label: name }))]
					}),
					h('div', { className: 'sb-spacer' }),
					h(Button, { variant: 'primary', size: 'sm', icon: Icon.plus(12), onClick: onNewStory, disabled: busy === true }, t('stories.newTitle'))),
				rows.length === 0
					? h(Empty, {
						title: t('stories.empty'),
						hint: t('stories.emptyHint'),
						action: h(Button, { variant: 'primary', size: 'sm', icon: Icon.plus(12), onClick: onNewStory }, t('stories.newTitle'))
					})
					: h('div', { className: 'sb-table-wrap' },
						h('table', { className: 'sb-table' },
							h('thead', null, h('tr', null,
								h('th', { className: 'sb-th' }, t('stories.key')),
								h('th', { className: 'sb-th' }, t('stories.title')),
								h('th', { className: 'sb-th' }, t('stories.status')),
								h('th', { className: 'sb-th' }, t('stories.priority')),
								h('th', { className: 'sb-th' }, t('stories.estimate')),
								h('th', { className: 'sb-th' }, t('stories.assignee')),
								h('th', { className: 'sb-th' }, t('stories.epic')),
								h('th', { className: 'sb-th' }, t('stories.updated')))),
							h('tbody', null, rows.map((story) => h('tr', { key: story.id, className: 'sb-tr', onClick: () => onOpenStory(story) },
								h('td', { className: 'sb-td' }, h(KeyChip, null, story.key)),
								h('td', { className: 'sb-td sb-story-cell' },
									h('div', { className: 'sb-story-cell-title' }, story.title),
									story.soThat === '' ? undefined : h('div', { className: 'sb-story-cell-value' }, story.soThat)),
								h('td', { className: 'sb-td', onClick: (event) => event.stopPropagation() },
									h('select', {
										className: 'sb-mini-select',
										value: story.status,
										onChange: (event) => {
											event.stopPropagation();
											void onMove(story.id, event.target.value);
										},
										'aria-label': t('story.status')
									}, snapshot.meta.statuses.map((entry) => h('option', { key: entry.id, value: entry.id }, statusLabel(t, entry.id))))),
								h('td', { className: 'sb-td' }, h(Priority, { value: story.priority })),
								h('td', { className: 'sb-td' }, story.estimate === null ? '—' : String(story.estimate)),
								h('td', { className: 'sb-td' }, story.assignee === '' ? '—' : h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 5 } }, h(Avatar, { name: story.assignee }), story.assignee)),
								h('td', { className: 'sb-td' }, story.epic === '' ? '—' : story.epic),
								h('td', { className: 'sb-td', style: { color: 'var(--dsw-alias-label-tertiary)', whiteSpace: 'nowrap' } }, relTime(t, story.updatedAt))))))));
		}

		/* ------------------------------------------------------------------ */
		/* Dialogs: product / project / board                                 */
		/* ------------------------------------------------------------------ */

		function ProductDialog({ product, onClose, onSubmit, busy, t }) {
			const [name, setName] = useState(product?.name ?? '');
			const [key, setKey] = useState(product?.key ?? '');
			const [description, setDescription] = useState(product?.description ?? '');
			const [color, setColor] = useState(product?.color ?? 'blue');
			const [repoUrl, setRepoUrl] = useState(product?.repoUrl ?? '');
			const [localPath, setLocalPath] = useState(product?.localPath ?? '');
			const [picking, setPicking] = useState(false);
			const [pickError, setPickError] = useState('');
			const valid = name.trim() !== '';

			/** Delegate folder picking to the Host's native OS chooser. */
			const choosePath = async () => {
				if (picking === true) return;
				setPicking(true);
				setPickError('');
				try {
					const value = await api.pickDirectory();
					if (typeof value?.path === 'string' && value.path !== '') setLocalPath(value.path);
				} catch (cause) {
					setPickError(cause?.code === 'native_picker_unavailable' ? t('product.pickerUnavailable') : String(cause?.message ?? cause));
				} finally {
					setPicking(false);
				}
			};

			const submit = () => {
				if (valid !== true || busy === true) return;
				void onSubmit({
					name: name.trim(),
					key: key.trim(),
					description: description.trim(),
					color,
					repoUrl: repoUrl.trim(),
					localPath: localPath.trim()
				});
			};
			return h(Modal, {
				title: product === undefined ? t('product.newTitle') : t('product.editTitle'),
				onClose,
				footer: h(React.Fragment, null,
					h(Button, { onClick: onClose }, t('common.cancel')),
					h(Button, { variant: 'primary', onClick: submit, disabled: valid !== true || busy === true }, busy === true ? t('common.saving') : t('common.save')))
			},
				h('div', { className: 'sb-form' },
					h(Field, { label: t('product.name'), required: true },
						h('input', { className: 'sb-input', value: name, autoFocus: true, placeholder: t('product.namePlaceholder'), onChange: (event) => setName(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') submit(); } })),
					h('div', { className: 'sb-grid-2' },
						h(Field, { label: t('product.key'), hint: t('product.keyHint') },
							h('input', { className: 'sb-input', value: key, placeholder: 'DIDI', onChange: (event) => setKey(event.target.value.toUpperCase()) })),
						h(Field, { label: t('product.color') },
							h('select', { className: 'sb-input', value: color, onChange: (event) => setColor(event.target.value) },
								['blue', 'green', 'amber', 'red', 'slate'].map((value) => h('option', { key: value, value }, t(`product.color.${value}`)))))),
					h(Field, { label: t('product.description') },
						h('textarea', { className: 'sb-textarea', value: description, placeholder: t('product.descriptionPlaceholder'), onChange: (event) => setDescription(event.target.value) })),
					h('div', { className: 'sb-form-section' },
						h('div', { className: 'sb-form-section-head' },
							h('span', { className: 'sb-form-section-title' }, t('product.codeSection'))),
						h(Field, { label: t('product.repo'), hint: t('product.repoHint') },
							h('input', {
								className: 'sb-input',
								value: repoUrl,
								placeholder: t('product.repoPlaceholder'),
								onChange: (event) => setRepoUrl(event.target.value)
							})),
						h('div', { className: 'sb-field' },
							h('span', { className: 'sb-field-label' }, t('product.localPath')),
							h('div', { className: 'sb-input-row' },
								h('input', {
									className: 'sb-input',
									value: localPath,
									placeholder: t('product.localPathPlaceholder'),
									onChange: (event) => setLocalPath(event.target.value),
									onKeyDown: (event) => { if (event.key === 'Enter') event.preventDefault(); }
								}),
								h(Button, {
									size: 'sm',
									className: 'sb-btn-field',
									onClick: () => { void choosePath(); },
									disabled: picking === true
								}, picking === true ? t('product.choosing') : t('product.choosePath'))),
							h('span', { className: 'sb-field-hint' }, t('product.localPathHint')),
							pickError === '' ? undefined : h('span', { className: 'sb-field-error' }, pickError)))));
		}

		/**
		 * Import a product from an existing local project: pick a checkout, compose
		 * a reverse-engineering prompt, then run it in DSH (or copy it for a manual
		 * paste). The prompt is produced by the Host `compose-import` route so the
		 * path is validated and the text stays authoritative and testable.
		 */
		function ImportProductDialog({ onClose, onDone, notify, t }) {
			const [localPath, setLocalPath] = useState('');
			const [productName, setProductName] = useState('');
			const [productKey, setProductKey] = useState('');
			const [repoUrl, setRepoUrl] = useState('');
			const [focus, setFocus] = useState('');
			const [language, setLanguage] = useState('zh');
			const [prompt, setPrompt] = useState('');
			const [picking, setPicking] = useState(false);
			const [pickError, setPickError] = useState('');
			const [composing, setComposing] = useState(false);
			const [running, setRunning] = useState(false);
			const [error, setError] = useState('');

			const choosePath = async () => {
				if (picking === true) return;
				setPicking(true);
				setPickError('');
				try {
					const value = await api.pickDirectory();
					if (typeof value?.path === 'string' && value.path !== '') setLocalPath(value.path);
				} catch (cause) {
					setPickError(cause?.code === 'native_picker_unavailable' ? t('product.pickerUnavailable') : String(cause?.message ?? cause));
				} finally {
					setPicking(false);
				}
			};

			const compose = async () => {
				if (localPath.trim() === '') {
					setError(t('import.needPath'));
					return;
				}
				setComposing(true);
				setError('');
				try {
					const value = await api.composeImport({
						path: localPath.trim(),
						productName: productName.trim(),
						productKey: productKey.trim(),
						repoUrl: repoUrl.trim(),
						focus: focus.trim(),
						language
					});
					setPrompt(value.prompt);
					if (productName.trim() === '') setProductName(value.productName ?? '');
					if (productKey.trim() === '') setProductKey(value.productKey ?? '');
				} catch (cause) {
					setError(String(cause?.message ?? cause));
				} finally {
					setComposing(false);
				}
			};

			const copyPrompt = async () => {
				try {
					await navigator.clipboard.writeText(prompt);
					notify(t('import.copied'));
				} catch (cause) {
					setError(String(cause?.message ?? cause));
				}
			};

			const run = async () => {
				if (prompt.trim() === '' || running === true) return;
				setRunning(true);
				setError('');
				try {
					if (dsh === null) throw new Error('uiWorkspace_unavailable');
					const opened = await dsh.fillConversation(prompt);
					if (opened !== true) throw new Error('uiWorkspace_unavailable');
					notify(t('import.runDone'));
					onDone?.();
				} catch {
					// Auto-fill is a convenience; degrade to copy + open a blank
					// conversation so the flow still finishes without the service.
					let copied = false;
					try {
						await navigator.clipboard.writeText(prompt);
						copied = true;
					} catch { /* clipboard blocked */ }
					if (dsh !== null) await dsh.openBlankConversation();
					notify(copied === true ? t('import.runFallback') : t('import.copied'), 'warn');
					onDone?.();
				} finally {
					setRunning(false);
				}
			};

			return h(Modal, {
				title: t('import.title'),
				subtitle: t('import.desc'),
				onClose,
				wide: true,
				footer: h(React.Fragment, null,
					h(Button, { onClick: onClose }, t('common.cancel')),
					h(Button, { onClick: () => { void copyPrompt(); }, disabled: prompt.trim() === '' }, t('import.copy')),
					h(Button, {
						variant: 'primary',
						icon: Icon.right(12),
						onClick: () => { void run(); },
						disabled: prompt.trim() === '' || running === true
					}, running === true ? t('import.running') : t('import.run')))
			},
				h('div', { className: 'sb-form' },
					h('div', { className: 'sb-form-section' },
						h('div', { className: 'sb-form-section-head' },
							h('span', { className: 'sb-form-section-title' }, t('import.step1'))),
						h('div', { className: 'sb-field' },
							h('span', { className: 'sb-field-label' }, t('import.path')),
							h('div', { className: 'sb-input-row' },
								h('input', {
									className: 'sb-input',
									value: localPath,
									placeholder: t('product.localPathPlaceholder'),
									onChange: (event) => setLocalPath(event.target.value)
								}),
								h(Button, {
									size: 'sm',
									className: 'sb-btn-field',
									icon: Icon.folder(12),
									onClick: () => { void choosePath(); },
									disabled: picking === true
								}, picking === true ? t('product.choosing') : t('product.choosePath'))),
							h('span', { className: 'sb-field-hint' }, t('import.pathHint')),
							pickError === '' ? undefined : h('span', { className: 'sb-field-error' }, pickError))),
					h('div', { className: 'sb-grid-2' },
						h(Field, { label: t('import.name') },
							h('input', { className: 'sb-input', value: productName, placeholder: t('product.namePlaceholder'), onChange: (event) => setProductName(event.target.value) })),
						h(Field, { label: t('import.key'), hint: t('product.keyHint') },
							h('input', { className: 'sb-input', value: productKey, placeholder: 'DIDI', onChange: (event) => setProductKey(event.target.value.toUpperCase()) }))),
					h(Field, { label: t('import.repo') },
						h('input', { className: 'sb-input', value: repoUrl, placeholder: t('product.repoPlaceholder'), onChange: (event) => setRepoUrl(event.target.value) })),
					h('div', { className: 'sb-grid-2' },
						h(Field, { label: t('import.focus') },
							h('input', { className: 'sb-input', value: focus, placeholder: t('import.focusPlaceholder'), onChange: (event) => setFocus(event.target.value) })),
						h(Field, { label: t('import.language') },
							h('select', { className: 'sb-input', value: language, onChange: (event) => setLanguage(event.target.value) },
								h('option', { value: 'zh' }, t('import.language.zh')),
								h('option', { value: 'en' }, t('import.language.en'))))),
					h(Button, {
						variant: 'primary',
						size: 'sm',
						icon: Icon.refresh(12),
						onClick: () => { void compose(); },
						disabled: composing === true || localPath.trim() === ''
					}, composing === true ? t('import.composing') : t('import.compose')),
					h('div', { className: 'sb-form-section' },
						h('div', { className: 'sb-form-section-head' },
							h('span', { className: 'sb-form-section-title' }, t('import.step2'))),
						h(Field, { label: t('import.promptLabel'), hint: t('import.promptHint') },
							h('textarea', {
								className: 'sb-textarea sb-import-prompt',
								value: prompt,
								placeholder: t('import.compose'),
								rows: 12,
								onChange: (event) => setPrompt(event.target.value)
							}))),
					error === '' ? undefined : h('div', { className: 'sb-field-error' }, error)));
		}

		function ProjectDialog({ project, products, defaultProductId, onClose, onSubmit, busy, t }) {
			const [productId, setProductId] = useState(project?.productId ?? defaultProductId ?? products[0]?.id ?? '');
			const [name, setName] = useState(project?.name ?? '');
			const [key, setKey] = useState(project?.key ?? '');
			const [objective, setObjective] = useState(project?.objective ?? '');
			const [description, setDescription] = useState(project?.description ?? '');
			const [startDate, setStartDate] = useState(project?.startDate ?? '');
			const [endDate, setEndDate] = useState(project?.endDate ?? '');
			const valid = name.trim() !== '' && productId !== '';
			const submit = () => {
				if (valid !== true || busy === true) return;
				void onSubmit({ productId, name: name.trim(), key: key.trim(), objective: objective.trim(), description: description.trim(), startDate, endDate });
			};
			return h(Modal, {
				title: project === undefined ? t('project.newTitle') : t('project.editTitle'),
				onClose,
				wide: true,
				footer: h(React.Fragment, null,
					h(Button, { onClick: onClose }, t('common.cancel')),
					h(Button, { variant: 'primary', onClick: submit, disabled: valid !== true || busy === true }, busy === true ? t('common.saving') : t('common.save')))
			},
				h('div', { className: 'sb-form' },
					h('div', { className: 'sb-grid-2' },
						h(Field, { label: t('project.product'), required: true },
							h('select', { className: 'sb-input', value: productId, onChange: (event) => setProductId(event.target.value) },
								products.map((product) => h('option', { key: product.id, value: product.id }, product.name)))),
						h(Field, { label: t('project.key') },
							h('input', { className: 'sb-input', value: key, placeholder: 'JC-Q4', onChange: (event) => setKey(event.target.value.toUpperCase()) }))),
					h(Field, { label: t('project.name'), required: true },
						h('input', { className: 'sb-input', value: name, autoFocus: true, placeholder: t('project.namePlaceholder'), onChange: (event) => setName(event.target.value) })),
					h(Field, { label: t('project.objective') },
						h('textarea', { className: 'sb-textarea', value: objective, placeholder: t('project.objectivePlaceholder'), onChange: (event) => setObjective(event.target.value) })),
					h(Field, { label: t('project.description') },
						h('textarea', { className: 'sb-textarea', value: description, onChange: (event) => setDescription(event.target.value) })),
					h('div', { className: 'sb-grid-2' },
						h(Field, { label: t('project.start') }, h('input', { className: 'sb-input', type: 'date', value: startDate, onChange: (event) => setStartDate(event.target.value) })),
						h(Field, { label: t('project.end') }, h('input', { className: 'sb-input', type: 'date', value: endDate, onChange: (event) => setEndDate(event.target.value) })))));
		}

		function BoardDialog({ board, project, onClose, onSubmit, busy, t }) {
			const [name, setName] = useState(board?.name ?? '');
			const [goal, setGoal] = useState(board?.goal ?? '');
			const [startDate, setStartDate] = useState(board?.startDate ?? '');
			const [endDate, setEndDate] = useState(board?.endDate ?? '');
			const [wipProgress, setWipProgress] = useState(String(board?.wip?.in_progress ?? 3));
			const [wipVerify, setWipVerify] = useState(String(board?.wip?.verify ?? 5));
			const valid = name.trim() !== '' && project !== undefined;
			const submit = () => {
				if (valid !== true || busy === true) return;
				void onSubmit({
					name: name.trim(),
					goal: goal.trim(),
					startDate,
					endDate,
					wip: {
						in_progress: Number.parseInt(wipProgress, 10),
						verify: Number.parseInt(wipVerify, 10)
					}
				});
			};
			return h(Modal, {
				title: board === undefined ? t('board.newTitle') : t('board.editTitle'),
				subtitle: project?.name,
				onClose,
				footer: h(React.Fragment, null,
					h(Button, { onClick: onClose }, t('common.cancel')),
					h(Button, { variant: 'primary', onClick: submit, disabled: valid !== true || busy === true }, busy === true ? t('common.saving') : t('common.save')))
			},
				h('div', { className: 'sb-form' },
					h(Field, { label: t('board.name'), required: true },
						h('input', { className: 'sb-input', value: name, autoFocus: true, placeholder: t('board.namePlaceholder'), onChange: (event) => setName(event.target.value) })),
					h(Field, { label: t('board.goal') },
						h('textarea', { className: 'sb-textarea', value: goal, placeholder: t('board.goalPlaceholder'), onChange: (event) => setGoal(event.target.value) })),
					h('div', { className: 'sb-grid-2' },
						h(Field, { label: t('board.start') }, h('input', { className: 'sb-input', type: 'date', value: startDate, onChange: (event) => setStartDate(event.target.value) })),
						h(Field, { label: t('board.end') }, h('input', { className: 'sb-input', type: 'date', value: endDate, onChange: (event) => setEndDate(event.target.value) }))),
					h('div', { className: 'sb-form-section' },
						h('div', { className: 'sb-form-section-head' }, h('span', { className: 'sb-form-section-title' }, t('board.wip'))),
						h('div', { className: 'sb-grid-2' },
							h(Field, { label: statusLabel(t, 'in_progress') }, h('input', { className: 'sb-input', type: 'number', min: 0, max: 20, value: wipProgress, onChange: (event) => setWipProgress(event.target.value) })),
							h(Field, { label: statusLabel(t, 'verify') }, h('input', { className: 'sb-input', type: 'number', min: 0, max: 20, value: wipVerify, onChange: (event) => setWipVerify(event.target.value) }))),
						h('div', { className: 'sb-field-hint' }, t('board.wipHint')))));
		}

		/* ------------------------------------------------------------------ */
		/* Story drawer                                                       */
		/* ------------------------------------------------------------------ */

		function StoryDrawer({ mode, story, context, snapshot, onClose, onSave, onDelete, busy, t }) {
			const [title, setTitle] = useState(story?.title ?? '');
			const [asA, setAsA] = useState(story?.asA ?? '');
			const [iWant, setIWant] = useState(story?.iWant ?? '');
			const [soThat, setSoThat] = useState(story?.soThat ?? '');
			const [criteria, setCriteria] = useState(() => (story?.acceptanceCriteria ?? []).map((entry) => ({ id: entry.id, text: entry.text, done: entry.done === true })));
			const [priority, setPriority] = useState(story?.priority ?? 'P2');
			const [estimate, setEstimate] = useState(story?.estimate === null || story?.estimate === undefined ? '' : String(story.estimate));
			const [assignee, setAssignee] = useState(story?.assignee ?? '');
			const [epic, setEpic] = useState(story?.epic ?? '');
			const [tags, setTags] = useState((story?.tags ?? []).join(', '));
			const [status, setStatus] = useState(story?.status ?? (context.board === undefined ? 'backlog' : 'todo'));
			const [boardId, setBoardId] = useState(story?.boardId ?? context.board?.id ?? '');
			const [blocked, setBlocked] = useState(story?.blocked === true);
			const [blockedReason, setBlockedReason] = useState(story?.blockedReason ?? '');
			const [pendingDelete, setPendingDelete] = useState(false);

			const valid = title.trim() !== '';
			const boardOptions = [
				{ value: '', label: t('story.boardBacklog') },
				...context.projectBoards.map((board) => ({ value: board.id, label: board.name }))
			];

			const save = () => {
				if (valid !== true || busy === true) return;
				void onSave({
					title: title.trim(),
					asA: asA.trim(),
					iWant: iWant.trim(),
					soThat: soThat.trim(),
					acceptanceCriteria: criteria.filter((entry) => entry.text.trim() !== '').map((entry) => ({ id: entry.id, text: entry.text.trim(), done: entry.done === true })),
					priority,
					estimate: estimate === '' ? null : Number(estimate),
					assignee: assignee.trim(),
					epic: epic.trim(),
					tags: tags.split(/[,，、]/).map((tag) => tag.trim()).filter((tag) => tag !== ''),
					status,
					boardId: boardId === '' ? null : boardId,
					blocked,
					blockedReason: blockedReason.trim()
				});
			};

			const footer = pendingDelete === true
				? h(React.Fragment, null,
					h('span', { style: { flex: 1, fontSize: 11.5, lineHeight: 1.5, color: 'var(--dsw-alias-state-error-primary)' } }, t('story.deleteMessage', { key: story?.key, title: story?.title })),
					h(Button, { variant: 'ghost', onClick: () => setPendingDelete(false) }, t('common.cancel')),
					h(Button, { variant: 'danger', onClick: () => { if (busy !== true) void onDelete(); } }, t('delete.confirm')))
				: h(React.Fragment, null,
					mode === 'new' ? undefined : h(Button, { variant: 'ghost', icon: Icon.trash(12), onClick: () => setPendingDelete(true) }, t('common.delete')),
					h('div', { className: 'sb-spacer' }),
					h(Button, { onClick: onClose }, t('common.cancel')),
					h(Button, { variant: 'primary', onClick: save, disabled: valid !== true || busy === true }, busy === true ? t('common.saving') : t('common.save')));

			return h(Drawer, {
				title: mode === 'new' ? t('story.newTitle') : `${story?.key ?? ''} · ${t('story.editTitle')}`,
				subtitle: context.project?.name,
				onClose,
				footer
			},
				h('div', { className: 'sb-form' },
					h(Field, { label: t('story.title'), required: true },
						h('input', { className: 'sb-input', value: title, autoFocus: true, placeholder: t('story.titlePlaceholder'), onChange: (event) => setTitle(event.target.value) })),
					h('div', { className: 'sb-form-section' },
						h('div', { className: 'sb-form-section-head' }, h('span', { className: 'sb-form-section-title' }, t('story.connextra'))),
						h(Field, { label: t('story.asA') }, h('input', { className: 'sb-input', value: asA, placeholder: t('story.asAPlaceholder'), onChange: (event) => setAsA(event.target.value) })),
						h(Field, { label: t('story.iWant') }, h('textarea', { className: 'sb-textarea', value: iWant, placeholder: t('story.iWantPlaceholder'), onChange: (event) => setIWant(event.target.value) })),
						h(Field, { label: t('story.soThat') }, h('textarea', { className: 'sb-textarea', value: soThat, placeholder: t('story.soThatPlaceholder'), onChange: (event) => setSoThat(event.target.value) }))),
					h('div', { className: 'sb-form-section' },
						h('div', { className: 'sb-form-section-head' },
							h('span', { className: 'sb-form-section-title' }, t('story.ac')),
							h(Button, {
								variant: 'ghost',
								size: 'sm',
								icon: Icon.plus(11),
								onClick: () => setCriteria((current) => [...current, { id: `draft_${String(Date.now())}_${String(current.length)}`, text: '', done: false }])
							}, t('common.add'))),
						h('div', { className: 'sb-field-hint' }, t('story.acHint')),
						h('div', { className: 'sb-ac-list' },
							criteria.length === 0
								? h('div', { className: 'sb-field-hint' }, t('story.noAc'))
								: criteria.map((criterion, index) => h('div', { key: criterion.id, className: 'sb-ac-row' },
									h('label', { className: 'sb-check' },
										h('input', {
											type: 'checkbox',
											checked: criterion.done === true,
											onChange: (event) => setCriteria((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, done: event.target.checked } : entry))
										})),
									h('input', {
										className: 'sb-input',
										value: criterion.text,
										placeholder: t('story.acPlaceholder'),
										onChange: (event) => setCriteria((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, text: event.target.value } : entry))
									}),
									h(Button, {
										variant: 'ghost',
										size: 'sm',
										icon: Icon.close(11),
										title: t('common.delete'),
										onClick: () => setCriteria((current) => current.filter((_entry, entryIndex) => entryIndex !== index))
									}))))),
					h('div', { className: 'sb-form-section' },
						h('div', { className: 'sb-form-section-head' }, h('span', { className: 'sb-form-section-title' }, t('story.planning'))),
						h('div', { className: 'sb-grid-2' },
							h(Field, { label: t('story.status') },
								h('select', {
									className: 'sb-input',
									value: status,
									onChange: (event) => setStatus(event.target.value)
								}, snapshot.meta.statuses.map((entry) => h('option', { key: entry.id, value: entry.id }, statusLabel(t, entry.id))))),
							h(Field, { label: t('story.board') },
								h('select', { className: 'sb-input', value: boardId, onChange: (event) => setBoardId(event.target.value) },
									boardOptions.map((option) => h('option', { key: option.value, value: option.value }, option.label))))),
						h('div', { className: 'sb-grid-2' },
							h(Field, { label: t('story.priority') },
								h('select', { className: 'sb-input', value: priority, onChange: (event) => setPriority(event.target.value) },
									PRIORITY_ORDER.map((value) => h('option', { key: value, value }, value)))),
							h(Field, { label: t('story.estimate') },
								h('input', { className: 'sb-input', type: 'number', min: 0, max: 100, step: 0.5, value: estimate, onChange: (event) => setEstimate(event.target.value) }))),
						h('div', { className: 'sb-grid-2' },
							h(Field, { label: t('story.assignee') }, h('input', { className: 'sb-input', value: assignee, placeholder: t('story.assigneePlaceholder'), onChange: (event) => setAssignee(event.target.value) })),
							h(Field, { label: t('story.epic') }, h('input', { className: 'sb-input', value: epic, placeholder: t('story.epicPlaceholder'), onChange: (event) => setEpic(event.target.value) }))),
						h(Field, { label: t('story.tags') }, h('input', { className: 'sb-input', value: tags, placeholder: t('story.tagsPlaceholder'), onChange: (event) => setTags(event.target.value) }))),
					h('div', { className: 'sb-form-section' },
						h('label', { className: 'sb-check' },
							h('input', { type: 'checkbox', checked: blocked, onChange: (event) => setBlocked(event.target.checked) }),
							t('story.blocked')),
						blocked === true ? h('div', { className: 'sb-blocked-box' },
							h(Field, { label: t('story.blockedReason') },
								h('input', { className: 'sb-input', value: blockedReason, placeholder: t('story.blockedPlaceholder'), onChange: (event) => setBlockedReason(event.target.value) }))) : undefined),
					mode === 'new' ? undefined : h('div', { className: 'sb-field-hint' }, t('story.meta', { created: formatDate(story.createdAt), updated: formatDate(story.updatedAt) }))));
		}

		/* ------------------------------------------------------------------ */
		/* App                                                                */
		/* ------------------------------------------------------------------ */

		function readStored() {
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (raw === null) return {};
				const parsed = JSON.parse(raw);
				return parsed !== null && typeof parsed === 'object' ? parsed : {};
			} catch {
				return {};
			}
		}

		function App({ t }) {
			const [snapshot, setSnapshot] = useState(null);
			const [loading, setLoading] = useState(true);
			const [error, setError] = useState(null);
			const [tab, setTab] = useState(() => readStored().tab ?? 'overview');
			const [selection, setSelection] = useState(() => {
				const stored = readStored();
				return { productId: stored.productId ?? '', projectId: stored.projectId ?? '', boardId: stored.boardId ?? '' };
			});
			const [dialog, setDialog] = useState(null);
			const [editor, setEditor] = useState(null);
			const [toast, setToast] = useState(null);
			const [busy, setBusy] = useState(false);
			const [productFilter, setProductFilter] = useState('');
			const [boardFilter, setBoardFilter] = useState('');
			const toastTimer = useRef(null);

			const notify = useCallback((text, tone = 'ok') => {
				setToast({ text, tone });
				if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
				toastTimer.current = window.setTimeout(() => setToast(null), 4200);
			}, []);

			useEffect(() => () => {
				if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
			}, []);

			const reload = useCallback(async (silent = false) => {
				if (silent !== true) setLoading(true);
				try {
					const value = await api.state();
					setSnapshot(value);
					setError(null);
				} catch (cause) {
					setError(String(cause?.message ?? cause));
				} finally {
					setLoading(false);
				}
			}, []);

			useEffect(() => {
				void reload();
			}, [reload]);

			useEffect(() => {
				const onFocus = () => {
					if (document.visibilityState === 'visible') void reload(true);
				};
				window.addEventListener('focus', onFocus);
				return () => window.removeEventListener('focus', onFocus);
			}, [reload]);

			useEffect(() => {
				try {
					window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tab, ...selection }));
				} catch {
					// Selection memory is a convenience.
				}
			}, [tab, selection]);

			const command = useCallback(async (action, fields = {}) => {
				setBusy(true);
				try {
					const result = await api.command({ action, ...fields });
					await reload(true);
					if (Array.isArray(result.warnings) && result.warnings.length > 0) {
						const warning = result.warnings[0];
						notify(t('toast.wip', {
							status: statusLabel(t, warning.status),
							count: warning.count,
							limit: warning.limit
						}), 'warn');
					}
					return result.value;
				} catch (cause) {
					notify(String(cause?.message ?? cause), 'error');
					throw cause;
				} finally {
					setBusy(false);
				}
			}, [reload, notify, t]);

			const context = useMemo(() => {
				const products = snapshot?.products ?? [];
				const projects = snapshot?.projects ?? [];
				const boards = snapshot?.boards ?? [];
				const product = products.find((entry) => entry.id === selection.productId) ?? products[0] ?? undefined;
				const productProjects = projects.filter((entry) => entry.productId === product?.id);
				const project = productProjects.find((entry) => entry.id === selection.projectId) ?? productProjects[0] ?? undefined;
				const projectBoards = boards.filter((entry) => entry.projectId === project?.id);
				const board = projectBoards.find((entry) => entry.id === selection.boardId) ?? projectBoards[0] ?? undefined;
				return { product, project, board, productProjects, projectBoards };
			}, [snapshot, selection]);

			const chooseProduct = useCallback((productId) => {
				const products = snapshot?.products ?? [];
				const projects = snapshot?.projects ?? [];
				const boards = snapshot?.boards ?? [];
				const project = projects.find((entry) => entry.productId === productId);
				const board = boards.find((entry) => entry.projectId === project?.id);
				setSelection({ productId, projectId: project?.id ?? '', boardId: board?.id ?? '' });
			}, [snapshot]);

			const chooseProject = useCallback((projectId) => {
				const projects = snapshot?.projects ?? [];
				const boards = snapshot?.boards ?? [];
				const project = projects.find((entry) => entry.id === projectId);
				const board = boards.find((entry) => entry.projectId === projectId);
				setSelection({ productId: project?.productId ?? '', projectId, boardId: board?.id ?? '' });
			}, [snapshot]);

			const chooseBoard = useCallback((boardId) => {
				const boards = snapshot?.boards ?? [];
				const projects = snapshot?.projects ?? [];
				const board = boards.find((entry) => entry.id === boardId);
				const project = projects.find((entry) => entry.id === board?.projectId);
				setSelection({ productId: project?.productId ?? '', projectId: project?.id ?? '', boardId });
			}, [snapshot]);

			const gotoBoard = useCallback((boardId) => {
				chooseBoard(boardId);
				setTab('board');
			}, [chooseBoard]);

			const gotoProject = useCallback((project) => {
				const board = (snapshot?.boards ?? []).find((entry) => entry.projectId === project.id);
				setSelection({ productId: project.productId, projectId: project.id, boardId: board?.id ?? '' });
				// Always land on the board tab so the click visibly responds. A project
				// with no board yet (e.g. a fresh import whose stories sit in the
				// backlog) shows the empty-board state with a create-board action
				// rather than silently staying put.
				setTab('board');
			}, [snapshot]);

			const openStory = useCallback((story) => {
				const project = (snapshot?.projects ?? []).find((entry) => entry.id === story.projectId);
				const boards = (snapshot?.boards ?? []).filter((entry) => entry.projectId === story.projectId);
				if (project !== undefined) {
					setSelection({ productId: project.productId, projectId: project.id, boardId: story.boardId ?? boards[0]?.id ?? '' });
				}
				setEditor({ mode: 'edit', story });
			}, [snapshot]);

			const saveProduct = useCallback(async (fields) => {
				if (dialog?.type !== 'product') return;
				try {
					if (dialog.product !== undefined) await command('update_product', { id: dialog.product.id, ...fields });
					else await command('create_product', fields);
					setDialog(null);
					notify(t('toast.saved'));
				} catch {
					// command already surfaced the error
				}
			}, [dialog, command, notify, t]);

			const saveProject = useCallback(async (fields) => {
				if (dialog?.type !== 'project') return;
				try {
					if (dialog.project !== undefined) await command('update_project', { id: dialog.project.id, ...fields });
					else await command('create_project', fields);
					setDialog(null);
					notify(t('toast.saved'));
				} catch {
					// command already surfaced the error
				}
			}, [dialog, command, notify, t]);

			const saveBoard = useCallback(async (fields) => {
				if (dialog?.type !== 'board') return;
				try {
					if (dialog.board !== undefined) await command('update_board', { id: dialog.board.id, ...fields });
					else await command('create_board', { projectId: dialog.projectId, ...fields });
					setDialog(null);
					notify(t('toast.saved'));
				} catch {
					// command already surfaced the error
				}
			}, [dialog, command, notify, t]);

			const saveStory = useCallback(async (fields) => {
				if (editor === null) return;
				try {
					if (editor.mode === 'new') {
						if (context.project === undefined) {
							notify(t('story.noProject'), 'error');
							return;
						}
						await command('create_story', { projectId: context.project.id, ...fields });
					} else {
						await command('update_story', { id: editor.story.id, ...fields });
					}
					setEditor(null);
					notify(t('toast.saved'));
				} catch {
					// command already surfaced the error
				}
			}, [editor, context, command, notify, t]);

			const moveStory = useCallback(async (id, status, beforeStoryId) => {
				try {
					await command('move_story', beforeStoryId === undefined ? { id, status } : { id, status, beforeStoryId });
					return undefined;
				} catch {
					return undefined;
				}
			}, [command]);

			const deleteStory = useCallback(async () => {
				if (editor?.mode !== 'edit') return;
				try {
					await command('delete_story', { id: editor.story.id });
					setEditor(null);
					notify(t('toast.deleted'));
				} catch {
					// command already surfaced the error
				}
			}, [editor, command, notify, t]);

			const deleteProduct = useCallback(async (product) => {
				const productProjects = (snapshot?.projects ?? []).filter((entry) => entry.productId === product.id);
				const projectIds = new Set(productProjects.map((entry) => entry.id));
				const boards = (snapshot?.boards ?? []).filter((entry) => projectIds.has(entry.projectId));
				const stories = (snapshot?.stories ?? []).filter((entry) => projectIds.has(entry.projectId));
				setDialog({
					type: 'confirm',
					title: t('product.deleteTitle'),
					message: t('product.deleteMessage', { projects: productProjects.length, boards: boards.length, stories: stories.length }),
					confirmLabel: t('common.delete'),
					onConfirm: async () => {
						try {
							await command('delete_product', { id: product.id, cascade: true });
							setDialog(null);
							notify(t('toast.deleted'));
						} catch {
							// command already surfaced the error
						}
					}
				});
			}, [snapshot, command, notify, t]);

			const deleteProject = useCallback(async (project) => {
				const boards = (snapshot?.boards ?? []).filter((entry) => entry.projectId === project.id);
				const stories = (snapshot?.stories ?? []).filter((entry) => entry.projectId === project.id);
				setDialog({
					type: 'confirm',
					title: t('project.deleteTitle'),
					message: t('project.deleteMessage', { boards: boards.length, stories: stories.length }),
					confirmLabel: t('common.delete'),
					onConfirm: async () => {
						try {
							await command('delete_project', { id: project.id, cascade: true });
							setDialog(null);
							notify(t('toast.deleted'));
						} catch {
							// command already surfaced the error
						}
					}
				});
			}, [snapshot, command, notify, t]);

			const seed = useCallback(async () => {
				try {
					await command('seed_demo', {});
					notify(t('toast.seeded'));
					setTab('board');
				} catch {
					// command already surfaced the error
				}
			}, [command, notify, t]);

			const openNewProject = useCallback(() => {
				if ((snapshot?.products ?? []).length === 0) {
					setDialog({ type: 'product' });
					return;
				}
				setDialog({ type: 'project', defaultProductId: context.product?.id });
			}, [snapshot, context]);

			const openNewBoard = useCallback(() => {
				if (context.project === undefined) {
					openNewProject();
					return;
				}
				setDialog({ type: 'board', projectId: context.project.id });
			}, [context, openNewProject]);

			const openNewStory = useCallback(() => {
				if (context.project === undefined) {
					notify(t('story.noProject'), 'error');
					return;
				}
				setEditor({ mode: 'new', projectId: context.project.id, boardId: context.board?.id });
			}, [context, notify, t]);

			if (loading === true && snapshot === null) {
				return h('div', { className: 'sb-root' },
					h('div', { className: 'sb-empty' },
						h('div', { className: 'sb-empty-icon' }, Icon.board(20)),
						h('div', { className: 'sb-empty-hint' }, t('common.loading'))));
			}

			if (error !== null && snapshot === null) {
				return h('div', { className: 'sb-root' },
					h(Empty, {
						title: t('common.loadFailed'),
						hint: error,
						action: h(Button, { variant: 'primary', onClick: () => { void reload(); } }, t('common.retry'))
					}));
			}

			const products = snapshot.products;
			const stories = snapshot.stories;
			const boards = snapshot.boards;
			const contextBar = (tab === 'board' || tab === 'stories') && products.length > 0
				? h('div', { className: 'sb-context' },
					h('div', { className: 'sb-ctx-group' },
						h('span', { className: 'sb-ctx-label' }, t('context.product')),
						h(Select, {
							value: context.product?.id ?? '',
							onChange: chooseProduct,
							ariaLabel: t('context.product'),
							options: products.map((product) => ({ value: product.id, label: product.name }))
						}),
						h(Button, { variant: 'ghost', size: 'sm', icon: Icon.plus(11), onClick: () => setDialog({ type: 'product' }), title: t('context.newProduct') })),
					h('div', { className: 'sb-ctx-group' },
						h('span', { className: 'sb-ctx-label' }, t('context.project')),
						context.productProjects.length === 0
							? h('span', { className: 'sb-field-hint' }, '—')
							: h(Select, {
								value: context.project?.id ?? '',
								onChange: chooseProject,
								ariaLabel: t('context.project'),
								options: context.productProjects.map((project) => ({ value: project.id, label: project.name }))
							}),
						h(Button, { variant: 'ghost', size: 'sm', icon: Icon.plus(11), onClick: openNewProject, title: t('context.newProject') })),
					tab === 'board' ? h('div', { className: 'sb-ctx-group' },
						h('span', { className: 'sb-ctx-label' }, t('context.board')),
						context.projectBoards.length === 0
							? h('span', { className: 'sb-field-hint' }, '—')
							: h(Select, {
								value: context.board?.id ?? '',
								onChange: chooseBoard,
								ariaLabel: t('context.board'),
								options: context.projectBoards.map((board) => ({ value: board.id, label: board.name }))
							}),
						h(Button, { variant: 'ghost', size: 'sm', icon: Icon.plus(11), onClick: openNewBoard, title: t('context.newBoard') })) : undefined,
					h('div', { className: 'sb-spacer' }),
					h('span', { className: 'sb-field-hint' }, `${String(stories.filter((story) => story.projectId === context.project?.id).length)} ${t('common.stories')}`))
				: undefined;

			return h('div', { className: 'sb-root' },
				h('div', { className: 'sb-head' },
					h('div', { className: 'sb-head-icon' }, Icon.logo(19)),
					h('div', { className: 'sb-head-text' },
						h('h1', { className: 'sb-title' }, t('app.title')),
						h('p', { className: 'sb-subtitle' }, t('app.subtitle'))),
					h('div', { className: 'sb-head-actions' },
						h(Button, {
							variant: 'ghost',
							size: 'sm',
							icon: Icon.refresh(13),
							onClick: () => { void reload(); },
							title: t('common.refresh'),
							disabled: loading === true
						}))),
				h('div', { className: 'sb-tabs' },
					[
						{ id: 'overview', label: t('tabs.overview') },
						{ id: 'products', label: t('tabs.products'), count: products.length },
						{ id: 'projects', label: t('tabs.projects'), count: (snapshot.projects ?? []).length },
						{ id: 'board', label: t('tabs.board'), count: boards.length },
						{ id: 'stories', label: t('tabs.stories'), count: stories.length }
					].map((entry) => h('button', {
						key: entry.id,
						type: 'button',
						className: `sb-tab${tab === entry.id ? ' sb-tab-active' : ''}`,
						onClick: () => setTab(entry.id)
					}, entry.label, entry.count === undefined ? undefined : h('span', { className: 'sb-tab-count' }, String(entry.count))))),
				contextBar,
				h('div', { className: 'sb-body' },
					tab === 'overview' ? h('div', { className: 'sb-scroll' },
						h(Overview, {
							snapshot,
							context,
							onGoto: gotoBoard,
							onSeed: () => { void seed(); },
							onNewProduct: () => setDialog({ type: 'product' }),
							onOpenStory: openStory,
							onNewProject: openNewProject,
							busy,
							t
						})) : undefined,
					tab === 'products' ? h('div', { className: 'sb-scroll' },
						h(Products, {
							snapshot,
							onNew: () => setDialog({ type: 'product' }),
							onImport: () => setDialog({ type: 'import' }),
							onEdit: (product) => setDialog({ type: 'product', product }),
							onDelete: (product) => { void deleteProduct(product); },
							onManage: (product) => {
								chooseProduct(product.id);
								setProductFilter(product.id);
								setTab('projects');
							},
							onOpenProject: gotoProject,
							t
						})) : undefined,
					tab === 'projects' ? h('div', { className: 'sb-scroll' },
						h(Projects, {
							snapshot,
							productFilter,
							onProductFilter: setProductFilter,
							onNew: openNewProject,
							onEdit: (project) => setDialog({ type: 'project', project }),
							onDelete: (project) => { void deleteProject(project); },
							onOpen: gotoProject,
							t
						})) : undefined,
					tab === 'board' ? h(BoardView, {
						snapshot,
						context,
						onMove: moveStory,
						onNewStory: openNewStory,
						onEditBoard: () => {
							if (context.board === undefined) openNewBoard();
							else setDialog({ type: 'board', board: context.board });
						},
						onOpenStory: openStory,
						busy,
						t
					}) : undefined,
					tab === 'stories' ? h(StoriesTable, {
						snapshot,
						context,
						boardFilter,
						onBoardFilter: setBoardFilter,
						onNewStory: openNewStory,
						onOpenStory: openStory,
						onMove: moveStory,
						busy,
						t
					}) : undefined),
				dialog?.type === 'product' ? h(ProductDialog, {
					product: dialog.product,
					onClose: () => setDialog(null),
					onSubmit: saveProduct,
					busy,
					t
				}) : undefined,
				dialog?.type === 'import' ? h(ImportProductDialog, {
					onClose: () => setDialog(null),
					onDone: () => setDialog(null),
					notify,
					t
				}) : undefined,
				dialog?.type === 'project' ? h(ProjectDialog, {
					project: dialog.project,
					products,
					defaultProductId: dialog.defaultProductId,
					onClose: () => setDialog(null),
					onSubmit: saveProject,
					busy,
					t
				}) : undefined,
				dialog?.type === 'board' ? h(BoardDialog, {
					board: dialog.board,
					project: dialog.board === undefined ? context.project : (snapshot.projects ?? []).find((project) => project.id === dialog.board.projectId),
					onClose: () => setDialog(null),
					onSubmit: saveBoard,
					busy,
					t
				}) : undefined,
				dialog?.type === 'confirm' ? h(Modal, {
					title: dialog.title,
					onClose: () => setDialog(null),
					footer: h(React.Fragment, null,
						h(Button, { onClick: () => setDialog(null) }, t('common.cancel')),
						h(Button, { variant: 'danger', onClick: () => { void dialog.onConfirm(); }, disabled: busy === true }, dialog.confirmLabel ?? t('delete.confirm')))
				}, h('p', { style: { margin: '4px 0 10px', fontSize: 12.5, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary)' } }, dialog.message)) : undefined,
				editor === null ? undefined : h(StoryDrawer, {
					mode: editor.mode,
					story: editor.story,
					context,
					snapshot,
					onClose: () => setEditor(null),
					onSave: saveStory,
					onDelete: deleteStory,
					busy,
					t
				}),
				toast === null ? undefined : ReactDOM.createPortal(h('div', { className: `sb-toast${toast.tone === 'warn' ? ' sb-toast-warn' : toast.tone === 'error' ? ' sb-toast-error' : ''}`, role: 'status' },
					toast.tone === 'error' ? Icon.alert(12) : undefined,
					h('span', null, toast.text)), document.body),
				);
		}

		/* ------------------------------------------------------------------ */
		/* Registration                                                       */
		/* ------------------------------------------------------------------ */

		function PanelIcon({ size }) {
			return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
				h('rect', { x: 3.2, y: 4.2, width: 4.4, height: 15.6, rx: 1.5, fill: 'currentColor', opacity: .32 }),
				h('rect', { x: 9.8, y: 4.2, width: 4.4, height: 15.6, rx: 1.5, fill: 'currentColor', opacity: .62 }),
				h('rect', { x: 16.4, y: 4.2, width: 4.4, height: 15.6, rx: 1.5, fill: 'currentColor' }));
		}

		return {
			inject: ['slots', 'locale'],
			apply(ctx) {
				dsh = makeDshBridge(ctx);
				const style = ensureCss();
				if (style !== undefined) {
					ctx.effect(() => () => {
						style.remove();
					}, 'dsh-story-board: styles');
				}
				ctx.effect(() => ctx.locale.register(NS, DICT), 'dsh-story-board: dictionaries');
				const t = ctx.locale.bind(NS);

				ctx.slots.inject('main', () => ctx.slots.register({
					name: 'main',
					key: PANEL_ID,
					locale: NS
				}, (props) => h(App, { t: typeof props?.t === 'function' ? props.t : t })));

				ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
					name: 'sidebar.panellist',
					id: PANEL_ID,
					order: 12,
					label: () => t('app.title'),
					locale: NS
				}, PanelIcon));
			}
		};
	}
});
