import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { ApiError } from '../../lib/api'
import { platformApi, projectsApi, type ActionDefinition, type Step, type TestCase } from './api'
import { Alert, Button, Card, ConfirmDialog, EmptyState, LoadingState } from '../../components/ui'
import { firstStepErrorTarget, keepBrowserContextOnFirstStep, mapServerStepErrors, requirement, serializeSteps, stepFieldId, toEditableSteps, validateSteps, type EditableStep, type StepField, type StepValidationErrors } from './caseBuilder'

type CaseValues = { name: string; description?: string; priority: string; tags?: string; retryCount: number; dataIsolation: boolean }
type SubmitRequest = { values: CaseValues; status: 'DRAFT' | 'READY'; run: boolean }
type BuilderStage = 'details' | 'steps' | 'review'

const templates: Record<string, { name: string; description: string; steps: Step[] }> = {
  blank: { name: '', description: '', steps: [] },
  homepage: {
    name: 'Homepage smoke',
    description: 'Verify the local storefront homepage renders its product categories.',
    steps: [
      { position: 0, action: 'NAVIGATE', inputValue: '/', timeoutMs: 15000 },
      { position: 1, action: 'ASSERT_VISIBLE', locatorType: 'TEXT', locatorValue: 'Danh mục sản phẩm', timeoutMs: 15000 },
      { position: 2, action: 'TAKE_SCREENSHOT', timeoutMs: 15000 },
    ],
  },
  search: {
    name: 'Search journey',
    description: 'Search for a product and verify the results page.',
    steps: [
      { position: 0, action: 'NAVIGATE', inputValue: '/', timeoutMs: 15000 },
      { position: 1, action: 'FILL', locatorType: 'PLACEHOLDER', locatorValue: 'Tìm kiếm sản phẩm, thương hiệu...', inputValue: 'áo', timeoutMs: 15000 },
      { position: 2, action: 'TAKE_SCREENSHOT', timeoutMs: 15000 },
    ],
  },
}

export function GuidedNewCasePage() {
  const { projectId = '', suiteId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const options = useQuery({ queryKey: ['platform', 'options'], queryFn: platformApi.options, staleTime: 60_000 })
  const [template, setTemplate] = useState('homepage')
  const requestedStage = searchParams.get('stage')
  const stage: BuilderStage = requestedStage === 'steps' || requestedStage === 'review' ? requestedStage : 'details'
  const [steps, setSteps] = useState<EditableStep[]>(() => toEditableSteps(templates.homepage.steps))
  const [stepsDirty, setStepsDirty] = useState(false)
  const [stepErrors, setStepErrors] = useState<StepValidationErrors>({})
  const [focusTarget, setFocusTarget] = useState<string>()
  const [validationMessage, setValidationMessage] = useState<string>()
  const [savedCase, setSavedCase] = useState<TestCase>()
  const [suggestedName, setSuggestedName] = useState<string>()
  const allowNavigation = useRef(false)
  const form = useForm<CaseValues>({ defaultValues: { name: templates.homepage.name, description: templates.homepage.description, priority: 'MEDIUM', tags: '', retryCount: 0, dataIsolation: true } })
  const definitions = useMemo(() => options.data?.stepActions ?? [], [options.data?.stepActions])
  const definitionsByAction = useMemo(() => new Map(definitions.map(definition => [definition.action, definition])), [definitions])
  const locatorTypes = options.data?.supportedLocatorTypes ?? []
  const roles = options.data?.supportedLocatorRoles ?? []
  const mutation = useMutation({
    mutationFn: async ({ values, status, run }: SubmitRequest) => {
      const created = await projectsApi.createCase(projectId, suiteId, { ...values, status, steps: serializeSteps(steps) })
      if (!run) return { created }
      try {
        const execution = await projectsApi.queueCase(projectId, suiteId, created.id)
        return { created, execution }
      } catch (error) {
        setSavedCase(created)
        throw error
      }
    },
    onSuccess: result => {
      setSavedCase(undefined)
      setSuggestedName(undefined)
      allowNavigation.current = true
      if (result.execution) navigate(`/projects/${projectId}/executions/${result.execution.executionId}`)
      else navigate(`/projects/${projectId}/suites/${suiteId}/cases/${result.created.id}`)
    },
    onError: error => {
      if (!(error instanceof ApiError)) return
      const mapped = mapServerStepErrors(error.fieldErrors, steps)
      if (Object.keys(mapped).length) {
        setStepErrors(mapped)
        setFocusTarget(firstStepErrorTarget(mapped, steps))
        setStage('steps')
      }
      if (error.fieldErrors.name) form.setError('name', { message: error.fieldErrors.name }, { shouldFocus: true })
      if (error.code === 'case_name_taken') {
        const next = `${form.getValues('name').trim()} (copy)`
        setSuggestedName(next)
        form.setError('name', { message: 'A case with this name already exists.' }, { shouldFocus: true })
        setStage('details')
      }
    },
  })
  const retryRun = useMutation({
    mutationFn: () => {
      if (!savedCase) throw new Error('The saved case is unavailable.')
      return projectsApi.queueCase(projectId, suiteId, savedCase.id)
    },
    onSuccess: execution => { allowNavigation.current = true; navigate(`/projects/${projectId}/executions/${execution.executionId}`) },
  })
  const chooseTemplate = (value: string) => {
    const next = templates[value] ?? templates.blank
    setTemplate(value)
    setSteps(toEditableSteps(next.steps))
    setStepsDirty(true)
    setStepErrors({})
    setFocusTarget(undefined)
    setValidationMessage(undefined)
    setSuggestedName(undefined)
    form.reset({ name: next.name, description: next.description, priority: 'MEDIUM', tags: '', retryCount: 0, dataIsolation: true })
  }
  const setStage = (nextStage: BuilderStage) => setSearchParams(nextStage === 'details' ? {} : { stage: nextStage }, { replace: true })
  const changeSteps = (nextSteps: EditableStep[]) => {
    setSteps(nextSteps)
    setStepsDirty(true)
  }
  const submit = (values: CaseValues, status: 'DRAFT' | 'READY', run: boolean) => {
    form.clearErrors()
    if (status === 'READY') {
      const validation = validateSteps(steps, definitions)
      setStepErrors(validation.errors)
      setValidationMessage(validation.message)
      if (validation.message) {
        setFocusTarget(firstStepErrorTarget(validation.errors, steps))
        setStage('steps')
        return
      }
    }
    setSavedCase(undefined)
    setFocusTarget(undefined)
    mutation.mutate({ values, status, run })
  }
  const continueFromDetails = async () => { if (await form.trigger('name', { shouldFocus: true })) setStage('steps') }
  const dirty = form.formState.isDirty || stepsDirty
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !allowNavigation.current && dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (!dirty) return undefined
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
  if (options.isPending) return <Card><LoadingState label="Loading case authoring options…" /></Card>
  if (options.isError) return <Alert tone="danger" title="Case authoring options are unavailable.">Retry after the backend is healthy.</Alert>
  return <Card><p className="eyebrow">Guided test case builder</p><h1>New case</h1><nav className="stepper" aria-label="Case authoring stages"><span className={stage === 'details' ? 'active' : ''}>1. Details</span><span className={stage === 'steps' ? 'active' : ''}>2. Steps</span><span className={stage === 'review' ? 'active' : ''}>3. Review</span></nav>
    {stage === 'details' && <div className="form-stack"><Field label="Start from a template" help="Templates are editable. Choose Blank case when you want to build every step yourself."><select name="caseTemplate" autoComplete="off" value={template} onChange={event => chooseTemplate(event.target.value)}><option value="homepage">Homepage smoke</option><option value="search">Search journey</option><option value="blank">Blank case</option></select></Field><Field label="Name"><input autoComplete="off" aria-invalid={Boolean(form.formState.errors.name)} aria-describedby={form.formState.errors.name ? 'guided-case-name-error' : undefined} {...form.register('name', { required: 'Name is required' })} /></Field><Field label="Description"><textarea rows={4} autoComplete="off" {...form.register('description')} /></Field><div className="inline-form"><label>Priority<select autoComplete="off" {...form.register('priority')}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Retry count<input type="number" autoComplete="off" min={0} max={5} aria-invalid={Boolean(form.formState.errors.retryCount)} aria-describedby={form.formState.errors.retryCount ? 'guided-case-retry-error' : undefined} {...form.register('retryCount', { valueAsNumber: true, min: { value: 0, message: 'Retry count cannot be negative.' }, max: { value: 5, message: 'Retry count cannot exceed 5.' } })} /></label></div><Field label="Tags" help="Use comma-separated labels such as P0, guest, or smoke."><input autoComplete="off" placeholder="P0, smoke" {...form.register('tags')} /></Field><label className="checkbox-field"><input type="checkbox" {...form.register('dataIsolation')} />Use a fresh isolated browser context for this case</label>{form.formState.errors.name && <p id="guided-case-name-error" className="form-error" role="alert">{form.formState.errors.name.message}</p>}{form.formState.errors.retryCount && <p id="guided-case-retry-error" className="form-error" role="alert">{form.formState.errors.retryCount.message}</p>}{suggestedName && <Alert tone="warning" title="Choose a unique case name.">Try <button type="button" className="inline-link" onClick={() => { form.setValue('name', suggestedName, { shouldDirty: true }); form.clearErrors('name'); setSuggestedName(undefined) }}>{suggestedName}</button>.</Alert>}<Button type="button" onClick={() => void continueFromDetails()}>Continue to steps</Button></div>}
    {stage === 'steps' && <div className="form-stack"><p className="form-help">Edit each action using the same definitions enforced by the backend. The first step must navigate to the target for a READY case.</p><GuidedStepEditor steps={steps} onChange={changeSteps} definitions={definitions} locatorTypes={locatorTypes} roles={roles} errors={stepErrors} focusTarget={focusTarget} /><div className="inline-actions"><Button type="button" variant="secondary" onClick={() => setStage('details')}>Back</Button><Button type="button" onClick={() => { setStepErrors({}); setFocusTarget(undefined); setValidationMessage(undefined); setStage('review') }}>Review case</Button></div></div>}
    {stage === 'review' && <form className="form-stack" onSubmit={form.handleSubmit(values => submit(values, 'READY', false))}><h2>{form.watch('name') || 'Untitled case'}</h2><p className="muted">{steps.length} steps · {form.watch('priority')} priority · {form.watch('retryCount')} retries · {form.watch('dataIsolation') ? 'isolated context' : 'shared policy context'}</p>{form.watch('tags') && <p className="muted">Tags: {form.watch('tags')}</p>}{steps.length === 0 ? <EmptyState title="No steps yet" description="Return to the Steps stage and add a NAVIGATE step before saving as READY." /> : <ul className="resource-list">{steps.map((step, index) => <li key={step.clientId}><strong>{index + 1}. {definitionsByAction.get(step.action)?.label ?? step.action}</strong><span className="muted">{step.inputValue || step.expectedValue || step.locatorValue || 'No additional value'}</span></li>)}</ul>}{validationMessage && <p className="form-error" role="alert">{validationMessage}</p>}{mutation.isError && <p className="form-error" role="alert">{mutation.error instanceof ApiError ? mutation.error.message : 'Unable to save this case.'}</p>}{savedCase && <Alert tone="warning" title="The READY case was saved, but queueing failed."><div className="inline-actions"><Link to={`/projects/${projectId}/suites/${suiteId}/cases/${savedCase.id}`}>Open saved case</Link><Button type="button" variant="secondary" busy={retryRun.isPending} onClick={() => retryRun.mutate()}>Retry run</Button></div>{retryRun.isError && <p className="form-error" role="alert">{retryRun.error instanceof ApiError ? retryRun.error.message : 'Unable to queue the saved case.'}</p>}</Alert>}<div className="inline-actions"><Button type="button" variant="secondary" onClick={() => setStage('steps')}>Back</Button><Button type="submit" busy={mutation.isPending}>Save as READY</Button><Button type="button" variant="secondary" onClick={() => submit(form.getValues(), 'DRAFT', false)} disabled={mutation.isPending}>Save draft</Button><Button type="button" onClick={() => form.handleSubmit(values => submit(values, 'READY', true))()} disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save & run'}</Button></div></form>}
    <ConfirmDialog open={blocker.state === 'blocked'} title="Leave without saving?" description="Your case changes will be lost if you leave this page." confirmLabel="Leave page" onClose={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()} />
  </Card>
}

export function GuidedStepEditor({ steps, onChange, definitions, locatorTypes, roles, errors = {}, focusTarget }: { steps: EditableStep[]; onChange: (steps: EditableStep[]) => void; definitions: ActionDefinition[]; locatorTypes: string[]; roles: string[]; errors?: StepValidationErrors; focusTarget?: string }) {
  const update = (index: number, patch: Partial<Step>) => onChange(steps.map((step, current) => current === index ? { ...step, ...patch } : step))
  const add = () => { if (steps.length < 100) onChange([...steps, { clientId: crypto.randomUUID(), position: steps.length, action: 'NAVIGATE', inputValue: '', timeoutMs: 15000 }]) }
  const remove = (index: number) => onChange(keepBrowserContextOnFirstStep(steps, steps.filter((_, current) => current !== index)))
  const duplicate = (index: number) => {
    const duplicateStep = { ...steps[index], clientId: crypto.randomUUID(), id: undefined, viewportWidth: undefined, viewportHeight: undefined, locale: undefined, timezoneId: undefined }
    onChange([...steps.slice(0, index + 1), duplicateStep, ...steps.slice(index + 1)].map((step, position) => ({ ...step, position })))
  }
  const move = (index: number, direction: -1 | 1) => { const next = index + direction; if (next < 0 || next >= steps.length) return; const copy = [...steps]; [copy[index], copy[next]] = [copy[next], copy[index]]; onChange(keepBrowserContextOnFirstStep(steps, copy)) }
  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget)?.focus()
  }, [errors, focusTarget])

  return <div className="step-editor">
    <div className="page-heading compact"><h2>Steps</h2><Button type="button" variant="secondary" onClick={add} disabled={steps.length >= 100}>Add step</Button></div>
    {steps.length === 0 && <EmptyState title="No steps yet" description="Add a navigation, locator, assertion, or screenshot step." />}
    {steps.map((step, index) => {
      const definition = definitions.find(item => item.action === step.action)
      const needsLocator = requirement(definition, 'locator') !== 'NOT_APPLICABLE'
      const needsExpected = requirement(definition, 'expected') !== 'NOT_APPLICABLE'
      const needsInput = requirement(definition, 'input') !== 'NOT_APPLICABLE'
      const error = errors[step.clientId]
      const errorId = `case-step-${step.clientId}-error`
      const fieldProps = (field: StepField) => ({
        id: stepFieldId(step.clientId, field),
        name: `steps[${index}].${field}`,
        'aria-invalid': error?.field === field || undefined,
        'aria-describedby': error?.field === field ? errorId : undefined,
      })
      return <fieldset className="step-card" key={step.clientId}>
        <legend>Step {index + 1} · {definition?.label ?? step.action}</legend>
        <div className="inline-form">
          <label>Action<select autoComplete="off" {...fieldProps('action')} value={step.action} onChange={event => update(index, { action: event.target.value, locatorType: undefined, locatorValue: undefined, locatorRole: undefined, locatorIndex: undefined, inputValue: undefined, expectedValue: undefined })}>{definitions.map(action => <option key={action.action} value={action.action}>{action.label}</option>)}</select></label>
          {needsLocator && <label>Locator<select autoComplete="off" {...fieldProps('locatorType')} value={step.locatorType ?? ''} onChange={event => update(index, { locatorType: event.target.value || undefined, locatorRole: undefined, locatorIndex: undefined })}><option value="">Choose locator</option>{locatorTypes.map(locator => <option key={locator}>{locator}</option>)}</select></label>}
          <label>Timeout (ms)<input type="number" autoComplete="off" min="100" max="120000" {...fieldProps('timeoutMs')} value={step.timeoutMs ?? 15000} onChange={event => update(index, { timeoutMs: Number(event.target.value) })} /></label>
        </div>
        {index === 0 && <div className="step-context-options">
          <p className="form-help"><strong>Browser context (first step)</strong> — these settings apply to the isolated browser for the whole case.</p>
          <div className="inline-form">
            <label>Viewport width<input type="number" autoComplete="off" min="320" max="3840" step="1" {...fieldProps('viewportWidth')} value={step.viewportWidth ?? ''} onChange={event => update(index, { viewportWidth: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="Default" /></label>
            <label>Viewport height<input type="number" autoComplete="off" min="240" max="2160" step="1" {...fieldProps('viewportHeight')} value={step.viewportHeight ?? ''} onChange={event => update(index, { viewportHeight: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="Default" /></label>
          </div>
          <div className="inline-form">
            <label>Locale<input autoComplete="off" {...fieldProps('locale')} value={step.locale ?? ''} onChange={event => update(index, { locale: event.target.value || undefined })} placeholder="en-US" /></label>
            <label>Timezone<input autoComplete="off" {...fieldProps('timezoneId')} value={step.timezoneId ?? ''} onChange={event => update(index, { timezoneId: event.target.value || undefined })} placeholder="Asia/Ho_Chi_Minh" /></label>
          </div>
          <small className="form-help">Leave blank for the worker defaults. Use a valid BCP-47 locale and IANA timezone.</small>
        </div>}
        {definition?.help && <small className="form-help">Example: {definition.help}</small>}
        {step.locatorType === 'ROLE' && <label>ARIA role<select autoComplete="off" {...fieldProps('locatorRole')} value={step.locatorRole ?? ''} onChange={event => update(index, { locatorRole: event.target.value })}><option value="">Choose role</option>{roles.map(role => <option key={role}>{role}</option>)}</select></label>}
        {needsLocator && <label>Locator value<input autoComplete="off" {...fieldProps('locatorValue')} value={step.locatorValue ?? ''} onChange={event => update(index, { locatorValue: event.target.value })} placeholder={step.locatorType === 'TEXT_EXACT' ? 'Exact visible text…' : 'Accessible name, text, or selector…'} /></label>}
        {needsLocator && <label>Matching element index (optional)<input type="number" autoComplete="off" min="0" step="1" {...fieldProps('locatorIndex')} value={step.locatorIndex ?? ''} onChange={event => update(index, { locatorIndex: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="0 for the first match" /><small className="form-help">Use this when a locator matches several elements; indexing starts at 0.</small></label>}
        {needsInput && <label>{inputLabel(step.action)}<textarea autoComplete="off" {...fieldProps('inputValue')} value={step.inputValue ?? ''} onChange={event => update(index, { inputValue: event.target.value })} rows={2} placeholder={inputPlaceholder(step.action)} /></label>}
        {needsExpected && <label>{expectedLabel(step.action)}<input autoComplete="off" {...fieldProps('expectedValue')} value={step.expectedValue ?? ''} onChange={event => update(index, { expectedValue: event.target.value })} placeholder={expectedPlaceholder(step.action)} /></label>}
        {error && <p id={errorId} className="form-error" role="alert">{error.message}</p>}
        <div className="inline-actions"><button type="button" className="link-button" onClick={() => duplicate(index)}>Duplicate</button><button type="button" className="link-button" onClick={() => move(index, -1)} disabled={index === 0}>Move up</button><button type="button" className="link-button" onClick={() => move(index, 1)} disabled={index === steps.length - 1}>Move down</button><button type="button" className="link-button danger-text" onClick={() => remove(index)}>Remove</button></div>
      </fieldset>
    })}
  </div>
}

function inputLabel(action: string) { return action === 'PRESS' ? 'Key to press' : action === 'ASSERT_ATTRIBUTE' ? 'Attribute name' : 'Input value' }
function inputPlaceholder(action: string) { if (action === 'NAVIGATE') return '/ or /checkout'; if (action === 'PRESS') return 'Enter, Tab, ArrowDown…'; if (action === 'ASSERT_ATTRIBUTE') return 'aria-label, href, data-state…'; return 'Supports ${VARIABLE_KEY}…' }
function expectedLabel(action: string) { return action === 'ASSERT_ATTRIBUTE' ? 'Expected attribute value' : action === 'ASSERT_COUNT' ? 'Expected matching count' : 'Expected value' }
function expectedPlaceholder(action: string) { if (action === 'ASSERT_COUNT') return '0, 1, 2…'; if (action === 'ASSERT_URL_EQUALS') return '/checkout or https://…'; if (action === 'ASSERT_VALUE') return 'Expected input value'; return 'Expected text, URL, or attribute value…' }

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) { return <label>{label}{children}{help && <small className="form-help">{help}</small>}</label> }
