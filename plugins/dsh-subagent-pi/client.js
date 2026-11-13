/**
 * Client half of the dsh-subagent-pi bundle: the Pi provider's configuration page on the
 * Plugins page. The Host declares model, thinking, timeout, and excluded tools
 * as volatile Config fields; the shared settings form persists an edit into the
 * profile patch and the provider reads the new value on the next delegation.
 *
 * @module dsh-subagent-pi/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-subagent-pi',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dshPi'

    const en = {
      summary: 'Model, thinking level, timeout, and excluded tools for Pi delegations; each delegation is a separate pi process.',
      title: 'Pi delegation',
      intro: 'These values apply to the next delegation. Each delegation runs a separate `pi --mode rpc` process, so extensions and crashes stay outside DSH. Pi still resolves authentication, extensions, and skills from its agent directory.',
      model: 'Model',
      modelPlaceholder: 'provider/model',
      modelHint: "For example deepseek/deepseek-flash. Leave empty to use Pi's own default model.",
      thinking: 'Thinking level',
      thinkingDefault: 'Pi default',
      timeout: 'Turn deadline',
      timeoutPlaceholder: 'no deadline, e.g. 1h',
      timeoutHint: 'Empty means no deadline. Accepts 45s, 30m, 1h, 1h30m, or milliseconds. After the deadline Pi gets 30s to settle before it is stopped; its session is kept either way.',
      excludeTools: 'Excluded tools',
      excludePlaceholder: 'tool_a, tool_b',
      excludeHint: 'Comma-separated Pi tool names. Empty excludes none.',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      restore: 'Restore defaults',
      loading: 'Loading configuration…',
      unavailable: 'This configuration is not editable in this deployment.',
      readOnly: 'The profile is read-only for this configuration.',
      conflict: 'Another change landed first. The form was refreshed; review and save again.',
      invalidModel: 'Use provider/model, for example deepseek/deepseek-flash.',
      invalidTimeout: 'Use 45s, 30m, 1h, 1h30m, or a whole number of milliseconds.',
      historyTitle: 'Session history',
      historyIntro: 'Pi sessions started from this plugin. Read from Pi\'s own session files; no Pi process is started.',
      historyOurs: 'Delegated here',
      historyAll: 'All Pi sessions',
      historyRefresh: 'Refresh',
      historyLoading: 'Loading sessions…',
      historyFailed: 'Could not read Pi session history.',
      historyEmpty: 'No delegated session yet. Use delegate_pi, then refresh.',
      historyEmptyAll: 'No Pi session files found in the Pi home.',
      historyCount: '{shown} of {total} session files',
      colTitle: 'Session',
      colModel: 'Model',
      colTurns: 'Turns',
      colInput: 'Input',
      colCached: 'Cached in',
      colOutput: 'Output',
      colTotal: 'Total',
      colCost: 'Cost',
      colUpdated: 'Updated',
      saveFailed: 'The Host refused the change.',
    }

    const zh = {
      summary: 'Pi 委派的模型、思考级别、超时与被排除的工具；每次委派都是独立的 pi 子进程。',
      title: 'Pi 委派',
      intro: '这些值对下一次委派生效。每次委派都会启动独立的 `pi --mode rpc` 子进程，扩展与崩溃留在 DSH 之外。Pi 仍会从自己的 agent 目录解析认证、扩展和技能。',
      model: '模型',
      modelPlaceholder: 'provider/model',
      modelHint: '例如 deepseek/deepseek-flash。留空则使用 Pi 自己的默认模型。',
      thinking: '思考级别',
      thinkingDefault: 'Pi 默认',
      timeout: '回合时限',
      timeoutPlaceholder: '不设置，例如 1h',
      timeoutHint: '留空表示不设时限。支持 45s、30m、1h、1h30m 或毫秒数。到时限后 Pi 还有 30 秒自然收尾，之后才停止；会话始终保留。',
      excludeTools: '排除的工具',
      excludePlaceholder: 'tool_a, tool_b',
      excludeHint: '用逗号分隔的 Pi 工具名。留空表示不排除。',
      save: '保存',
      saving: '保存中…',
      saved: '已保存',
      restore: '恢复默认',
      loading: '正在读取配置…',
      unavailable: '当前部署不允许编辑这项配置。',
      readOnly: '该配置在此 profile 中为只读。',
      conflict: '已有其他修改先落地。表单已刷新，请检查后重新保存。',
      invalidModel: '请使用 provider/model，例如 deepseek/deepseek-flash。',
      invalidTimeout: '请使用 45s、30m、1h、1h30m 或整数毫秒。',
      historyTitle: '会话历史',
      historyIntro: '本插件发起的 Pi 会话。直接读取 Pi 自己的 session 文件，不启动任何 Pi 进程。',
      historyOurs: '本插件委派',
      historyAll: '全部 Pi 会话',
      historyRefresh: '刷新',
      historyLoading: '正在读取会话…',
      historyFailed: '读取 Pi 会话历史失败。',
      historyEmpty: '还没有委派记录。先用一次 delegate_pi，然后刷新。',
      historyEmptyAll: 'Pi 主目录下没有找到 session 文件。',
      historyCount: '显示 {shown} / 共 {total} 个 session 文件',
      colTitle: '会话',
      colModel: '模型',
      colTurns: '轮次',
      colInput: '输入',
      colCached: '缓存输入',
      colOutput: '输出',
      colTotal: '合计',
      colCost: '成本',
      colUpdated: '更新时间',
      saveFailed: 'Host 拒绝了这次修改。',
    }

    const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

    const css = `
.dsp-config { display: flex; flex-direction: column; gap: 18px; }
.dsp-config .dsp-intro { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsp-config .dsp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.dsp-config .dsp-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.dsp-config .dsp-field > label { font-size: 13px; font-weight: 500; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dsp-config .dsp-input {
  box-sizing: border-box; width: 100%; height: 36px; padding: 0 10px;
  font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-3);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md); outline: none;
}
.dsp-config .dsp-input:focus {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: inset 0 0 0 0.5px var(--dsw-alias-state-business-primary);
}
.dsp-config .dsp-input[aria-invalid='true'] {
  border-color: var(--dsw-alias-state-error-primary);
  box-shadow: none;
}
.dsp-config .dsp-hint { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsp-config .dsp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.dsp-config .dsp-button {
  height: 32px; padding: 0 14px; font: inherit; font-size: 13px; line-height: 20px;
  border-radius: var(--dsw-radius-md); cursor: pointer;
}
.dsp-config .dsp-button:disabled { opacity: 0.55; cursor: default; }
.dsp-config .dsp-primary { border: 0; background: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-label-primary-foreground); }
.dsp-config .dsp-ghost { border: 0.5px solid var(--dsw-alias-border-l4); background: transparent; color: var(--dsw-alias-label-secondary); }
.dsp-config .dsp-status { font-size: 12.5px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsp-config .dsp-error { margin: 0; font-size: 12.5px; line-height: 20px; color: var(--dsw-alias-state-error-primary); }
@media (max-width: 560px) { .dsp-config .dsp-grid { grid-template-columns: 1fr; } }
.dsp-history { display: flex; flex-direction: column; gap: 12px; border-top: 0.5px solid var(--dsw-alias-border-l4); padding-top: 18px; }
.dsp-history .dsp-history-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
.dsp-history h4 { margin: 0 0 4px; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dsp-history .dsp-history-actions { display: flex; align-items: center; gap: 8px; }
.dsp-history .dsp-seg { display: inline-flex; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md); overflow: hidden; }
.dsp-history .dsp-seg button { height: 30px; padding: 0 12px; font: inherit; font-size: 12.5px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsp-history .dsp-seg button.is-on { background: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-label-primary-foreground); }
.dsp-history .dsp-table-wrap { overflow-x: auto; }
.dsp-history table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.dsp-history th { text-align: left; font-weight: 500; color: var(--dsw-alias-label-tertiary); padding: 6px 8px; border-bottom: 0.5px solid var(--dsw-alias-border-l4); white-space: nowrap; }
.dsp-history td { padding: 7px 8px; border-bottom: 0.5px solid var(--dsw-alias-border-l4); color: var(--dsw-alias-label-secondary); vertical-align: top; }
.dsp-history td.dsp-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dsp-history .dsp-name { color: var(--dsw-alias-label-primary); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsp-history .dsp-sub { margin-top: 2px; font-size: 11.5px; color: var(--dsw-alias-label-tertiary); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`

    /** Read the form's effective values into editable text fields. */
    function readDraft(value) {
      const source = value !== null && typeof value === 'object' ? value : {}
      return {
        model: typeof source.model === 'string' ? source.model : '',
        thinking: typeof source.thinking === 'string' ? source.thinking : '',
        timeout: typeof source.timeout === 'string' ? source.timeout : '',
        excludeTools: Array.isArray(source.excludeTools) ? source.excludeTools.join(', ') : '',
      }
    }

    /** Parse the comma-separated excluded-tool field. */
    function readTools(text) {
      return text.split(',').map(item => item.trim()).filter(item => item.length > 0)
    }

    /** Build the atomic operation list that turns the current values into the draft. */
    function buildOperations(draft, value) {
      const current = value !== null && typeof value === 'object' ? value : {}
      const operations = []
      const model = draft.model.trim()
      if (model !== (typeof current.model === 'string' ? current.model : '')) {
        operations.push(model === '' ? { op: 'unset', path: ['model'] } : { op: 'set', path: ['model'], value: model })
      }
      if (draft.thinking !== (typeof current.thinking === 'string' ? current.thinking : '')) {
        operations.push(draft.thinking === ''
          ? { op: 'unset', path: ['thinking'] }
          : { op: 'set', path: ['thinking'], value: draft.thinking })
      }
      const timeout = draft.timeout.trim()
      if (timeout !== (typeof current.timeout === 'string' ? current.timeout : '')) {
        operations.push(timeout === ''
          ? { op: 'unset', path: ['timeout'] }
          : { op: 'set', path: ['timeout'], value: timeout })
      }
      const tools = readTools(draft.excludeTools)
      const currentTools = Array.isArray(current.excludeTools) ? current.excludeTools : []
      if (tools.join('\u0000') !== currentTools.join('\u0000')) {
        operations.push(tools.length === 0
          ? { op: 'unset', path: ['excludeTools'] }
          : { op: 'set', path: ['excludeTools'], value: tools })
      }
      return operations
    }

    /** One labelled field with an optional hint. */
    function Field(props) {
      return h('div', { className: 'dsp-field' },
        h('label', { htmlFor: props.htmlFor }, props.label),
        props.children,
        props.hint === undefined ? null : h('p', { className: 'dsp-hint' }, props.hint))
    }

    /** The editable provider settings. Mounted only for a ready form. */
    function PiConfigForm(props) {
      const { t, form } = props
      const state = form.state
      const current = readDraft(state.value)
      const [draft, setDraft] = React.useState(() => current)
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState('')
      const [failure, setFailure] = React.useState('')
      const justSaved = React.useRef(false)
      const prefix = React.useId()

      React.useEffect(() => {
        setDraft(readDraft(form.state.value))
        if (justSaved.current) {
          setNotice(t('saved'))
          justSaved.current = false
        } else {
          setNotice('')
          setFailure('')
        }
        // The revision is the form's identity; the bound translator is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [state.revision])

      const update = key => (event) => {
        const next = event.target.value
        setDraft(previous => ({ ...previous, [key]: next }))
        setNotice('')
        setFailure('')
      }

      async function commit(operations) {
        if (operations.length === 0) {
          setNotice(t('saved'))
          return
        }
        setSaving(true)
        setFailure('')
        setNotice('')
        try {
          const accepted = await form.mutate(operations, state.revision)
          if (accepted === false) setFailure(t('conflict'))
          else {
            justSaved.current = true
            setNotice(t('saved'))
          }
        } catch (error) {
          setFailure(error !== null && typeof error === 'object' && 'message' in error
            ? String(error.message)
            : t('saveFailed'))
        } finally {
          setSaving(false)
        }
      }

      function save() {
        if (saving) return
        const model = draft.model.trim()
        if (model !== '' && !/^[^/\s]+\/[^/\s]+$/.test(model)) {
          setFailure(t('invalidModel'))
          return
        }
        const timeout = draft.timeout.trim()
        if (timeout !== '' && !/^(\d+[hms])+$/i.test(timeout.replace(/\s+/gu, '')) && !/^\d+$/.test(timeout)) {
          setFailure(t('invalidTimeout'))
          return
        }
        void commit(buildOperations(draft, state.value))
      }

      function restore() {
        if (saving) return
        const operations = []
        for (const [path, present] of [
          ['model', current.model !== ''],
          ['thinking', current.thinking !== ''],
          ['timeout', current.timeout !== ''],
          ['excludeTools', current.excludeTools !== ''],
        ]) {
          if (present) operations.push({ op: 'unset', path: [path] })
        }
        void commit(operations)
      }

      const disabled = saving || state.writable === false

      return h('div', { className: 'dsp-config' },
        h('style', null, css),
        h('p', { className: 'dsp-intro' }, t('intro')),
        h('div', { className: 'dsp-grid' },
          h(Field, {
            label: t('model'),
            htmlFor: `${prefix}-model`,
            hint: t('modelHint'),
          }, h('input', {
            id: `${prefix}-model`,
            className: 'dsp-input',
            type: 'text',
            spellCheck: false,
            autoComplete: 'off',
            placeholder: t('modelPlaceholder'),
            value: draft.model,
            onChange: update('model'),
          })),
          h(Field, {
            label: t('thinking'),
            htmlFor: `${prefix}-thinking`,
          }, h('select', {
            id: `${prefix}-thinking`,
            className: 'dsp-input',
            value: draft.thinking,
            onChange: update('thinking'),
          }, [
            h('option', { key: 'default', value: '' }, t('thinkingDefault')),
            ...LEVELS.map(level => h('option', { key: level, value: level }, level)),
          ]))),
        h('div', { className: 'dsp-grid' },
          h(Field, {
            label: t('timeout'),
            htmlFor: `${prefix}-timeout`,
            hint: t('timeoutHint'),
          }, h('input', {
            id: `${prefix}-timeout`,
            className: 'dsp-input',
            type: 'text',
            spellCheck: false,
            autoComplete: 'off',
            placeholder: t('timeoutPlaceholder'),
            value: draft.timeout,
            onChange: update('timeout'),
          })),
          h(Field, {
            label: t('excludeTools'),
            htmlFor: `${prefix}-tools`,
            hint: t('excludeHint'),
          }, h('input', {
            id: `${prefix}-tools`,
            className: 'dsp-input',
            type: 'text',
            spellCheck: false,
            autoComplete: 'off',
            placeholder: t('excludePlaceholder'),
            value: draft.excludeTools,
            onChange: update('excludeTools'),
          }))),
        failure === '' ? null : h('p', { className: 'dsp-error', role: 'alert' }, failure),
        h('div', { className: 'dsp-actions' },
          h('button', {
            type: 'button',
            className: 'dsp-button dsp-primary',
            disabled,
            onClick: save,
          }, saving ? t('saving') : t('save')),
          h('button', {
            type: 'button',
            className: 'dsp-button dsp-ghost',
            disabled,
            onClick: restore,
          }, t('restore')),
          notice === '' ? null : h('span', { className: 'dsp-status', role: 'status' }, notice)),
        state.writable === false ? h('p', { className: 'dsp-hint' }, t('readOnly')) : null,
        h(SessionHistory, { t }))
    }


    /** Compact token count, with the exact value available as a tooltip. */
    function compactNumber(value) {
      if (typeof value !== 'number' || value === 0) return '—'
      return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    }

    /** Exact integer with grouping. */
    function exactNumber(value) {
      return new Intl.NumberFormat().format(typeof value === 'number' ? value : 0)
    }

    /** Cost in dollars, with more precision for sub-cent values. */
    function costText(value) {
      if (typeof value !== 'number' || value === 0) return '—'
      return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
    }

    /** Local date and time, or a dash. */
    function dateText(iso) {
      const date = new Date(iso)
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
    }

    /** The session history table served by the Host route. */
    function SessionHistory({ t }) {
      const [scope, setScope] = React.useState('delegated')
      const [rows, setRows] = React.useState([])
      const [total, setTotal] = React.useState(0)
      const [status, setStatus] = React.useState('loading')

      const load = React.useCallback(async (which) => {
        setStatus('loading')
        try {
          const response = await fetch('api/dsh-subagent-pi/sessions', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ scope: which, limit: 50 }),
          })
          const data = await response.json()
          if (response.ok !== true || data === null || typeof data !== 'object' || data.ok !== true) throw new Error('failed')
          setRows(Array.isArray(data.value?.sessions) ? data.value.sessions : [])
          setTotal(typeof data.value?.total === 'number' ? data.value.total : 0)
          setStatus('ready')
        } catch {
          setStatus('error')
        }
      }, [])

      React.useEffect(() => { void load(scope) }, [scope, load])

      const columns = [t('colTitle'), t('colModel'), t('colTurns'), t('colInput'), t('colCached'), t('colOutput'), t('colTotal'), t('colCost'), t('colUpdated')]
      const body = status === 'loading'
        ? h('p', { className: 'dsp-hint' }, t('historyLoading'))
        : status === 'error'
          ? h('p', { className: 'dsp-error', role: 'alert' }, t('historyFailed'))
          : rows.length === 0
            ? h('p', { className: 'dsp-hint' }, scope === 'delegated' ? t('historyEmpty') : t('historyEmptyAll'))
            : h('div', { className: 'dsp-table-wrap' },
              h('table', null,
                h('thead', null, h('tr', null, columns.map(label => h('th', { key: label }, label)))),
                h('tbody', null, rows.map(row => h('tr', { key: row.id },
                  h('td', null,
                    h('div', { className: 'dsp-name', title: row.title }, row.title),
                    h('div', { className: 'dsp-sub', title: row.cwd }, row.cwd || row.id)),
                  h('td', null, row.model || '—'),
                  h('td', { className: 'dsp-num' }, exactNumber(row.turns)),
                  h('td', { className: 'dsp-num', title: exactNumber(row.input) }, compactNumber(row.input)),
                  h('td', { className: 'dsp-num', title: exactNumber(row.cacheRead) }, compactNumber(row.cacheRead)),
                  h('td', { className: 'dsp-num', title: exactNumber(row.output) }, compactNumber(row.output)),
                  h('td', { className: 'dsp-num', title: exactNumber(row.total) }, compactNumber(row.total)),
                  h('td', { className: 'dsp-num' }, costText(row.cost)),
                  h('td', null, dateText(row.updatedAt)))))))

      return h('div', { className: 'dsp-history' },
        h('div', { className: 'dsp-history-head' },
          h('div', null,
            h('h4', null, t('historyTitle')),
            h('p', { className: 'dsp-hint' }, t('historyIntro')),
            status === 'ready' ? h('p', { className: 'dsp-hint' }, t('historyCount').replace('{shown}', String(rows.length)).replace('{total}', String(total))) : null),
          h('div', { className: 'dsp-history-actions' },
            h('div', { className: 'dsp-seg' },
              h('button', { type: 'button', className: scope === 'delegated' ? 'is-on' : '', onClick: () => setScope('delegated') }, t('historyOurs')),
              h('button', { type: 'button', className: scope === 'all' ? 'is-on' : '', onClick: () => setScope('all') }, t('historyAll'))),
            h('button', { type: 'button', className: 'dsp-button dsp-ghost', disabled: status === 'loading', onClick: () => { void load(scope) } }, t('historyRefresh')))),
        body)
    }

    const NOOP_UNSUBSCRIBE = () => {}
    const noopSubscribe = () => NOOP_UNSUBSCRIBE

    /** Find the settings namespace the Host serves for one profile row. */
    function pickNamespace(view, rowId) {
      const names = (view?.namespaces ?? []).map(item => item.ns)
      return names.includes(rowId)
        ? rowId
        : names.find(name => name.endsWith(`:${rowId}`)) ?? names.find(name => name.endsWith(`#${rowId}`))
    }

    /** The row's configuration page and its summary face. */
    function PiConfigPage(props) {
      const { t, view, configForms } = props
      const settings = React.useSyncExternalStore(
        React.useCallback(listener => configForms.describe().subscribe(listener), [configForms]),
        React.useCallback(() => configForms.describe().getSnapshot(), [configForms]),
      )
      const namespace = pickNamespace(settings.view, 'subagent-pi')
      const controller = React.useMemo(
        () => namespace === undefined ? undefined : configForms.get(namespace),
        [namespace, configForms],
      )
      const state = React.useSyncExternalStore(
        React.useCallback(listener => controller === undefined ? noopSubscribe() : controller.subscribe(listener), [controller]),
        React.useCallback(() => controller === undefined ? undefined : controller.getSnapshot(), [controller]),
      )
      const form = React.useMemo(
        () => controller === undefined || state === undefined
          ? undefined
          : { state, mutate: (operations, revision) => controller.mutate(operations, revision) },
        [controller, state],
      )
      if (view === 'summary') return h('span', null, t('summary'))
      if (form === undefined || form.state.status === 'loading') {
        return h('p', { className: 'dsp-hint' }, t('loading'))
      }
      if (form.state.status === 'unavailable') {
        return h('p', { className: 'dsp-hint' }, t('unavailable'))
      }
      return h(PiConfigForm, { t, form })
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-subagent-pi: dictionaries')
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: 'dsh-subagent-pi#subagent-pi',
          locale: NS,
          inject: () => ({ configForms: ctx.configForms }),
        }, PiConfigPage))
      },
    }
  },
})
