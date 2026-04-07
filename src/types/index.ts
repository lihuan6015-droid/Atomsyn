/**
 * Single source of truth for all data shapes in CCL PM Tool.
 * These types must mirror the JSON Schemas in /skills/schemas/*.schema.json
 * and the file structure under /data.
 */

// =============================================================================
// Framework — the "skeleton" / outer structure (e.g. 24-Step Innovation)
// =============================================================================

export type StageColumnId =
  | 'discover'
  | 'define'
  | 'ideate'
  | 'develop'
  | 'validate'
  | 'evolve'
  | string // future skeletons can introduce new column ids

export interface StageColumnHeader {
  id: StageColumnId
  name: string // e.g. "Discover 发现"
  color: string // CSS hex
}

export interface FrameworkCell {
  stepNumber: number
  column: StageColumnId
  row: number
  name: string
  nameEn: string
  tagline?: string
  atomCategoryPath: string // e.g. "product-innovation-24/02-voc"
  featured?: boolean
}

export interface Framework {
  id: string
  schemaVersion: 1
  name: string
  nameEn: string
  source?: string
  version?: string
  description?: string
  layoutType: 'matrix'
  matrix: {
    rows: number
    columns: number
    columnHeaders: StageColumnHeader[]
    cells: FrameworkCell[]
  }
  createdAt: string
  updatedAt: string
}

// =============================================================================
// Atom — a single methodology/knowledge unit
// =============================================================================

export interface AtomBookmark {
  id: string
  type: 'link' | 'text'
  title: string
  url?: string
  content?: string
  note?: string
  addedAt: string
}

export interface AtomExample {
  title: string
  content: string
}

export interface AtomStats {
  usedInProjects: string[]
  lastUsedAt?: string
  useCount: number
}

export type AtomRelationType = 'child' | 'sibling' | 'parent'

export interface Atom {
  id: string
  schemaVersion: 1
  name: string
  nameEn?: string
  frameworkId: string
  cellId: number
  tags: string[]
  parentAtomId?: string
  relationType?: AtomRelationType

  coreIdea: string
  whenToUse: string
  keySteps?: string[]
  aiSkillPrompt: string
  example?: AtomExample
  bookmarks: AtomBookmark[]
  stats: AtomStats

  createdAt: string
  updatedAt: string
}

// =============================================================================
// Project — Playground entity (real-world application of methodologies)
// =============================================================================

export type InnovationStage =
  | 'ideation'
  | 'discover'
  | 'define'
  | 'ideate'
  | 'develop'
  | 'validate'
  | 'evolve'
  | 'archived'

export interface PinnedAtom {
  atomId: string
  pinnedAt: string
  note?: string
}

export interface Project {
  id: string
  schemaVersion: 1
  name: string
  slug: string
  description?: string
  status: string // free-form tag (POC, MVP, Live, etc.)
  innovationStage: InnovationStage
  stageHistory: InnovationStage[]
  pinnedAtoms: PinnedAtom[]
  createdAt: string
  updatedAt: string
}

// =============================================================================
// Practice — a project-level execution record bound to an atom
// =============================================================================

export type PracticeStatus = 'in-progress' | 'completed' | 'abandoned'

export interface PracticeArtifact {
  type: 'text' | 'link'
  title?: string
  content?: string
  url?: string
}

export interface Practice {
  id: string
  schemaVersion: 1
  projectId: string
  atomId: string
  title: string
  context?: string
  executionSummary?: string
  keyInsights?: string[]
  artifacts?: PracticeArtifact[]
  whatWorked?: string
  whatFailed?: string
  status: PracticeStatus
  createdAt: string
  updatedAt: string
}

// =============================================================================
// Knowledge Index — auto-generated lightweight summary for Copilot/Spotlight
// =============================================================================

export interface IndexedAtom {
  id: string
  name: string
  nameEn?: string
  frameworkId: string
  cellId: number
  cellName: string
  tags: string[]
  tagline: string
  whenToUse: string
  path: string
}

export interface IndexedFramework {
  id: string
  name: string
  atomCount: number
}

export interface IndexedProject {
  id: string
  name: string
  innovationStage: InnovationStage
  atomsUsed: string[]
}

export interface KnowledgeIndex {
  generatedAt: string
  version: 1
  frameworks: IndexedFramework[]
  atoms: IndexedAtom[]
  projects: IndexedProject[]
}

// =============================================================================
// Usage Log — append-only event stream feeding Growth tab metrics
// =============================================================================

export type UsageEventType =
  | 'atom-open'
  | 'atom-search'
  | 'atom-prompt-copy'
  | 'atom-prompt-copy-filled'
  | 'atom-create'
  | 'atom-edit'
  | 'practice-create'
  | 'project-create'
  | 'copilot-query'

export interface UsageEvent {
  ts: string // ISO timestamp
  type: UsageEventType
  atomId?: string
  projectId?: string
  practiceId?: string
  meta?: Record<string, unknown>
}

// =============================================================================
// Psychological Self-Check (anti-anxiety metric)
// =============================================================================

export type ThreeWayAnswer = 'down' | 'same' | 'up'
export type ConfidenceAnswer = 'morePanic' | 'same' | 'moreCertain'

export interface PsychologicalEntry {
  month: string // e.g. "2026-04"
  forgettingFrequency: ThreeWayAnswer
  jobConfidence: ThreeWayAnswer
  withoutToolFeeling: ConfidenceAnswer
  submittedAt: string
}

// =============================================================================
// LLM / Copilot config
// =============================================================================

export type LLMProvider = 'anthropic' | 'openai' | 'custom'

export interface LLMProviderConfig {
  enabled: boolean
  model: string
  baseUrl?: string
  maxTokens?: number
  temperature?: number
}

export interface LLMConfig {
  activeProvider: LLMProvider
  providers: Record<LLMProvider, LLMProviderConfig>
  copilot: {
    systemPromptRef: string
    maxContextAtoms: number
    enableAutoNavigate: boolean
    logConversations: boolean
  }
}
