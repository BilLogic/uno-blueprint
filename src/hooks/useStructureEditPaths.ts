import { useEffect, useRef, useState } from 'react'
import { useStructurePaths } from './useStructurePaths'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { changeStepPath, reorderLanes, reorderSteps } from '@/lib/authoringRpc'
import { executeRevert } from '@/lib/revertChange'
import { forgetChange, type SessionEntry } from '@/lib/authoringSession'
import { reportWriteSuccess } from '@/lib/writeFailures'
import { errorMessage } from '@/lib/utils'
import { toAuthoringError } from '@/lib/authoringErrors'
import type {
  OrderItem,
  OrderPath,
  PathOrder,
} from '@/components/blueprint/PathOrderSection'

type SavedCell = { id: string; updated_at: string }
type Removal = {
  path: OrderPath
  before: PathOrder[]
  next: PathOrder[]
  cells: SavedCell[]
}
const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id, index) => id === b[index])

/** Draft the drag locally; commit only on drop, key move, tick or untick. */
export function useStructureEditPaths(input: {
  kind: 'step' | 'lane'
  item: OrderItem
  scenarioId: string
  pathId?: string
}) {
  const { kind, item, scenarioId, pathId } = input
  const { client } = useSupabase()
  const result = useStructurePaths({
    kind,
    scenarioId,
    pathId,
    onlyPath: kind === 'lane' && Boolean(pathId),
  })
  const available = result.status === 'ready' ? result.data : []
  const live =
    kind === 'lane'
      ? available.filter((path) => path.items.some((row) => row.id === item.id))
      : available
  const [model, setModel] = useState({
    signature: '',
    readAt: undefined as number | undefined,
    baseline: new Map<string, OrderPath>(),
    orders: new Map<string, string[]>(),
    persisted: [] as PathOrder[],
  })
  const [value, setValue] = useState<PathOrder[]>([])
  const signature = JSON.stringify(live)
  const [phase, setPhase] = useState<
    'idle' | 'dragging' | 'saving' | 'confirm'
  >('idle')
  const busy = phase === 'saving'
  const inFlight = useRef(false)
  const [pending, setPending] = useState<Removal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const paths = live.map((path) => ({
    ...path,
    items: model.baseline.get(path.id)?.items ?? path.items,
  }))
  // A fresh authoritative read reconciles only at the idle boundary. Reads
  // arriving during a drag, save or confirmation wait for that interaction.
  useEffect(() => {
    if (
      result.status !== 'ready' ||
      phase !== 'idle' ||
      (signature === model.signature && result.readAt === model.readAt)
    )
      return
    const baseline = new Map(model.baseline)
    const orders = new Map<string, string[]>()
    for (const path of live) {
      const old = baseline.get(path.id)
      const kept =
        old?.items
          .filter(
            (row) =>
              row.id === item.id ||
              path.items.some((current) => current.id === row.id),
          )
          .map(
            (row) => path.items.find((current) => current.id === row.id) ?? row,
          ) ?? []
      baseline.set(path.id, {
        ...path,
        items: [
          ...kept,
          ...path.items.filter(
            (row) => !kept.some((current) => current.id === row.id),
          ),
        ],
      })
      orders.set(
        path.id,
        path.items.map((row) => row.id),
      )
    }
    const next = live
      .filter((path) => path.items.some((row) => row.id === item.id))
      .map((path) => ({
        pathId: path.id,
        order: path.items.map((row) => row.id),
        moved: (
          value.find((entry) => entry.pathId === path.id)?.moved ?? []
        ).filter(
          (id) =>
            path.items.findIndex((row) => row.id === id) !==
            baseline.get(path.id)!.items.findIndex((row) => row.id === id),
        ),
      }))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize the completed external query at the idle boundary, including structurally shared Undo reads
    setModel({
      signature,
      readAt: result.readAt,
      baseline,
      orders,
      persisted: next,
    })
    setValue(next)
  }, [result, phase, signature, model, live, item.id, value])
  const defaultOrder = (path: OrderPath) => {
    const order = (
      model.orders.get(path.id) ?? path.items.map((row) => row.id)
    ).filter((id) => id !== item.id)
    const origin = model.persisted.find((entry) => entry.pathId === pathId)
    const index = origin?.order.indexOf(item.id) ?? -1
    const previous = origin?.order[index - 1]
    const anchor = previous ? order.indexOf(previous) : -1
    order.splice(anchor >= 0 ? anchor + 1 : order.length, 0, item.id)
    return order
  }
  const announce = (entry: SessionEntry, message: string) => {
    if (client && entry.revert)
      reportWriteSuccess(message, entry.id, async () => {
        await executeRevert(client, entry)
        forgetChange(entry.id)
      })
  }
  const readRemovalCells = async (targetPath: string): Promise<SavedCell[]> => {
    const { data, error } = await client!
      .from('cells')
      .select('id,updated_at')
      .eq('path_id', targetPath)
      .eq('step_id', item.id)
      .order('id')
    if (error) throw error
    return data
  }
  const saveMembership = async (
    path: OrderPath,
    added: PathOrder | undefined,
    before: PathOrder[],
    order: string[],
    confirmedCells?: SavedCell[],
  ) => {
    const entry = await changeStepPath(client!, {
      stepId: item.id,
      pathId: path.id,
      present: Boolean(added),
      atPosition: added?.order.indexOf(item.id) ?? 0,
      expectedIds: order,
      expectedPathIds: before.map((row) => row.pathId).sort(),
      confirmedCells,
    })
    announce(
      entry,
      `${added ? 'Added' : 'Removed'} the ${item.name} step ${
        added ? 'to' : 'from'
      } ${path.name}`,
    )
    return added ? added.order : order.filter((id) => id !== item.id)
  }
  const saveOrder = async (changed: PathOrder, prior: PathOrder) => {
    const entry = await (kind === 'step' ? reorderSteps : reorderLanes)(
      client!,
      changed.pathId,
      changed.order,
      prior.order,
    )
    announce(
      entry,
      `Saved the ${kind} order on ${
        live.find((path) => path.id === changed.pathId)!.name
      }`,
    )
    return changed.order
  }
  const save = async (
    next: PathOrder[],
    before: PathOrder[],
    confirmedCells?: SavedCell[],
  ) => {
    if (!client || inFlight.current) {
      setValue(model.persisted)
      return
    }
    inFlight.current = true
    setPhase('saving')
    setError(null)
    try {
      const removed = before.find(
        (entry) => !next.some((row) => row.pathId === entry.pathId),
      )
      const added = next.find(
        (entry) => !before.some((row) => row.pathId === entry.pathId),
      )
      if (removed || added) {
        const target = removed ?? added!
        const path = live.find((path) => path.id === target.pathId)!
        if (removed && !confirmedCells) {
          const cells = await readRemovalCells(path.id)
          if (cells.length) {
            setValue(before)
            setPending({ path, before, next, cells })
            setPhase('confirm')
            return
          }
        }
        const order =
          before.find((entry) => entry.pathId === path.id)?.order ??
          model.orders.get(path.id) ??
          path.items.map((row) => row.id)
        const savedOrder = await saveMembership(
          path,
          added,
          before,
          order,
          confirmedCells,
        )
        setModel((current) => ({
          ...current,
          orders: new Map(current.orders).set(path.id, savedOrder),
        }))
      } else {
        const changed = next.find((entry) => {
          const prior = before.find((row) => row.pathId === entry.pathId)
          return prior && !sameOrder(entry.order, prior.order)
        })
        if (!changed) return
        const prior = before.find((row) => row.pathId === changed.pathId)!
        const savedOrder = await saveOrder(changed, prior)
        setModel((current) => ({
          ...current,
          orders: new Map(current.orders).set(changed.pathId, savedOrder),
        }))
      }
      setModel((current) => ({ ...current, persisted: next }))
      setValue(next)
      setPending(null)
    } catch (cause) {
      if (pending) setPhase('confirm')
      setValue(before)
      setError(
        toAuthoringError(
          cause instanceof Error ? cause : new Error(errorMessage(cause)),
        ).message,
      )
    } finally {
      inFlight.current = false
      setPhase((current) => (current === 'confirm' ? current : 'idle'))
    }
  }
  return {
    paths,
    value,
    onChange: setValue,
    defaultOrder,
    busy,
    pending,
    error,
    status: result.status,
    setPreviewing: (dragging: boolean) =>
      setPhase((current) =>
        current === 'saving' || current === 'confirm'
          ? current
          : dragging
          ? 'dragging'
          : 'idle',
      ),
    loadError: result.status === 'error' ? result.message : null,
    commit: (next: PathOrder[]) => {
      void save(next, model.persisted)
    },
    confirm: () => {
      if (pending) void save(pending.next, pending.before, pending.cells)
    },
    cancel: () => {
      setPending(null)
      setPhase('idle')
      setValue(model.persisted)
      setError(null)
    },
  }
}
