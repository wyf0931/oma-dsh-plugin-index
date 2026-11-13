// skill-gate — browser half.
//
// Registers one compact control in the composer tool row, right after the
// permission control (conversation.input.left), that opens a checklist of
// every skill this session's composition can see.
// Toggling a row persists the session's enabled-set through the plugin's
// authenticated /api routes; the Host half filters the skills registry so the
// model's <available_skills> catalog, the `skill` tool, and `/name` invocation
// only ever see the enabled ones. No restriction is stored until the user
// unchecks something — the dsh default stays "everything enabled".
//
// Plain React from the browser module table, own markup and styles, theme
// tokens only: this module deliberately requires no Harness client package.

window.__ModuleLoader__.load({
	id: "skill-gate",
	factory(require) {
		const React = require("react");
		// react-dom is a platform seed module (web/src/seed.ts), used only to
		// portal the popover out of the composer's containing block.
		const ReactDOM = require("react-dom");
		const h = React.createElement;
		const { useCallback, useEffect, useMemo, useRef, useState } = React;

		const NS = "skill-gate";
		const CSS = `
.sg-pill{align-items:center;display:inline-flex;gap:6px;height:28px;max-width:220px;padding:0 20px 0 8px;border:none;outline:none;border-radius:var(--dsw-radius-sm);background-color:transparent;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-position:right 4px center;background-repeat:no-repeat;background-size:12px 12px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:500;line-height:20px;white-space:nowrap;cursor:pointer}
.sg-pill:hover:not(:disabled){background-color:var(--dsw-alias-interactive-bg-hover)}
.sg-pill:disabled{opacity:.5;cursor:default}
.sg-pill-glyph{display:inline-flex;color:var(--dsw-alias-label-tertiary);flex:none}
.sg-pill-gate .sg-pill-glyph{color:var(--color-blue-500)}
.sg-pill-count{font-variant-numeric:tabular-nums;color:inherit;flex:none;min-width:0;overflow:hidden;text-overflow:ellipsis}
.sg-panel{position:fixed;z-index:300;width:min(360px,calc(100vw - 16px));max-height:min(432px,calc(100vh - 24px));display:flex;flex-direction:column;border-radius:10px;box-shadow:var(--dsw-elevation-panel);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);border:1px solid var(--dsw-alias-border-l1);overflow:hidden}
.sg-head{align-items:center;display:flex;gap:8px;padding:10px 10px 10px 14px;flex:none}
.sg-title{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sg-count{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:11px;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:1px 8px;flex:none}
.sg-close{width:26px;height:26px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit}
.sg-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.sg-search-row{padding:0 12px 10px;flex:none}
.sg-search{width:100%;box-sizing:border-box;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:5px 10px;outline:none}
.sg-search:focus-visible{border-color:var(--dsw-alias-border-l4)}
.sg-search::placeholder{color:var(--dsw-alias-label-tertiary)}
.sg-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 6px 6px}
.sg-group{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);padding:8px 8px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sg-row{width:100%;box-sizing:border-box;display:flex;align-items:flex-start;gap:9px;padding:6px 8px;border:none;border-radius:6px;background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
.sg-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sg-row:disabled{opacity:.5;cursor:default}
.sg-check{flex:none;width:16px;height:16px;margin-top:1px;border-radius:4px;border:1.5px solid var(--dsw-alias-border-l3);background:transparent;display:inline-flex;align-items:center;justify-content:center;color:transparent;transition:background-color var(--ds-transition-duration,.2s) var(--ds-ease-in-out,ease-in-out),border-color var(--ds-transition-duration,.2s) var(--ds-ease-in-out,ease-in-out),color var(--ds-transition-duration,.2s) var(--ds-ease-in-out,ease-in-out)}
.sg-row-on .sg-check{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground)}
.sg-row-off .sg-name{color:var(--dsw-alias-label-secondary)}
.sg-main{min-width:0;flex:1}
.sg-name{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11.5px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}
.sg-desc{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:1px}
.sg-src{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:0 5px;line-height:1.6;white-space:nowrap;margin-top:1px}
.sg-foot{flex:none;border-top:1px solid var(--dsw-alias-border-l2);padding:8px 12px;display:flex;align-items:center;gap:10px}
.sg-hint{flex:1;min-width:0;font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.sg-reset{flex:none;font:inherit;font-size:11px;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 10px;cursor:pointer;line-height:1.5}
.sg-reset:hover{border-color:var(--dsw-alias-label-secondary);color:var(--dsw-alias-label-primary)}
.sg-reset:disabled{opacity:.5;cursor:default}
.sg-note{flex:none;padding:10px 14px;font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.6}
.sg-retry{font:inherit;font-size:11px;margin-left:8px;color:var(--color-blue-500);background:transparent;border:none;cursor:pointer;padding:0;text-decoration:underline}
`;

		const dictionaries = {
			en: {
				pill: "Skills",
				pillAll: "all",
				locked: "locked",
				lockedHint: "Skill selection locks once the session has started. Pick skills in a new session, before the first message.",
				panelTitle: "Session skills",
				panelTitleDefault: "Default skills (new sessions)",
				search: "Search skills…",
				close: "Close",
				enableAll: "Enable all",
				hintRestricted: "Unchecked skills stay out of this session's catalog: the model cannot see or load them, and /name does nothing. Skills appearing later stay unchecked.",
				hintDefault: "Default: every available skill is enabled for this session.",
				empty: "No skills are available for this directory yet.",
				loading: "Loading skills…",
				loadFailed: "Could not load the skill catalog.",
				retry: "Retry",
				srcProjectDsh: "Project · .dsh/skills",
				srcProjectAgents: "Project · .agents/skills",
				srcCustom: "Custom",
				srcUserDsh: "User · .dsh/skills",
				srcUserAgents: "User · .agents/skills",
				srcBundled: "Bundled",
				srcRuntime: "Runtime",
				srcOther: "Other"
			},
			zh: {
				pill: "技能",
				pillAll: "全部",
				locked: "已锁定",
				lockedHint: "会话开始后技能选择已锁定。请在新会话、发送第一条消息之前选择技能。",
				panelTitle: "本会话技能",
				panelTitleDefault: "默认技能（新会话）",
				search: "搜索技能…",
				close: "关闭",
				enableAll: "全部启用",
				hintRestricted: "未勾选的技能不会进入本会话的技能目录：模型不可见、无法通过 skill 工具或 /名称 调用；之后新增的技能也默认不启用。",
				hintDefault: "当前为默认状态：本会话启用全部可用技能。",
				empty: "当前目录还没有可用技能。",
				loading: "正在加载技能…",
				loadFailed: "技能目录加载失败。",
				retry: "重试",
				srcProjectDsh: "项目 · .dsh/skills",
				srcProjectAgents: "项目 · .agents/skills",
				srcCustom: "自定义",
				srcUserDsh: "用户 · .dsh/skills",
				srcUserAgents: "用户 · .agents/skills",
				srcBundled: "内置",
				srcRuntime: "运行时",
				srcOther: "其他"
			}
		};

		const SOURCE_ORDER = ["project-dsh", "project-agents", "custom", "user-dsh", "user-agents", "bundled", "runtime"];
		const SOURCE_KEYS = {
			"project-dsh": "srcProjectDsh",
			"project-agents": "srcProjectAgents",
			custom: "srcCustom",
			"user-dsh": "srcUserDsh",
			"user-agents": "srcUserAgents",
			bundled: "srcBundled",
			runtime: "srcRuntime"
		};

		function ensureCss() {
			const tag = `${NS}/styles`;
			if (typeof document === "undefined" || document.querySelector(`style[data-plugin-css=${JSON.stringify(tag)}]`) !== null) return undefined;
			const style = document.createElement("style");
			style.dataset.plugin = NS;
			style.dataset.pluginCss = tag;
			style.textContent = CSS;
			document.head.appendChild(style);
			return style;
		}

		async function api(path, body) {
			const response = await fetch(`api/skill-gate/${path}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body === undefined ? {} : body)
			});
			if (response.ok !== true) throw new Error(`HTTP ${String(response.status)}`);
			const data = await response.json();
			if (data === null || typeof data !== "object" || data.ok !== true) throw new Error(data?.error?.message ?? "skill-gate request failed");
			return data.value;
		}

		const Glyph = h("svg", {
			width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false",
			fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round"
		},
			h("path", { d: "M2.5 5h11" }),
			h("circle", { cx: 11, cy: 5, r: 2, fill: "currentColor", stroke: "none" }),
			h("path", { d: "M2.5 11h11" }),
			h("circle", { cx: 5, cy: 11, r: 2, fill: "currentColor", stroke: "none" })
		);

		const Check = h("svg", { width: 11, height: 11, viewBox: "0 0 12 12", "aria-hidden": "true", focusable: "false", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
			h("path", { d: "M2.5 6.5l2.4 2.4L9.7 3.6" })
		);

		const Close = h("svg", { width: 13, height: 13, viewBox: "0 0 14 14", "aria-hidden": "true", focusable: "false", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" },
			h("path", { d: "M3.5 3.5l7 7M10.5 3.5l-7 7" })
		);

		/**
		 * One skill row: a checkbox-styled button showing the name, the trimmed
		 * description, and a source chip.
		 */
		function SkillRow({ skill, enabled, busy, onToggle, sourceLabel }) {
			const on = enabled === true;
			return h("button", {
				type: "button",
				className: `sg-row ${on ? "sg-row-on" : "sg-row-off"}`,
				disabled: busy === true,
				onClick: () => onToggle(skill.name),
				"aria-checked": on === true ? "true" : "false",
				role: "checkbox",
				"aria-label": skill.name,
				title: skill.path !== undefined ? skill.path : undefined
			},
				h("span", { className: "sg-check", "aria-hidden": "true" }, on === true ? Check : undefined),
				h("span", { className: "sg-main" },
					h("span", { className: "sg-name" }, skill.name),
					skill.description === "" ? undefined : h("span", { className: "sg-desc" }, skill.description)
				),
				sourceLabel === undefined ? undefined : h("span", { className: "sg-src" }, sourceLabel)
			);
		}

		/** The checklist panel anchored below the pill. */
		function SkillPanel({ anchorRef, data, loading, error, actionError, busyName, resetPending, onToggle, onReset, onRetry, onClose, title, t }) {
			const panelRef = useRef(null);
			const [query, setQuery] = useState("");
			const [position, setPosition] = useState(undefined);
			const searchRef = useRef(null);

			useEffect(() => {
				const anchor = anchorRef.current;
				if (anchor === null) return undefined;
				const place = () => {
					const rect = anchor.getBoundingClientRect();
					const width = Math.min(360, window.innerWidth - 16);
					const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
					// Open downward only when the full panel fits; otherwise flip
					// above the pill, sized to the space actually available there.
					const preferred = Math.min(432, window.innerHeight - 24);
					const belowTop = rect.bottom + 6;
					const fitsBelow = belowTop + preferred <= window.innerHeight - 8;
					const maxHeight = fitsBelow === true ? preferred : Math.min(preferred, Math.max(200, rect.top - 14));
					const top = fitsBelow === true ? belowTop : Math.max(8, rect.top - maxHeight - 6);
					setPosition({ left, top, width, maxHeight });
				};
				place();
				window.addEventListener("resize", place);
				return () => window.removeEventListener("resize", place);
			}, [anchorRef]);

			useEffect(() => {
				searchRef.current?.focus();
			}, []);

			const gateSet = useMemo(() => {
				const enabled = data?.gate?.enabled;
				return Array.isArray(enabled) === true ? new Set(enabled) : null;
			}, [data]);

			const groups = useMemo(() => {
				const skills = data?.skills ?? [];
				const needle = query.trim().toLowerCase();
				const matches = needle === "" ? skills : skills.filter((skill) => skill.name.toLowerCase().includes(needle) === true || skill.description.toLowerCase().includes(needle) === true || (skill.path ?? "").toLowerCase().includes(needle) === true);
				const orderOf = (source) => {
					const index = SOURCE_ORDER.indexOf(source);
					return index === -1 ? SOURCE_ORDER.length : index;
				};
				const grouped = new Map();
				for (const skill of matches) {
					const source = typeof skill.source === "string" && skill.source !== "" ? skill.source : "other";
					const bucket = grouped.get(source) ?? [];
					bucket.push(skill);
					grouped.set(source, bucket);
				}
				const sorted = [...grouped.entries()].sort((left, right) => {
					const byOrder = orderOf(left[0]) - orderOf(right[0]);
					return byOrder !== 0 ? byOrder : left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
				});
				return sorted.map(([source, skillsOfGroup]) => ({
					source,
					label: SOURCE_KEYS[source] !== undefined ? t(SOURCE_KEYS[source]) : t("srcOther"),
					skills: skillsOfGroup
				}));
			}, [data, query, t]);

			if (position === undefined) return undefined;
			const total = data?.total ?? 0;
			const enabledCount = gateSet === null ? total : (data?.skills ?? []).filter((skill) => gateSet.has(skill.name) === true).length;
			const restricted = gateSet !== null;

			const panel = h("div", {
				ref: panelRef,
				className: "sg-panel",
				role: "dialog",
				"aria-label": title,
				style: { left: `${String(position.left)}px`, top: `${String(position.top)}px`, width: `${String(position.width)}px`, maxHeight: `${String(position.maxHeight)}px` }
			},
				h("div", { className: "sg-head" },
					h("span", { className: "sg-title" }, title),
					h("span", { className: "sg-count" }, `${String(enabledCount)}/${String(total)}`),
					h("button", { type: "button", className: "sg-close", onClick: onClose, "aria-label": t("close") }, Close)
				),
				total > 6 ? h("div", { className: "sg-search-row" },
					h("input", { ref: searchRef, className: "sg-search", type: "search", value: query, placeholder: t("search"), "aria-label": t("search"), onChange: (event) => setQuery(event.target.value) })
				) : undefined,
				loading === true ? h("div", { className: "sg-note" }, t("loading")) :
				error !== null ? h("div", { className: "sg-note" }, error, h("button", { type: "button", className: "sg-retry", onClick: onRetry }, t("retry"))) :
				total === 0 ? h("div", { className: "sg-note" }, t("empty")) :
				h("div", { className: "sg-list" },
					groups.map((group) => h(React.Fragment, { key: group.source },
						h("div", { className: "sg-group", key: `${group.source}:head` }, group.label),
						group.skills.map((skill) => h(SkillRow, {
							key: skill.name,
							skill,
							enabled: gateSet === null || gateSet.has(skill.name) === true,
							busy: busyName === skill.name,
							onToggle,
							sourceLabel: group.label
						}))
					))
				),
				total > 0 && error === null ? h("div", { className: "sg-foot" },
					h("span", { className: "sg-hint" }, actionError !== null ? actionError : restricted === true ? t("hintRestricted") : t("hintDefault")),
					restricted === true ? h("button", { type: "button", className: "sg-reset", disabled: resetPending === true, onClick: onReset }, t("enableAll")) : undefined
				) : undefined
			);
			// The docked composer establishes a containing block for fixed
			// descendants, so the popover must render in the document body.
			if (typeof document === "undefined") return panel;
			return ReactDOM.createPortal(panel, document.body);
		}

		/**
		 * The tool-row control: a compact pill beside the permission control.
		 * Sessions without an id edit the default gate applied to new sessions.
		 * The pill loads its state once on mount so a restricted session shows
		 * its gate at a glance; the panel itself reloads on every open.
		 */
		function SkillGateDock(props) {
			const { sessionId, t } = props;
			// Standard framework prop for this slot: the per-session snapshot.
			// `blank` is false once the conversation has a durable turn, which
			// is the point at which this control locks (product decision).
			const useSession = props.useSession;
			const blank = typeof useSession === "function" ? useSession((state) => state.blank) : undefined;
			const started = blank === false;
			const [open, setOpen] = useState(false);
			const [data, setData] = useState(null);
			const [loading, setLoading] = useState(false);
			const [error, setError] = useState(null);
			const [actionError, setActionError] = useState(null);
			const [busyName, setBusyName] = useState(null);
			const [resetPending, setResetPending] = useState(false);
			const pillRef = useRef(null);

			const load = useCallback(async () => {
				setLoading(true);
				setError(null);
				try {
					const value = await api("state", sessionId === "" ? {} : { sessionId });
					setData(value);
					setActionError(null);
				} catch (cause) {
					setError(String(cause?.message ?? cause));
				} finally {
					setLoading(false);
				}
			}, [sessionId]);

			useEffect(() => {
				setData(null);
				setError(null);
				setActionError(null);
				void load();
			}, [load]);

			useEffect(() => {
				if (open !== true) return undefined;
				void load();
			}, [open, load]);

			useEffect(() => {
				if (started !== true || open !== true) return undefined;
				setOpen(false);
				return undefined;
			}, [started, open]);

			useEffect(() => {
				if (open !== true) return undefined;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				const onPointerDown = (event) => {
					const target = event.target;
					if (target instanceof Node !== true) return;
					if (pillRef.current !== null && pillRef.current.contains(target) === true) return;
					const panel = document.querySelector('.sg-panel');
					if (panel !== null && panel.contains(target) === true) return;
					setOpen(false);
				};
				window.addEventListener("keydown", onKeyDown);
				window.addEventListener("mousedown", onPointerDown);
				return () => {
					window.removeEventListener("keydown", onKeyDown);
					window.removeEventListener("mousedown", onPointerDown);
				};
			}, [open]);

			const gateSet = data === null ? undefined : (Array.isArray(data.gate?.enabled) === true ? new Set(data.gate.enabled) : null);
			const total = data?.total ?? 0;
			const enabledCount = useMemo(() => {
				if (data === null) return 0;
				if (gateSet === null || gateSet === undefined) return data.total ?? 0;
				return (data.skills ?? []).filter((skill) => gateSet.has(skill.name) === true).length;
			}, [data, gateSet]);
			const restricted = gateSet !== null && gateSet !== undefined;

			const onToggle = useCallback(async (name) => {
				if (data === null || busyName !== null) return;
				const universe = (data.skills ?? []).map((skill) => skill.name);
				const current = gateSet === null || gateSet === undefined ? new Set(universe) : new Set(universe.filter((entry) => gateSet.has(entry) === true));
				if (current.has(name) === true) current.delete(name);
				else current.add(name);
				const nextEnabled = current.size >= universe.length ? null : [...current];
				setBusyName(name);
				const before = data;
				setActionError(null);
				setData({ ...data, gate: { ...data.gate, enabled: nextEnabled } });
				try {
					const value = await api("set", sessionId === "" ? { enabled: nextEnabled } : { sessionId, enabled: nextEnabled });
					setData((latest) => latest === null ? latest : { ...latest, gate: { enabled: value.enabled, scope: value.scope } });
				} catch (cause) {
					setData(before);
					setActionError(String(cause?.message ?? cause));
				} finally {
					setBusyName(null);
				}
			}, [data, gateSet, busyName, sessionId]);

			const onReset = useCallback(async () => {
				if (resetPending === true) return;
				setResetPending(true);
				setActionError(null);
				try {
					const value = await api("set", sessionId === "" ? { enabled: null } : { sessionId, enabled: null });
					setData((latest) => latest === null ? latest : { ...latest, gate: { enabled: value.enabled, scope: value.scope } });
				} catch (cause) {
					setActionError(String(cause?.message ?? cause));
				} finally {
					setResetPending(false);
				}
			}, [resetPending, sessionId]);

			const pillLabel = started === true
				? `${t("pill")} · ${t("locked")}`
				: data === null ? t("pill") : restricted === true ? `${t("pill")} ${String(enabledCount)}/${String(total)}` : `${t("pill")} · ${t("pillAll")}`;

			return h(React.Fragment, null,
				h("button", {
					ref: pillRef,
					type: "button",
					className: `sg-pill${restricted === true ? " sg-pill-gate" : ""}`,
					disabled: started === true,
					title: started === true ? t("lockedHint") : undefined,
					"aria-disabled": started === true ? "true" : "false",
					onClick: () => {
						if (started === true) return;
						setOpen((value) => value !== true);
					},
					"aria-expanded": open === true ? "true" : "false",
					"aria-haspopup": "dialog"
				},
					h("span", { className: "sg-pill-glyph" }, Glyph),
					h("span", { className: "sg-pill-count" }, pillLabel)
				),
				open === true ? h(SkillPanel, {
					anchorRef: pillRef,
					data,
					loading: loading === true && data === null,
					error,
					actionError,
					busyName,
					resetPending,
					onToggle,
					onReset,
					onRetry: () => {
						void load();
					},
					onClose: () => setOpen(false),
					title: sessionId === "" ? t("panelTitleDefault") : t("panelTitle"),
					t
				}) : undefined
			);
		}

		return {
			inject: ["slots", "locale"],
			apply(ctx) {
				const style = ensureCss();
				if (style !== undefined) ctx.effect(() => () => {
					style.remove();
				}, "skill-gate: styles");
				ctx.effect(() => ctx.locale.register(NS, dictionaries), "skill-gate: dictionaries");
				const t = ctx.locale.bind(NS);
				ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
					name: "conversation.input.left",
					id: "skill-gate",
					order: 20,
					inject: (sessionId) => ({
						sessionId: typeof sessionId === "string" ? sessionId : "",
						t
					})
				}, SkillGateDock));
			}
		};
	}
});
