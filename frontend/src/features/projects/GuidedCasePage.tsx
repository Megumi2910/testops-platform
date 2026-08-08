import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'

import { ApiError } from '../../lib/api'
import { platformApi, projectsApi, type ActionDefinition, type Step, type TestCase } from './api'
import { Alert, Button, Card, ConfirmDialog, EmptyState, LoadingState } from '../../components/ui'
import { requirement, serializeSteps, toEditableSteps, validateSteps, type EditableStep } from './caseBuilder'

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
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({})
  const [validationMessage, setValidationMessage] = useState<string>()
  const [savedCase, setSavedCase] = useState<TestCase>()
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
      allowNavigation.current = true
      if (result.execution) navigate(`/projects/${projectId}/executions/${result.execution.executionId}`)
      else navigate(`/projects/${projectId}/suites/${suiteId}/cases/${result.created.id}`)
    },
  })
  const chooseTemplate = (value: string) => {
    const next = templates[value] ?? templates.blank
    setTemplate(value)
    setSteps(toEditableSteps(next.steps))
    setStepsDirty(true)
    setStepErrors({})
    setValidationMessage(undefined)
    form.reset({ name: next.name, description: next.description, priority: 'MEDIUM', tags: '', retryCount: 0, dataIsolation: true })
  }
  const setStage = (nextStage: BuilderStage) => setSearchParams(nextStage === 'details' ? {} : { stage: nextStage }, { replace: true })
  const changeSteps = (nextSteps: EditableStep[]) => {
    setSteps(nextSteps)
    setStepsDirty(true)
  }
  const submit = (values: CaseValues, status: 'DRAFT' | 'READY', run: boolean) => {
    if (status === 'READY') {
      const validation = validateSteps(steps, definitions)
      setStepErrors(validation.errors)
      setValidationMessage(validation.message)
      if (validation.message) return
    }
    setSavedCase(undefined)
    mutation.mutate({ values, status, run })
  }
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
    {stage === 'details' && <div className="form-stack"><Field label="Start from a template" help="Templates are editable. Choose Blank case when you want to build every step yourself."><select value={template} onChange={event => chooseTemplate(event.target.value)}><option value="homepage">Homepage smoke</option><option value="search">Search journey</option><option value="blank">Blank case</option></select></Field><Field label="Name"><input autoComplete="off" {...form.register('name', { required: 'Name is required' })} /></Field><Field label="Description"><textarea rows={4} {...form.register('description')} /></Field><div className="inline-form"><label>Priority<select {...form.register('priority')}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label><label>Retry count<input type="number" min={0} max={5} {...form.register('retryCount', { valueAsNumber: true })} /></label></div>{form.formState.errors.name && <p className="form-error" role="alert">{form.formState.errors.name.message}</p>}<Button type="button" onClick={() => setStage('steps')}>Continue to steps</Button></div>}
    {stage === 'steps' && <div className="form-stack"><p className="form-help">Edit each action using the same definitions enforced by the backend. The first step must navigate to the target for a READY case.</p><GuidedStepEditor steps={steps} onChange={changeSteps} definitions={definitions} locatorTypes={locatorTypes} roles={roles} errors={stepErrors} /><div className="inline-actions"><Button type="button" variant="secondary" onClick={() => setStage('details')}>Back</Button><Button type="button" onClick={() => { setStepErrors({}); setValidationMessage(undefined); setStage('review') }}>Review case</Button></div></div>}
    {stage === 'review' && <form className="form-stack" onSubmit={form.handleSubmit(values => submit(values, 'READY', false))}><h2>{form.watch('name') || 'Untitled case'}</h2><p className="muted">{steps.length} steps · ready for validation</p>{steps.length === 0 ? <EmptyState title="No steps yet" description="Return to the Steps stage and add a NAVIGATE step before saving as READY." /> : <ul className="resource-list">{steps.map((step, index) => <li key={step.clientId}><strong>{index + 1}. {definitionsByAction.get(step.action)?.label ?? step.action}</strong><span className="muted">{step.inputValue || step.expectedValue || step.locatorValue || 'No additional value'}</span></li>)}</ul>}{validationMessage && <p className="form-error" role="alert">{validationMessage}</p>}{mutation.isError && <p className="form-error" role="alert">{mutation.error instanceof ApiError ? mutation.error.message : 'Unable to save this case.'}</p>}{savedCase && <p className="form-help" role="status">The case was saved as READY, but the run could not be queued. <Link to={`/projects/${projectId}/suites/${suiteId}/cases/${savedCase.id}`}>Open the saved case</Link> and retry.</p>}<div className="inline-actions"><Button type="button" variant="secondary" onClick={() => setStage('steps')}>Back</Button><Button type="submit" busy={mutation.isPending}>Save as READY</Button><Button type="button" variant="secondary" onClick={() => submit(form.getValues(), 'DRAFT', false)} disabled={mutation.isPending}>Save draft</Button><Button type="button" onClick={() => form.handleSubmit(values => submit(values, 'READY', true))()} disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save & run'}</Button></div></form>}
    <ConfirmDialog open={blocker.state === 'blocked'} title="Leave without saving?" description="Your case changes will be lost if you leave this page." confirmLabel="Leave page" onClose={() => blocker.reset?.()} onConfirm={() => blocker.proceed?.()} />
  </Card>
}

export function GuidedStepEditor({ steps, onChange, definitions, locatorTypes, roles, errors = {} }: { steps: EditableStep[]; onChange: (steps: EditableStep[]) => void; definitions: ActionDefinition[]; locatorTypes: string[]; roles: string[]; errors?: Record<string, string> }) {
  const update = (index: number, patch: Partial<Step>) => onChange(steps.map((step, current) => current === index ? { ...step, ...patch } : step))
  const add = () => { if (steps.length < 100) onChange([...steps, { clientId: crypto.randomUUID(), position: steps.length, action: 'NAVIGATE', inputValue: '', timeoutMs: 15000 }]) }
  const remove = (index: number) => onChange(steps.filter((_, current) => current !== index).map((step, position) => ({ ...step, position })))
  const duplicate = (index: number) => onChange([...steps.slice(0, index + 1), { ...steps[index], clientId: crypto.randomUUID(), id: undefined }, ...steps.slice(index + 1)].map((step, position) => ({ ...step, position })))
  const move = (index: number, direction: -1 | 1) => { const next = index + direction; if (next < 0 || next >= steps.length) return; const copy = [...steps]; [copy[index], copy[next]] = [copy[next], copy[index]]; onChange(copy.map((step, position) => ({ ...step, position }))) }
  return <div className="step-editor"><div className="page-heading compact"><h2>Steps</h2><Button type="button" variant="secondary" onClick={add} disabled={steps.length >= 100}>Add step</Button></div>{steps.length === 0 && <EmptyState title="No steps yet" description="Add a navigation, locator, assertion, or screenshot step." />}{steps.map((step, index) => { const definition = definitions.find(item => item.action === step.action); const needsLocator = requirement(definition, 'locator') !== 'NOT_APPLICABLE'; const needsExpected = requirement(definition, 'expected') !== 'NOT_APPLICABLE'; const needsInput = requirement(definition, 'input') !== 'NOT_APPLICABLE'; return <fieldset className="step-card" key={step.clientId}><legend>Step {index + 1} · {definition?.label ?? step.action}</legend><div className="inline-form"><label>Action<select value={step.action} onChange={event => update(index, { action: event.target.value, locatorType: undefined, locatorValue: undefined, locatorRole: undefined, locatorIndex: undefined, inputValue: undefined, expectedValue: undefined })}>{definitions.map(action => <option key={action.action} value={action.action}>{action.label}</option>)}</select></label>{needsLocator && <label>Locator<select value={step.locatorType ?? ''} onChange={event => update(index, { locatorType: event.target.value || undefined, locatorRole: undefined, locatorIndex: undefined })}><option value="">Choose locator</option>{locatorTypes.map(locator => <option key={locator}>{locator}</option>)}</select></label>}<label>Timeout (ms)<input type="number" min="100" max="120000" value={step.timeoutMs ?? 15000} onChange={event => update(index, { timeoutMs: Number(event.target.value) })} /></label></div>{definition?.help && <small className="form-help">Example: {definition.help}</small>}{step.locatorType === 'ROLE' && <label>ARIA role<select value={step.locatorRole ?? ''} onChange={event => update(index, { locatorRole: event.target.value })}><option value="">Choose role</option>{roles.map(role => <option key={role}>{role}</option>)}</select></label>}{needsLocator && <label>Locator value<input value={step.locatorValue ?? ''} onChange={event => update(index, { locatorValue: event.target.value })} placeholder={step.locatorType === 'TEXT_EXACT' ? 'Exact visible text…' : 'Accessible name, text, or selector…'} /></label>}{needsLocator && <label>Matching element index (optional)<input type="number" min="0" step="1" value={step.locatorIndex ?? ''} onChange={event => update(index, { locatorIndex: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="0 for the first match" /><small className="form-help">Use this when a locator matches several elements; indexing starts at 0.</small></label>}{needsInput && <label>{inputLabel(step.action)}<textarea value={step.inputValue ?? ''} onChange={event => update(index, { inputValue: event.target.value })} rows={2} placeholder={inputPlaceholder(step.action)} /></label>}{needsExpected && <label>{expectedLabel(step.action)}<input value={step.expectedValue ?? ''} onChange={event => update(index, { expectedValue: event.target.value })} placeholder={expectedPlaceholder(step.action)} /></label>}{errors[step.clientId] && <p className="form-error" role="alert">{errors[step.clientId]}</p>}<div className="inline-actions"><button type="button" className="link-button" onClick={() => duplicate(index)}>Duplicate</button><button type="button" className="link-button" onClick={() => move(index, -1)} disabled={index === 0}>Move up</button><button type="button" className="link-button" onClick={() => move(index, 1)} disabled={index === steps.length - 1}>Move down</button><button type="button" className="link-button danger-text" onClick={() => remove(index)}>Remove</button></div></fieldset> })}</div>
}

function inputLabel(action: string) { return action === 'PRESS' ? 'Key to press' : action === 'ASSERT_ATTRIBUTE' ? 'Attribute name' : 'Input value' }
function inputPlaceholder(action: string) { if (action === 'NAVIGATE') return '/ or /checkout'; if (action === 'PRESS') return 'Enter, Tab, ArrowDown…'; if (action === 'ASSERT_ATTRIBUTE') return 'aria-label, href, data-state…'; return 'Supports ${VARIABLE_KEY}…' }
function expectedLabel(action: string) { return action === 'ASSERT_ATTRIBUTE' ? 'Expected attribute value' : action === 'ASSERT_COUNT' ? 'Expected matching count' : 'Expected value' }
function expectedPlaceholder(action: string) { if (action === 'ASSERT_COUNT') return '0, 1, 2…'; if (action === 'ASSERT_URL_EQUALS') return '/checkout or https://…'; if (action === 'ASSERT_VALUE') return 'Expected input value'; return 'Expected text, URL, or attribute value…' }

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) { return <label>{label}{children}{help && <small className="form-help">{help}</small>}</label> }
