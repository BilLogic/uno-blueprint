import { z } from 'zod'
import schema from './ir-schema.generated.json'

type Row = Record<string, unknown>
export type Location = { kind: string; id: string; jsonpath: string }
export type Violation = { location: Location; message: string }
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The service export is incomplete; refresh the tool server and retry.')
  return value as Row
}
const rows = (row: Row, key: string): Row[] => {
  const value = row[key] ?? []
  if (!Array.isArray(value)) throw new Error('The service export is incomplete; refresh the tool server and retry.')
  return value.map(object)
}
const text = (value: unknown) => ({ und: value })

/** Project stored scalar text into one unspecified locale, preserving database ids as IR keys. */
export function serviceDocument(value: unknown) {
  const service = object(value)
  const locations = new Map<string, Location>()
  function locate(row: Row, kind: string, path: string) {
    locations.set(path, { kind, id: String(row.id), jsonpath: path })
  }
  function optional(row: Row, fields: string[], localized = false) {
    return Object.fromEntries(fields.filter(key => row[key] !== null && row[key] !== undefined)
      .map(key => [key, localized ? text(row[key]) : row[key]]))
  }
  function resource(row: Row) {
    return { name: text(row.name), url: row.url, ...optional(row, ['kind', 'featured']) }
  }
  function path(row: Row, jp: string) {
    locate(row, 'path', jp)
    return {
      key: row.id, name: text(row.name), kind: row.kind,
      ...optional(row, ['summary', 'note', 'variant_label'], true),
      path_steps: rows(row, 'path_steps').map((step, i) => {
        locations.set(`${jp}.path_steps[${i}]`, { kind: 'step', id: String(step.step_id), jsonpath: `${jp}.path_steps[${i}]` })
        return step.step_id
      }),
      lanes: rows(row, 'lanes').map((lane, i) => {
        locate(lane, 'lane', `${jp}.lanes[${i}]`)
        return { key: lane.id, display_name: text(lane.name), row: lane.position, role: lane.lane_role ?? null, ...optional(lane, ['kpis', 'tools']) }
      }),
      cells: rows(row, 'cells').map((cell, i) => {
        locate(cell, 'cell', `${jp}.cells[${i}]`)
        return { lane: cell.lane_id, step: cell.step_id,
          ...optional(cell, ['content', 'summary'], true),
          ...optional(cell, ['frame', 'function', 'form', 'owner', 'perceived_owner', 'value_props']),
          resources: rows(cell, 'resources').filter(r => !r.cell_touchpoint_id).map(resource),
          touchpoints: rows(cell, 'touchpoints').map(placement => ({ name: text(placement.name), ...optional(placement, ['summary'], true), ...optional(placement, ['role']), resources: rows(placement, 'resources').map(resource) })),
        }
      }),
      dependencies: rows(row, 'dependencies').map((edge, i) => {
        const source = rows(row, 'cells').find(cell => cell.lane_id === edge.source_lane_id && cell.step_id === edge.source_step_id)
        if (source) locate(source, 'cell', `${jp}.dependencies[${i}]`)
        return { source: { lane: edge.source_lane_id, step: edge.source_step_id }, target: { lane: edge.target_lane_id, step: edge.target_step_id }, kind: edge.kind }
      }),
    }
  }
  locate(service, 'service', '$.service')
  const document = { schema_version: schema.properties.schema_version.enum[0], locales: ['und'], service: {
    key: service.id, name: text(service.name), ...optional(service, ['summary'], true),
    touchpoints: rows(service, 'touchpoints').map(entry => ({ name: text(entry.name), ...optional(entry, ['kind', 'url']), ...optional(entry, ['summary'], true) })),
    entity_examples: service.entity_examples && typeof service.entity_examples === 'object' && !Array.isArray(service.entity_examples)
      ? Object.fromEntries(Object.entries(object(service.entity_examples)).map(([key, value]) => [key, text(value)]))
      : service.entity_examples ?? {},
    phases: rows(service, 'phases').map((phase, i) => {
      const jp = `$.service.phases[${i}]`; locate(phase, 'phase', jp)
      return { key: phase.id, name: text(phase.name), order: phase.position, ...optional(phase, ['summary'], true),
        ...(phase.loops_to_phase_id ? { loops_to: phase.loops_to_phase_id } : {}),
        scenarios: rows(phase, 'scenarios').map((scenario, j) => {
          const sjp = `${jp}.scenarios[${j}]`; locate(scenario, 'scenario', sjp)
          return { key: scenario.id, name: text(scenario.name), order: scenario.position, layout: scenario.layout,
            ...optional(scenario, ['summary'], true),
            steps: rows(scenario, 'steps').map((step, k) => { locate(step, 'step', `${sjp}.steps[${k}]`); return { key: step.id, name: text(step.name) } }),
            paths: rows(scenario, 'paths').map((row, k) => path(row, `${sjp}.paths[${k}]`)),
          }
        }),
      }
    }),
  } }
  return { document, locations }
}

// The file validator predates a few schema checks: optional locale maps may
// be null, and spec values are admitted without type checks. Keep its verdict
// until that contract changes; the parity corpus names both permissive cases.
const compatible = structuredClone(schema)
const definitions = compatible.$defs as unknown as Record<string, { properties?: Record<string, unknown>; required?: string[] }>
for (const definition of Object.values(definitions)) for (const [key, value] of Object.entries(definition.properties ?? {})) {
  if (object(value).$ref === '#/$defs/localeText' && !definition.required?.includes(key)) {
    definition.properties![key] = { anyOf: [value, { type: 'null' }] }
  }
}
const cellShape = definitions.cell.properties!
for (const key of ['function', 'form', 'owner', 'perceived_owner', 'value_props']) cellShape[key] = {}
// The canonical Python validator still reads this historical spelling.
delete cellShape.frame
cellShape.picture = { type: 'string' }
compatible.properties.schema_version.enum = [schema.properties.schema_version.enum[0]]
const shape = z.fromJSONSchema(compatible as Parameters<typeof z.fromJSONSchema>[0])
function roleCandidate(label: string): string | undefined {
  const legacy: Record<string, string> = { '前台技术': 'frontstage_touchpoints', '后台技术': 'backstage_touchpoints', '客户行为': 'customer_actions', '顾客行为': 'customer_actions', '支持系统': 'backstage_touchpoints', '前台行为': 'frontstage_actions', '后台行为': 'backstage_actions' }
  if (legacy[label.trim()]) return legacy[label.trim()]
  const normalized = label.trim().toLowerCase().normalize('NFC').replace(/[\s/-]+/g, '_')
  const roles = schema.$defs.lane.properties.role.enum.filter((role): role is string => role !== null)
  let closest: string | undefined, best = 3
  for (const role of roles) {
    let previous = Array.from({ length: role.length + 1 }, (_, i) => i)
    for (const [i, char] of [...normalized].entries()) {
      const row = [i + 1]
      for (const [j, other] of [...role].entries()) row.push(Math.min(previous[j + 1] + 1, row[j] + 1, previous[j] + Number(char !== other)))
      previous = row
    }
    const distance = previous[role.length]
    if (distance < best) { best = distance; closest = role }
  }
  return closest
}

export type Diagnostic = { path: string; message: string }

/** The parity test compares these verdicts with the file validator, including reference integrity. */
export function validateDocument(document: unknown) {
  const result = shape.safeParse(document)
  const errors: Diagnostic[] = result.success ? [] : result.error.issues.map(issue => ({
    path: '$' + issue.path.map(key => typeof key === 'number' ? `[${key}]` : `.${String(key)}`).join(''),
    message: issue.code === 'too_small' && ['lanes', 'steps', 'paths', 'phases'].includes(String(issue.path.at(-1)))
      ? `Add at least one ${String(issue.path.at(-1)).slice(0, -1)} to this blueprint location.`
      : `${issue.message}. Check this value in the blueprint.`,
  }))
  const warnings: Diagnostic[] = []
  const isRow = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value))
  if (!isRow(document) || !isRow(document.service) || !Array.isArray(document.locales) || document.schema_version !== schema.properties.schema_version.enum[0]) return { errors, warnings }
  const root = document, service = document.service
  // A malformed field must not hide independent reference violations elsewhere.
  const members = (row: Row, key: string): Row[] => Array.isArray(row[key]) ? row[key].filter(isRow) : []
  const error = (path: string, message: string) => errors.push({ path, message })
  const warn = (path: string, message: string) => warnings.push({ path, message })
  const unique = (items: Row[], jp: string, field = 'key') => {
    const seen = new Set<unknown>()
    for (const [i, row] of items.entries()) {
      if (seen.has(row[field])) error(`${jp}[${i}].${field}`, `Use a unique ${field}; this one is already used in this scope.`)
      seen.add(row[field])
    }
  }
  function inspect(value: unknown, contract: unknown, path: string) {
    if (value === null || value === undefined || !contract || typeof contract !== 'object') return
    const rule = object(contract)
    if (rule.$ref === '#/$defs/localeText') {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const missing = (root.locales as string[]).filter(locale => !(locale in value))
        if (missing.length) warn(path, `Add the missing declared locales: ${missing.join(', ')}.`)
      }
      return
    }
    if (typeof rule.$ref === 'string') { inspect(value, object(compatible.$defs)[rule.$ref.split('/').at(-1)!], path); return }
    if (Array.isArray(rule.anyOf)) { inspect(value, rule.anyOf[0], path); return }
    if (Array.isArray(value)) { value.forEach((child, i) => inspect(child, rule.items, `${path}[${i}]`)); return }
    if (value && typeof value === 'object') {
      const properties = rule.properties && typeof rule.properties === 'object' ? object(rule.properties) : {}
      for (const [key, child] of Object.entries(value)) {
        if (key === 'url' && properties.url && (typeof child !== 'string' || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(child))) error(`${path}.url`, 'Use an absolute URI for this resource.')
        inspect(child, properties[key] ?? rule.additionalProperties, `${path}.${key}`)
      }
    }
  }
  inspect(document, compatible, '$')
  const phases = members(service, 'phases')
  unique(phases, '$.service.phases')
  const phaseKeys = new Set(phases.map(row => row.key)), scenarioKeys = new Set<unknown>()
  for (const [i, phase] of phases.entries()) {
    const pjp = `$.service.phases[${i}]`
    if (phase.loops_to && !phaseKeys.has(phase.loops_to)) error(`${pjp}.loops_to`, 'Choose an existing phase for this loop.')
    for (const [j, scenario] of members(phase, 'scenarios').entries()) {
      const sjp = `${pjp}.scenarios[${j}]`
      if (scenarioKeys.has(scenario.key)) error(`${sjp}.key`, 'Use a unique scenario key across this service.')
      scenarioKeys.add(scenario.key)
      const steps = members(scenario, 'steps'), stepKeys = new Set(steps.map(row => row.key)), paths = members(scenario, 'paths')
      unique(steps, `${sjp}.steps`); unique(paths, `${sjp}.paths`)
      for (const [k, path] of paths.entries()) {
        const jp = `${sjp}.paths[${k}]`, lanes = members(path, 'lanes'), cells = members(path, 'cells')
        const laneKeys = new Set(lanes.map(row => row.key)), selected = Array.isArray(path.path_steps) ? path.path_steps.filter((key): key is string => typeof key === 'string') : []
        unique(lanes, `${jp}.lanes`)
        if (new Set(selected).size !== selected.length) error(`${jp}.path_steps`, 'Use each step once in this path.')
        for (const [n, key] of selected.entries()) if (!stepKeys.has(key)) error(`${jp}.path_steps[${n}]`, 'Choose a step belonging to this scenario.')
        const pair = (cell: Row) => JSON.stringify([cell.lane, cell.step])
        const pairs = new Set<string>()
        for (const [n, cell] of cells.entries()) {
          const cjp = `${jp}.cells[${n}]`, key = pair(cell)
          if (pairs.has(key)) error(cjp, 'Keep one cell at each lane and step intersection.')
          pairs.add(key)
          if (!laneKeys.has(cell.lane)) error(`${cjp}.lane`, 'Choose a lane on this path.')
          if (!stepKeys.has(cell.step)) error(`${cjp}.step`, 'Choose a step in this scenario.')
          else if (!selected.includes(String(cell.step))) error(`${cjp}.step`, 'Add this step to the path before placing a cell in it.')
          const names = members(cell, 'touchpoints').filter(t => isRow(t.name)).map(t => JSON.stringify(Object.entries(object(t.name)).sort()))
          if (new Set(names).size !== names.length) error(`${cjp}.touchpoints`, 'Place the same touchpoint only once on a cell.')
        }
        const edges = new Set<string>()
        for (const [n, edge] of members(path, 'dependencies').entries()) {
          if (!isRow(edge.source) || !isRow(edge.target)) continue
          const ejp = `${jp}.dependencies[${n}]`, source = pair(edge.source), target = pair(edge.target)
          if (source === target) { error(ejp, 'A dependency cannot point a cell to itself; connect two different cells on the same path.'); continue }
          const key = JSON.stringify([source, target, edge.kind ?? 'leads_to'])
          if (edges.has(key)) error(ejp, 'Keep one dependency of each kind between these cells.')
          edges.add(key)
          if (!pairs.has(source)) error(`${ejp}.source`, 'Choose a source cell that exists on this path; dependencies cannot cross paths.')
          if (!pairs.has(target)) error(`${ejp}.target`, 'Choose a target cell that exists on this path; dependencies cannot cross paths.')
        }
        if (lanes.length > 20) warn(`${jp}.lanes`, 'More than 20 lanes: consider splitting this scenario. This is advice, not a cap.')
        if (selected.length > 30) warn(`${jp}.path_steps`, 'More than 30 steps: consider splitting this scenario. This is advice, not a cap.')
        const occupied = new Set<unknown>()
        for (const [n, lane] of lanes.entries()) {
          if (occupied.has(lane.row)) warn(`${jp}.lanes[${n}].row`, 'Two lanes share a row position; give each lane its own position.')
          occupied.add(lane.row)
          if ((lane.role === null || lane.role === undefined) && isRow(lane.display_name)) for (const [locale, label] of Object.entries(object(lane.display_name))) {
            const candidate = roleCandidate(String(label))
            if (candidate) { warn(`${jp}.lanes[${n}].display_name.${locale}`, `This lane has no semantic role; consider ${candidate} if that is the intended role.`); break }
          }
        }
      }
    }
  }
  const registryNames = new Set<string>()
  for (const [i, entry] of members(service, 'touchpoints').entries()) for (const [locale, name] of Object.entries(isRow(entry.name) ? entry.name : {})) {
    const key = `${locale}:${String(name).trim().toLowerCase()}`
    if (String(name).trim() && registryNames.has(key)) error(`$.service.touchpoints[${i}].name`, 'Use one registry entry for each touchpoint name in a locale.')
    registryNames.add(key)
  }
  return { errors, warnings }
}

/** Validation replies contain violations and locations, rather than a copy of the business's content. */
export function validateService(value: unknown) {
  const { document, locations } = serviceDocument(value)
  function locate(path: string): Location {
    let parent = path
    while (!locations.has(parent) && parent.includes('.')) parent = parent.replace(/(?:\.[^.[]+|\[\d+\])$/, '')
    return { ...(locations.get(parent) ?? locations.get('$.service')!), jsonpath: path }
  }
  const result = validateDocument(document)
  const convert = (issue: Diagnostic): Violation => ({ location: locate(issue.path), message: issue.message })
  return { service_id: String(object(value).id), valid: result.errors.length === 0, errors: result.errors.map(convert), warnings: result.warnings.map(convert) }
}
