/**
 * Single source of truth for all data shapes in Atomsyn.
 * These types must mirror the JSON Schemas in /skills/schemas/*.schema.json
 * and the file structure under /data.
 */

// =============================================================================
// V2.0 M0 · Legacy ccl-atlas → Atomsyn migration
// =============================================================================

export interface LegacyCheckResult {
  found: boolean
  path?: string
  entryCount: number
  configFound: boolean
  configPath?: string
}

export interface MigrationResult {
  ok: boolean
  migratedFiles: number
  skippedFiles: number
  backupPath: string
  configBackupPath?: string
}

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
// Atom — a single knowledge unit. V1.5 introduces the `kind` discriminator
// and splits atoms into three variants: methodology (V1 carry-over),
// experience (agent-crystallized), and skill-inventory (local skill catalog).
//
// The canonical `Atom` alias = `MethodologyAtom` for V1 backward compatibility.
// All existing code importing `Atom` continues to work unchanged after
// scripts/migrate-v1-to-v1.5.mjs backfills the `kind: 'methodology'` field
// into existing JSON files.
//
// For code that handles any kind (e.g. agent feed, search, index), use
// `AtomAny` (the discriminated union) + the type guards at the bottom.
// =============================================================================

export type AtomKind = 'methodology' | 'experience' | 'skill-inventory'

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

/**
 * Shared stats across all atom kinds.
 * V1.5 adds: invokedByAgent, userDemoted, locked (for Gap-5 / Gap-6).
 * V2.0 M2 adds: aiInvokeCount, humanViewCount (split from useCount).
 */
export interface AtomStats {
  usedInProjects: string[]
  lastUsedAt?: string
  useCount: number
  /** V2.0 · incremented when atomsyn-cli read returns this atom (agent consumption). */
  aiInvokeCount: number
  /** V2.0 · incremented when user opens atom detail in GUI (human viewing). */
  humanViewCount: number
  /** V1.5 · count of invocations by each agent (key = agent name). */
  invokedByAgent?: Record<string, number>
  /** V1.5 · T-6.2 calibration. Down-weights this atom in atomsyn-read ranking. */
  userDemoted?: boolean
  /** V1.5 · T-6.2 calibration. Blocks agent write operations from mutating this atom. */
  locked?: boolean
}

export type AtomRelationType = 'child' | 'sibling' | 'parent'

// ----- V1.5 atom variants --------------------------------------------------

/**
 * MethodologyAtom · the V1 atom carried forward into V1.5 with the `kind` tag.
 * Structured around framework + cell positioning. Used in the 24-Step matrix,
 * UI/UX patterns, Agent development, and any future curated skeleton.
 */
export interface MethodologyAtom {
  id: string
  schemaVersion: 1
  kind: 'methodology'
  name: string
  nameEn?: string
  frameworkId: string
  cellId: number
  tags: string[]
  parentAtomId?: string
  relationType?: AtomRelationType
  /** V2.0 M3: role dimension for unified skeleton grouping */
  role?: string

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

/**
 * Back-compat alias. All V1 code that imports { Atom } continues to work.
 * New code handling multiple kinds should import { AtomAny } instead.
 */
export type Atom = MethodologyAtom

/**
 * ExperienceAtom · V1.5 new. Crystallized from an AI session via atlas-write.
 * Does NOT require framework/cell positioning — it lives in loose taxonomy.
 * Consumed primarily by atlas-read to give agents contextual memory.
 */
export interface ExperienceAtomCodeArtifact {
  language: string
  code: string
  filename?: string
  description?: string
}

export interface ExperienceAtom {
  id: string
  schemaVersion: 1
  kind: 'experience'
  name: string
  nameEn?: string
  tags: string[]
  sourceAgent: string // 'claude-code' | 'cursor' | 'codex' | 'trae' | 'user' | string
  /** V2.0 M3: role dimension for unified skeleton grouping */
  role?: string
  situation?: string
  activity?: string
  insight_type?: string
  subKind?: 'crystallized'
  sourceContext: string
  insight: string
  keySteps?: string[]
  codeArtifacts?: ExperienceAtomCodeArtifact[]
  screenshots?: string[]
  relatedFrameworks?: string[]
  relatedAtoms?: string[]
  sessionId?: string
  stats: AtomStats
  createdAt: string
  updatedAt: string
}

/**
 * SkillInventoryItem · V1.5 new. A catalog entry for a locally-installed
 * AI skill (Claude / Cursor / Codex / Trae). Serves E6/E7 sovereignty Jobs.
 * NOTE: These are deliberately NOT injected into atlas-read context —
 * the host AI coding tools already discover and load their own skills.
 */
export type SkillToolName =
  | 'claude'
  | 'cursor'
  | 'codex'
  | 'trae'
  | 'openclaw'
  | 'opencode'
  | 'custom'

export type SkillUserMarkedState =
  | 'favorite'
  | 'forgotten'
  | 'unused'
  | 'archived'

export interface SkillInventoryItem {
  id: string
  schemaVersion: 1
  kind: 'skill-inventory'
  name: string
  nameEn?: string
  tags: string[]
  localPath: string
  toolName: SkillToolName
  frontmatter: Record<string, unknown>
  rawDescription: string
  aiGeneratedSummary?: string
  aiGeneratedTags?: string[]
  typicalScenarios?: string[]
  triggerKeywords?: string[]
  userMarked?: SkillUserMarkedState
  fileMtime: string
  fileHash?: string
  stats: AtomStats
  createdAt: string
  updatedAt: string
}

// =============================================================================
// V2.0 M2 · Experience Fragment — ingested via CLI or GUI quick-ingest
// =============================================================================

/** Semi-closed enum for insight classification. New values require insightColors.ts update. */
export type InsightType =
  | '反直觉'
  | '方法验证'
  | '方法证伪'
  | '情绪复盘'
  | '关系观察'
  | '时机判断'
  | '原则提炼'
  | '纯好奇'
  | string // open for future extension

export interface ExperienceFragment {
  id: string
  schemaVersion: 1
  kind: 'experience'
  subKind: 'fragment'
  title: string
  summary: string
  /** Dimension 1: who was I (role) */
  role: string
  /** Dimension 2: what context (situation) */
  situation: string
  /** Dimension 3: what I was doing (activity) */
  activity: string
  /** Dimension 4: type of learning (semi-closed enum) */
  insight_type: InsightType
  tags: string[]
  /** Original raw text from ingest */
  rawContent: string
  /** Methodology atoms this fragment links to (semantic alignment) */
  linked_methodologies: string[]
  /** LLM classification confidence (0-1) */
  confidence: number
  context?: {
    domain_hint?: string
    source?: 'cli' | 'gui' | 'agent'
    ingestModel?: string
  }
  /** True for emotion retrospectives — hidden from default skill retrieval */
  private?: boolean
  stats: AtomStats
  createdAt: string
  updatedAt: string
}

/**
 * Discriminated union of all atom kinds. Use this for code that needs to
 * handle any variant (indexing, search, feed rendering, CLI serialization).
 */
export type AtomAny = MethodologyAtom | ExperienceAtom | ExperienceFragment | SkillInventoryItem

// ----- Type guards (prefer over direct `kind` checks for TS narrowing) ----

export function isMethodologyAtom(atom: AtomAny): atom is MethodologyAtom {
  return atom.kind === 'methodology'
}

export function isExperienceAtom(atom: AtomAny): atom is ExperienceAtom {
  return atom.kind === 'experience' && (atom as any).subKind !== 'fragment'
}

export function isExperienceFragment(atom: AtomAny): atom is ExperienceFragment {
  return atom.kind === 'experience' && (atom as any).subKind === 'fragment'
}

export function isSkillInventoryItem(atom: AtomAny): atom is SkillInventoryItem {
  return atom.kind === 'skill-inventory'
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

/**
 * V1.5 · Lightweight projection of an ExperienceAtom for the knowledge index.
 * Lets Copilot/Spotlight reference experience atoms without loading full insight.
 */
export interface IndexedExperience {
  id: string
  name: string
  tags: string[]
  sourceAgent: string
  sourceContext: string
  insightExcerpt: string
  createdAt: string
  updatedAt: string
  path: string
}

/**
 * V1.5 · Lightweight projection of a SkillInventoryItem for the knowledge index.
 */
export interface IndexedSkill {
  id: string
  name: string
  toolName: string
  rawDescription: string
  aiGeneratedSummary?: string
  tags: string[]
  localPath: string
  updatedAt: string
}

export interface KnowledgeIndex {
  generatedAt: string
  version: 1
  frameworks: IndexedFramework[]
  atoms: IndexedAtom[]
  projects: IndexedProject[]
  /** V1.5 · progressive disclosure: experience atoms (agent-crystallized). */
  experiences: IndexedExperience[]
  /** V1.5 · progressive disclosure: local skill catalog. */
  skillInventory: IndexedSkill[]
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

// =============================================================================
// V1.5 · Dual update channels (seed methodology + app version)
// =============================================================================

export interface SeedDiff {
  added: string[]
  updated: string[]
  userModifiedKept: string[]
  removedFromSeed: string[]
  unchanged: number
}

export interface SeedChangelogEntry {
  version: string
  date: string
  notes: string[]
}

export interface SeedCheckResult {
  seedVersion: string
  installedVersion: string | null
  hasUpdate: boolean
  dismissed: boolean
  diff?: SeedDiff
  changelog?: SeedChangelogEntry[]
  reason?: string
  lastSyncedAt?: string
}

export interface AppVersionResult {
  current: string
  latest: string | null
  hasUpdate: boolean
  reason?: string
  releaseUrl?: string
  changelogUrl?: string
}
