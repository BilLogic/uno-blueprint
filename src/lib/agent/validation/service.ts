import { z } from 'zod'
import schema from './ir-schema.generated.json'

const INCOMPLETE_EXPORT = 'The service export is incomplete; refresh the tool server and retry.'
type Row = Record<string, unknown>
export type Location = { kind: 'service' | 'phase' | 'scenario' | 'path' | 'step' | 'lane' | 'cell'; id: string; jsonpath: string }
export type Violation = { location: Location; message: string }
const object = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INCOMPLETE_EXPORT)
  return value as Row
}
const nestedRows = (row: Row, key: string): Row[] => {
  const value = row[key] ?? []
  if (!Array.isArray(value)) throw new Error(INCOMPLETE_EXPORT)
  return value.map(object)
}
const text = (value: unknown) => ({ und: value })

/** Project stored scalar text into one unspecified locale, preserving database ids as IR keys. */
export function serviceDocument(value: unknown) {
  const service = object(value)
  const locations = new Map<string, Location>()
  function locate(row: Row, kind: Location['kind'], path: string) {
    locations.set(path, { kind, id: String(row.id), jsonpath: path })
  }
  function optional(row: Row, fields: string[], localized = false) {
    return Object.fromEntries(fields.filter(key => row[key] !== null && row[key] !== undefined)
      .map(key => [key, localized ? text(row[key]) : row[key]]))
  }
  function resource(row: Row) {
    return { name: text(row.name), url: row.url, ...optional(row, ['kind', 'featured']) }
  }
  // A lane belongs to one path, so a dependency end's lane names the path,
  // and through it the scenario, its cell is on; a link may leave its path but never its service.
  const laneHome = new Map<unknown, { scenario: unknown; path: unknown }>()
  for (const phase of nestedRows(service, 'phases')) for (const scenario of nestedRows(phase, 'scenarios'))
    for (const row of nestedRows(scenario, 'paths')) for (const lane of nestedRows(row, 'lanes'))
      laneHome.set(lane.id, { scenario: scenario.id, path: row.id })
  function end(laneId: unknown, stepId: unknown, listing: { scenario: unknown; path: unknown }) {
    const home = laneHome.get(laneId)
    if (!home || home.path === listing.path) return { lane: laneId, step: stepId }
    return { lane: laneId, step: stepId, path: home.path, ...(home.scenario === listing.scenario ? {} : { scenario: home.scenario }) }
  }
  function path(row: Row, jp: string, scenarioId: unknown) {
    locate(row, 'path', jp)
    return {
      key: row.id, name: text(row.name), kind: row.kind,
      ...optional(row, ['summary', 'note', 'variant_label'], true),
      path_steps: nestedRows(row, 'path_steps').map((step, i) => {
        locations.set(`${jp}.path_steps[${i}]`, { kind: 'step', id: String(step.step_id), jsonpath: `${jp}.path_steps[${i}]` })
        return step.step_id
      }),
      lanes: nestedRows(row, 'lanes').map((lane, i) => {
        locate(lane, 'lane', `${jp}.lanes[${i}]`)
        return { key: lane.id, display_name: text(lane.name), row: lane.position, role: lane.lane_role ?? null, ...optional(lane, ['kpis', 'tools']) }
      }),
      cells: nestedRows(row, 'cells').map((cell, i) => {
        locate(cell, 'cell', `${jp}.cells[${i}]`)
        return { lane: cell.lane_id, step: cell.step_id,
          ...optional(cell, ['content', 'summary'], true),
          ...optional(cell, ['function', 'form', 'owner', 'perceived_owner', 'value_props']),
          ...(cell.frame == null ? {} : { picture: cell.frame }),
          resources: nestedRows(cell, 'resources').filter(r => !r.cell_touchpoint_id).map(resource),
          touchpoints: nestedRows(cell, 'touchpoints').map(placement => ({ name: text(placement.name), ...optional(placement, ['summary'], true), ...optional(placement, ['role']), resources: nestedRows(placement, 'resources').map(resource) })),
        }
      }),
      dependencies: nestedRows(row, 'dependencies').map((edge, i) => {
        const source = nestedRows(row, 'cells').find(cell => cell.lane_id === edge.source_lane_id && cell.step_id === edge.source_step_id)
        if (source) locate(source, 'cell', `${jp}.dependencies[${i}]`)
        const listing = { scenario: scenarioId, path: row.id }
        return { source: end(edge.source_lane_id, edge.source_step_id, listing), target: end(edge.target_lane_id, edge.target_step_id, listing), kind: edge.kind }
      }),
    }
  }
  locate(service, 'service', '$.service')
  const document = { schema_version: schema.properties.schema_version.enum[0], locales: ['und'], service: {
    key: service.id, name: text(service.name), ...optional(service, ['summary'], true),
    touchpoints: nestedRows(service, 'touchpoints').map(entry => ({ name: text(entry.name), ...optional(entry, ['kind', 'url']), ...optional(entry, ['summary'], true) })),
    entity_examples: service.entity_examples && typeof service.entity_examples === 'object' && !Array.isArray(service.entity_examples)
      ? Object.fromEntries(Object.entries(object(service.entity_examples)).map(([key, value]) => [key, text(value)]))
      : service.entity_examples ?? {},
    phases: nestedRows(service, 'phases').map((phase, i) => {
      const jp = `$.service.phases[${i}]`; locate(phase, 'phase', jp)
      return { key: phase.id, name: text(phase.name), order: phase.position, ...optional(phase, ['summary'], true),
        ...(phase.loops_to_phase_id ? { loops_to: phase.loops_to_phase_id } : {}),
        scenarios: nestedRows(phase, 'scenarios').map((scenario, j) => {
          const sjp = `${jp}.scenarios[${j}]`; locate(scenario, 'scenario', sjp)
          return { key: scenario.id, name: text(scenario.name), order: scenario.position, layout: scenario.layout,
            ...optional(scenario, ['summary'], true),
            steps: nestedRows(scenario, 'steps').map((step, k) => { locate(step, 'step', `${sjp}.steps[${k}]`); return { key: step.id, name: text(step.name) } }),
            paths: nestedRows(scenario, 'paths').map((row, k) => path(row, `${sjp}.paths[${k}]`, scenario.id)),
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
const pythonSchema = structuredClone(schema)
const definitions = pythonSchema.$defs as unknown as Record<string, { properties?: Record<string, unknown>; required?: string[] }>
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
// zod cannot read `dependentRequired`; the integrity pass below states the
// file validator's own refusal of a scenario named without its path.
for (const definition of Object.values(definitions) as Row[]) delete definition.dependentRequired
pythonSchema.properties.schema_version.enum = [schema.properties.schema_version.enum[0]]
const shape = z.fromJSONSchema(pythonSchema as Parameters<typeof z.fromJSONSchema>[0])
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
const cellCoordinateOf = (cell: Row) => JSON.stringify([cell.lane, cell.step])

/** The parity test compares these verdicts with the file validator, including reference integrity. */
export function validateDocument(document: unknown) {
  const result = shape.safeParse(document)
  const jsonpath = (keys: PropertyKey[]) => '$' + keys.map(key => typeof key === 'number' ? `[${key}]` : `.${String(key)}`).join('')
  const at = (keys: PropertyKey[]) => keys.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Row)[String(key)] : undefined, document)
  const errors: Diagnostic[] = []
  function diagnostic(issue: z.core.$ZodIssue) {
    if (issue.code === 'invalid_union') {
      for (const child of issue.errors[0]) diagnostic({ ...child, path: [...issue.path, ...child.path] })
      return
    }
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) errors.push({ path: jsonpath([...issue.path, key]), message: `Remove the unknown field ${key}.` })
      return
    }
    let keys = issue.path
    const key = String(keys.at(-1))
    const missing = at(keys) === undefined
    if ((missing && typeof keys.at(-1) !== 'number' && !['name', 'display_name', 'phases', 'steps', 'paths', 'path_steps', 'lanes', 'cells'].includes(key)) || (key === 'service' && keys.length === 1 && at(keys) === null) || (key === 'scenarios' && at(keys) === null)) keys = keys.slice(0, -1)
    errors.push({ path: jsonpath(keys), message: issue.code === 'too_small' && ['lanes', 'steps', 'paths', 'phases'].includes(key)
      ? `Add at least one ${key.slice(0, -1)} to this blueprint location.`
      : `${issue.message}. Check this value in the blueprint.` })
  }
  if (!result.success) for (const issue of result.error.issues) diagnostic(issue)
  const warnings: Diagnostic[] = []
  const isRow = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value))
  if (!isRow(document) || !isRow(document.service) || !Array.isArray(document.locales) || document.schema_version !== schema.properties.schema_version.enum[0]) return { errors, warnings }
  const root = document, service = document.service
  // A malformed field must not hide independent reference violations elsewhere.
  const recordMembers = (row: Row, key: string): Row[] => Array.isArray(row[key]) ? row[key].filter(isRow) : []
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
        for (const locale of Object.keys(value)) if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) error(`${path}.${locale}`, 'Use a valid locale tag.')
        if (missing.length) warn(path, `Add the missing declared locales: ${missing.join(', ')}.`)
      }
      return
    }
    if (typeof rule.$ref === 'string') { inspect(value, object(pythonSchema.$defs)[rule.$ref.split('/').at(-1)!], path); return }
    if (Array.isArray(rule.anyOf)) { inspect(value, rule.anyOf[0], path); return }
    if (Array.isArray(value)) { value.forEach((child, i) => inspect(child, rule.items, `${path}[${i}]`)); return }
    if (value && typeof value === 'object') {
      const properties = rule.properties && typeof rule.properties === 'object' ? object(rule.properties) : {}
      for (const [key, child] of Object.entries(value)) {
        if (key === 'url' && properties.url && typeof child === 'string' && (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(child))) error(`${path}.url`, 'Use an absolute URI for this resource.')
        inspect(child, properties[key] ?? rule.additionalProperties, `${path}.${key}`)
      }
    }
  }
  inspect(document, pythonSchema, '$')
  const validKey = (key: unknown): key is string => typeof key === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)
  // A link may name a path declared later in the file, so its ends are judged
  // once every path is read; a link may join any two cells of one service.
  type Edge = { jp: string; listing: [string | null, string]; source: Row; target: Row; kind: unknown }
  const linkCells = new Map<string, Set<string>>(), scenarioPaths = new Map<string, Set<string>>(), linkEdges: Edge[] = []
  const wellFormed = (ref: unknown, jp: string): ref is Row => {
    if (!isRow(ref)) return false
    if ('scenario' in ref && !('path' in ref)) { error(jp, 'Add the path this cell is on; a scenario holds several paths.'); return false }
    return validKey(ref.lane) && validKey(ref.step) && (!('path' in ref) || validKey(ref.path)) && (!('scenario' in ref) || validKey(ref.scenario))
  }
  const phases = recordMembers(service, 'phases')
  unique(phases, '$.service.phases')
  const phaseKeys = new Set(phases.map(row => row.key)), scenarioKeys = new Set<unknown>()
  for (const [i, phase] of phases.entries()) {
    const pjp = `$.service.phases[${i}]`
    if (phase.loops_to && !phaseKeys.has(phase.loops_to)) error(`${pjp}.loops_to`, 'Choose an existing phase for this loop.')
    for (const [j, scenario] of recordMembers(phase, 'scenarios').entries()) {
      const sjp = `${pjp}.scenarios[${j}]`
      if (scenarioKeys.has(scenario.key)) error(`${sjp}.key`, 'Use a unique scenario key across this service.')
      scenarioKeys.add(scenario.key)
      const steps = recordMembers(scenario, 'steps'), stepKeys = new Set(steps.map(row => row.key)), paths = recordMembers(scenario, 'paths')
      const scenarioKey = validKey(scenario.key) ? scenario.key : null
      unique(steps, `${sjp}.steps`); unique(paths, `${sjp}.paths`)
      for (const [k, path] of paths.entries()) {
        const jp = `${sjp}.paths[${k}]`, lanes = recordMembers(path, 'lanes'), cells = recordMembers(path, 'cells')
        const laneKeys = new Set(lanes.map(row => row.key)), selected = Array.isArray(path.path_steps) ? path.path_steps.filter((key): key is string => typeof key === 'string') : []
        unique(lanes, `${jp}.lanes`)
        const seenSteps = new Set<string>()
        for (const [n, key] of selected.entries()) {
          if (!validKey(key)) continue
          if (seenSteps.has(key)) {
            if (!errors.some(issue => issue.path === `${jp}.path_steps[${n}]`)) error(`${jp}.path_steps[${n}]`, 'Use each step once in this path.')
          }
          else if (!stepKeys.has(key)) error(`${jp}.path_steps[${n}]`, 'Choose a step belonging to this scenario.')
          seenSteps.add(key)
        }
        if (!('cells' in path)) error(jp, 'Add the cells array to this path.')
        const cellCoordinate = (cell: Row) => JSON.stringify([cell.lane, cell.step])
        const pairs = new Set<string>()
        for (const [n, cell] of cells.entries()) {
          const cjp = `${jp}.cells[${n}]`, key = cellCoordinate(cell)
          if (pairs.has(key)) error(cjp, 'Keep one cell at each lane and step intersection.')
          pairs.add(key)
          if (validKey(cell.lane) && !laneKeys.has(cell.lane)) error(`${cjp}.lane`, 'Choose a lane on this path.')
          if (validKey(cell.step) && !stepKeys.has(cell.step)) error(`${cjp}.step`, 'Choose a step in this scenario.')
          else if (validKey(cell.step) && !selected.includes(cell.step)) error(`${cjp}.step`, 'Add this step to the path before placing a cell in it.')
          const names = recordMembers(cell, 'touchpoints').filter(t => isRow(t.name)).map(t => JSON.stringify(Object.entries(object(t.name)).sort()))
          if (new Set(names).size !== names.length) error(`${cjp}.touchpoints`, 'Place the same touchpoint only once on a cell.')
        }
        const pathKey = validKey(path.key) ? path.key : null
        const listed = JSON.stringify([scenarioKey, pathKey])
        if (pathKey !== null && !linkCells.has(listed)) linkCells.set(listed, new Set(cells.filter(cell => validKey(cell.lane) && validKey(cell.step)).map(cellCoordinate)))
        for (const [n, edge] of recordMembers(path, 'dependencies').entries()) {
          const ejp = `${jp}.dependencies[${n}]`
          const source = wellFormed(edge.source, `${ejp}.source`), target = wellFormed(edge.target, `${ejp}.target`)
          if (source && target && pathKey !== null) linkEdges.push({ jp: ejp, listing: [scenarioKey, pathKey], source: edge.source as Row, target: edge.target as Row, kind: ['leads_to', 'enables'].includes(edge.kind as string) ? edge.kind : 'leads_to' })
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
      if (scenarioKey !== null && !scenarioPaths.has(scenarioKey)) scenarioPaths.set(scenarioKey, new Set(paths.map(row => row.key).filter((key): key is string => typeof key === 'string')))
    }
  }
  const seenLinks = new Set<string>()
  for (const edge of linkEdges) {
    const ends = (['source', 'target'] as const).map(name => {
      const ref = edge[name], scenario = 'path' in ref ? (ref.scenario as string | undefined) ?? edge.listing[0] : edge.listing[0]
      return { name, ref, scenario, path: 'path' in ref ? ref.path as string : edge.listing[1], cell: cellCoordinateOf(ref) }
    })
    let resolved = true
    for (const end of ends) {
      const ejp = `${edge.jp}.${end.name}`
      if (end.scenario === null || !scenarioPaths.has(end.scenario)) { error(`${ejp}.scenario`, 'Choose a scenario of this service for this dependency end.'); resolved = false }
      else if (!scenarioPaths.get(end.scenario)!.has(end.path)) { error(`${ejp}.path`, 'Choose a path of that scenario for this dependency end.'); resolved = false }
      else if (!linkCells.get(JSON.stringify([end.scenario, end.path]))?.has(end.cell)) {
        error(ejp, 'path' in end.ref
          ? 'Choose a cell that exists on the path this end names.'
          : 'Choose a cell that exists on this path, or name the path (and scenario) of a cell elsewhere in this service.')
        resolved = false
      }
    }
    if (!resolved) continue
    const [source, target] = ends.map(end => JSON.stringify([end.scenario, end.path, end.cell]))
    const listing = JSON.stringify(edge.listing)
    if (source === target) { error(edge.jp, 'A dependency cannot point a cell to itself; connect two different cells.'); continue }
    if (![ends[0], ends[1]].some(end => JSON.stringify([end.scenario, end.path]) === listing)) { error(edge.jp, 'List this dependency on the path of one of its cells.'); continue }
    const identity = JSON.stringify([source, target, edge.kind])
    if (seenLinks.has(identity)) error(edge.jp, 'Keep one dependency of each kind between these cells.')
    seenLinks.add(identity)
  }
  const registryNames = new Set<string>()
  for (const [i, entry] of recordMembers(service, 'touchpoints').entries()) for (const [locale, name] of Object.entries(isRow(entry.name) ? entry.name : {})) {
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
