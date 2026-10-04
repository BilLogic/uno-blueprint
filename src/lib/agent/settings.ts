import { useSyncExternalStore } from 'react'
import { storageKey } from '@/lib/storageNamespace'

/**
 * BYO-key agent settings. Keys live in localStorage and nowhere else — not
 * the repo, not the bundle, not a server env. A browser-held key is readable
 * by anyone with devtools on this machine; the settings UI says so in those
 * words rather than implying a safety it does not have.
 */

export type AgentProviderId = 'google' | 'anthropic' | 'openai'

export const AGENT_PROVIDERS: Array<{ id: AgentProviderId; label: string }> = [
  { id: 'google', label: 'Google Gemini' },
  { id: 'anthropic', label: 'Anthropic Claude' },
  { id: 'openai', label: 'OpenAI' },
]

/**
 * The model list shown BEFORE a key is saved, and nothing else.
 *
 * With a key, the dropdown lists the provider's own list-models endpoint
 * (`providers/models.ts`), so it is current by construction. This list is what
 * a person sees while deciding whether the feature is worth a key — which is
 * the worst possible place for a name a year out of date, because it is read
 * as what this app can do rather than as a default someone forgot to edit.
 *
 * THE POLICY, so the next refresh is a decision already made:
 *
 *   Three entries per provider, newest first. The first is `DEFAULT_MODELS`,
 *   so it must be a model the provider currently serves and a sane default for
 *   an in-browser assistant — not the largest model on the price list.
 *
 *   No previews, no dated snapshots, no aliases the provider may repoint. A
 *   preview disappears; a dated snapshot retires; an alias makes two people
 *   running "the same model" run different ones.
 *
 *   Verified by CALLING each provider's list-models endpoint on the day of the
 *   change, not by recollection and not from a docs page — an id can be
 *   published and still 404 for a given account.
 *
 * Verified 2026-09-11. Google: called, `gemini-3.8-flash` is the newest
 * generally available chat model. Anthropic: the three tiers a person chooses
 * between; the list is deliberately not every id the account can reach.
 * OpenAI: taken from the published model docs and NOT confirmed against
 * `/v1/models`, because no OpenAI key was available — the one entry here that
 * is a claim rather than a measurement.
 */
export const MODEL_OPTIONS: Record<AgentProviderId, string[]> = {
  google: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'],
  anthropic: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  openai: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
}

export const DEFAULT_MODELS: Record<AgentProviderId, string> = {
  google: MODEL_OPTIONS.google[0],
  anthropic: MODEL_OPTIONS.anthropic[0],
  openai: MODEL_OPTIONS.openai[0],
}

/*
 * There is no search-scope setting. The agent reads the active service — the
 * one on screen — when a question names none, and a caller who wants another,
 * or every service, names it in the per-call `service` argument — so there is
 * nothing left for a stored preference to decide. A value left under `serviceScope` in a browser from
 * before is simply never read.
 */

export type AgentSettings = {
  provider: AgentProviderId
  /** Model override per provider; empty string = the provider's default. */
  models: Partial<Record<AgentProviderId, string>>
  keys: Partial<Record<AgentProviderId, string>>
}

const STORAGE_KEY = storageKey('agent-settings')

const EMPTY: AgentSettings = {
  provider: 'google',
  models: {},
  keys: {},
}

/**
 * A provider id this build still has, or the default.
 *
 * The stored id is whatever was chosen on the day it was saved, and it sits in
 * that browser for as long as the browser lasts — so the build reading it is
 * rarely the build that wrote it. Retiring a provider leaves browsers holding
 * its id WITH a key saved beside it, which is what makes the id reach the
 * loop: the no-key hint never fires, and the adapter map is indexed with a
 * name it has no entry for, so the send dereferences `undefined`. Checked
 * against `AGENT_PROVIDERS`, the list the settings popover offers, so the two
 * cannot disagree about what this build supports.
 */
function storedProvider(value: unknown): AgentProviderId {
  return AGENT_PROVIDERS.some((provider) => provider.id === value)
    ? (value as AgentProviderId)
    : EMPTY.provider
}

/**
 * A stored per-provider map of strings — the model overrides, or the keys.
 *
 * TWO QUESTIONS, and they are not the same one. What SHAPE is this (a map of
 * strings, checked here), and WHOSE entries may it keep (every id it holds,
 * including one this build does not declare)? The second is deliberate: a
 * provider can come back, or be reinstated by a host, and a person who saved a
 * key under it should not lose the key because the CHOICE moved — `provider`
 * above is the one field a retired id breaks. The first is a fact about JSON
 * another release wrote, which is the claim no compiler here can keep.
 */
function storedStrings(
  value: unknown,
): Partial<Record<AgentProviderId, string>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [AgentProviderId, string] =>
        typeof entry[1] === 'string',
    ),
  )
}

function read(): AgentSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return EMPTY
    const record = parsed as Record<string, unknown>
    return {
      provider: storedProvider(record.provider),
      models: storedStrings(record.models),
      keys: storedStrings(record.keys),
    }
  } catch {
    return EMPTY
  }
}

// Snapshot cached so useSyncExternalStore sees a stable reference between
// writes (a fresh object per getSnapshot call would loop the render).
let snapshot: AgentSettings = typeof window === 'undefined' ? EMPTY : read()
const listeners = new Set<() => void>()

function write(next: AgentSettings) {
  snapshot = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota / private-browsing failures degrade to session-only settings.
  }
  listeners.forEach((listener) => listener())
}

export function useAgentSettings(): AgentSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => snapshot,
  )
}

export function saveAgentSettings(patch: Partial<AgentSettings>) {
  write({
    ...snapshot,
    ...patch,
    models: { ...snapshot.models, ...patch.models },
    keys: { ...snapshot.keys, ...patch.keys },
  })
}

export function modelFor(settings: AgentSettings): string {
  return settings.models[settings.provider] || DEFAULT_MODELS[settings.provider]
}

export function hasKey(settings: AgentSettings): boolean {
  return Boolean(settings.keys[settings.provider])
}

/**
 * "Show the key settings" as a callable, so the chat view's no-key hint can
 * ask without knowing which layout is mounted. The desktop rail's ⚙ popover
 * holds this flag as its open state; the phone shell, which has no rail,
 * answers by opening its drawer on Settings and clears the flag at once.
 * Lives here (not a component file) so fast refresh keeps working there.
 */
let settingsOpenFlag = false
const settingsOpenListeners = new Set<() => void>()

export function openAgentSettings(): void {
  settingsOpenFlag = true
  settingsOpenListeners.forEach((listener) => listener())
}

export function setAgentSettingsOpen(next: boolean): void {
  settingsOpenFlag = next
  settingsOpenListeners.forEach((listener) => listener())
}

/**
 * Call `handler` whenever the key settings are asked for — now, if they
 * already are, and on every later ask. For a layout that answers the ask
 * with a surface of its own rather than holding the flag as its open state.
 */
export function onAgentSettingsAsked(handler: () => void): () => void {
  const listener = () => {
    if (settingsOpenFlag) handler()
  }
  settingsOpenListeners.add(listener)
  listener()
  return () => {
    settingsOpenListeners.delete(listener)
  }
}

export function useAgentSettingsOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      settingsOpenListeners.add(listener)
      return () => settingsOpenListeners.delete(listener)
    },
    () => settingsOpenFlag,
  )
}
