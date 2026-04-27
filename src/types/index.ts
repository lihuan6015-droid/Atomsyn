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

// ----- List layout (V2.1) ----------------------------------------------------

export interface FrameworkListCategory {
  id: string
  name: string
  nameEn?: string
  color: string // CSS hex
  description?: string
  tagline?: string
  atomCategoryPath: string // e.g. "ui-ux-patterns/information-architecture"
}

export interface FrameworkListLayout {
  categories: FrameworkListCategory[]
}

// ----- Tree layout (V2.1) ----------------------------------------------------

export interface FrameworkTreeNode {
  id: string
  name: string
  nameEn?: string
  color?: string // root nodes should set color; children inherit
  description?: string
  tagline?: string
  atomCategoryPath: string
  children?: FrameworkTreeNode[]
}

export interface FrameworkTreeLayout {
  roots: FrameworkTreeNode[]
}

// ----- Framework (V2.1: matrix | list | tree) --------------------------------

export type FrameworkLayoutType = 'matrix' | 'list' | 'tree'

interface FrameworkBase {
  id: string
  schemaVersion: 1
  name: string
  nameEn?: string
  source?: string
  version?: string
  description?: string
  createdAt: string
  updatedAt: string
}

export type Framework =
  | (FrameworkBase & { layoutType: 'matrix'; matrix: { rows: number; columns: number; columnHeaders: StageColumnHeader[]; cells: FrameworkCell[] } })
  | (FrameworkBase & { layoutType: 'list'; list: FrameworkListLayout })
  | (FrameworkBase & { layoutType: 'tree'; tree: FrameworkTreeLayout })

// ----- Framework helpers (V2.1) ----------------------------------------------

/** Type guard: framework uses matrix layout. */
export function isMatrixFramework(fw: Framework): fw is FrameworkBase & { layoutType: 'matrix'; matrix: { rows: number; columns: number; columnHeaders: StageColumnHeader[]; cells: FrameworkCell[] } } {
  return fw.layoutType === 'matrix'
}

/** Type guard: framework uses list layout. */
export function isListFramework(fw: Framework): fw is FrameworkBase & { layoutType: 'list'; list: FrameworkListLayout } {
  return fw.layoutType === 'list'
}

/** Type guard: framework uses tree layout. */
export function isTreeFramework(fw: Framework): fw is FrameworkBase & { layoutType: 'tree'; tree: FrameworkTreeLayout } {
  return fw.layoutType === 'tree'
}

/** Get the total number of cells/categories/nodes in any framework layout. */
export function getFrameworkNodeCount(fw: Framework): number {
  if (fw.layoutType === 'matrix') return fw.matrix?.cells?.length ?? 0
  if (fw.layoutType === 'list') return fw.list?.categories?.length ?? 0
  if (fw.layoutType === 'tree') {
    let count = 0
    const roots = fw.tree?.roots
    if (!roots || !Array.isArray(roots)) return 0
    function walk(nodes: FrameworkTreeNode[]) { for (const n of nodes) { count++; if (n.children) walk(n.children) } }
    walk(roots)
    return count
  }
  return 0
}

/** Extract all cell/category/node identifiers from any framework layout. */
export function getFrameworkNodeIds(fw: Framework): Array<{ id: string | number; name: string; path: string }> {
  if (fw.layoutType === 'matrix') {
    return (fw.matrix?.cells ?? []).map((c) => ({ id: c.stepNumber, name: c.name, path: c.atomCategoryPath }))
  }
  if (fw.layoutType === 'list') {
    return (fw.list?.categories ?? []).map((c) => ({ id: c.id, name: c.name, path: c.atomCategoryPath }))
  }
  if (fw.layoutType === 'tree') {
    const roots = fw.tree?.roots
    if (!roots || !Array.isArray(roots)) return []
    const result: Array<{ id: string | number; name: string; path: string }> = []
    function walk(nodes: FrameworkTreeNode[]) {
      for (const n of nodes) {
        result.push({ id: n.id, name: n.name, path: n.atomCategoryPath })
        if (n.children) walk(n.children)
      }
    }
    walk(roots)
    return result
  }
  return []
}

// =============================================================================
// Atom — a single knowledge unit. V1.5 introduces the `kind` discriminator
// and splits atoms into three variants: methodology (V1 carry-over),
// experience (agent-crystallized), and skill-inventory (local skill catalog).
// V2.x bootstrap-skill (2026-04) adds a fourth variant: profile (singleton
// meta-cognitive profile per data dir).
//
// The canonical `Atom` alias = `MethodologyAtom` for V1 backward compatibility.
// All existing code importing `Atom` continues to work unchanged after
// scripts/migrate-v1-to-v1.5.mjs backfills the `kind: 'methodology'` field
// into existing JSON files.
//
// For code that handles any kind (e.g. agent feed, search, index), use
// `AtomAny` (the discriminated union) + the type guards at the bottom.
// =============================================================================

export type AtomKind = 'methodology' | 'experience' | 'skill-inventory' | 'profile'

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
  /** V2.x bootstrap-skill · True if this atom was created by atomsyn-cli bootstrap during a batch import session. */
  imported?: boolean
  /** V2.x bootstrap-skill · Source bootstrap session id when imported=true. Null otherwise. */
  bootstrap_session_id?: string | null
}

export type AtomRelationType = 'child' | 'sibling' | 'parent'

/**
 * V2.x cognitive-evolution · Shared evolution fields across atom kinds.
 * All optional. Mirrors the additive fields in atom/experience-atom/experience-fragment schemas.
 *
 * Semantics (enforced by atomsyn-cli, not TS):
 * - `supersededBy` + `archivedAt` are set together by the supersede command.
 * - Once `supersededBy` or `archivedAt` is set, the atom is read-only (update rejected by CLI).
 * - `archive --restore` clears `archivedAt` + `archivedReason`.
 * - `lastAccessedAt` is throttled (only persisted if last update > 1h ago).
 */
export interface AtomEvolutionFields {
  /** ISO 8601 timestamp of last read/find hit. Falls back to createdAt when absent. */
  lastAccessedAt?: string
  /** Single atom id that supersedes this one. */
  supersededBy?: string
  /** Atom ids this atom supersedes (single-direction linked list). */
  supersedes?: string[]
  /** ISO 8601 soft-delete timestamp. */
  archivedAt?: string
  /** Optional rationale captured when archiving. */
  archivedReason?: string
}

// ----- V1.5 atom variants --------------------------------------------------

/**
 * MethodologyAtom · the V1 atom carried forward into V1.5 with the `kind` tag.
 * Structured around framework + cell positioning. Used in the 24-Step matrix,
 * UI/UX patterns, Agent development, and any future curated skeleton.
 */
export interface MethodologyAtom extends AtomEvolutionFields {
  id: string
  schemaVersion: 1
  kind: 'methodology'
  name: string
  nameEn?: string
  frameworkId: string
  /** Cell/category/node identifier. Number for matrix layouts, string for list/tree. */
  cellId: number | string
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

export interface ExperienceAtom extends AtomEvolutionFields {
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

export interface ExperienceFragment extends AtomEvolutionFields {
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
    source?: 'cli' | 'gui' | 'agent' | 'note'
    ingestModel?: string
    /** ID of the source note when crystallized from a note */
    noteId?: string
  }
  /** True for emotion retrospectives — hidden from default skill retrieval */
  private?: boolean
  stats: AtomStats
  createdAt: string
  updatedAt: string
}

// =============================================================================
// V2.x bootstrap-skill (2026-04) · Profile atom — singleton meta-cognitive
// profile per data dir. id MUST be `atom_profile_main`. Historic snapshots
// are kept inline in `previous_versions[]` (new→old) instead of supersede
// chains (D-008 + D-010). See skills/schemas/profile-atom.schema.json.
//
// IMPORTANT: profile MUST NOT use supersededBy / supersedes (D-008). Use
// applyProfileEvolution() in scripts/lib/evolution.mjs to evolve the
// singleton — it pushes prior snapshot into previous_versions[] for you.
//
// v1: read/mentor do NOT consume profile until user calibrates verified=true
// (D-007). The atom still exists in the corpus and can be read by GUI.
// =============================================================================

/** D-008: 5 numeric dimensions, 0-1, plan-tune compatible (same names + semantics). */
export interface ProfilePreferences {
  /** 小步 (0) ↔ 完整 (1) */
  scope_appetite?: number
  /** 谨慎 (0) ↔ 激进 (1) */
  risk_tolerance?: number
  /** 简洁 (0) ↔ 详尽 (1) */
  detail_preference?: number
  /** 咨询 (0) ↔ 委托 (1) */
  autonomy?: number
  /** 速度 (0) ↔ 设计 (1) */
  architecture_care?: number
}

/** Free-form identity fields for human storytelling (not enums). */
export interface ProfileIdentity {
  role?: string
  working_style?: string
  primary_languages?: string[]
  primary_tools?: string[]
  /** Open for forward extension — schema additionalProperties=true. */
  [key: string]: unknown
}

/** D-008 + D-010 · enumerated triggers; mirrors evolution.mjs::VALID_PROFILE_TRIGGERS. */
export type ProfileEvolutionTrigger =
  | 'bootstrap_initial'
  | 'bootstrap_rerun'
  | 'user_calibration'
  | 'agent_evolution'
  | 'restore_previous'

/** Frozen snapshot of the previous top-level fields (pushed onto previous_versions). */
export interface ProfileSnapshot {
  preferences?: ProfilePreferences
  identity?: ProfileIdentity
  knowledge_domains?: string[]
  recurring_patterns?: string[]
  evidence_atom_ids?: string[]
}

export interface ProfileVersionSnapshot {
  version: number
  supersededAt: string
  snapshot: ProfileSnapshot
  trigger: ProfileEvolutionTrigger
  /** Optional metadata about evidence delta — free shape for mentor v2 consumption. */
  evidence_delta?: string[] | Record<string, unknown> | null
}

/**
 * ProfileAtom · V2.x singleton. Extends AtomEvolutionFields for
 * lastAccessedAt / archivedAt / archivedReason, BUT supersededBy /
 * supersedes MUST stay unset (D-008) — use previous_versions[] instead.
 */
export interface ProfileAtom extends AtomEvolutionFields {
  id: string
  schemaVersion: 1
  kind: 'profile'
  name: string
  nameEn?: string
  /**
   * Optional tags. Profile rarely uses tags semantically, but the field is
   * declared so generic atom-list components (KnowledgeCard / SkeletonView)
   * can access `atom.tags` without per-kind narrowing. Default: undefined / [].
   */
  tags?: string[]

  /** D-007: false until user goes through GUI calibration at least once. */
  verified?: boolean
  verifiedAt?: string | null
  /** When the current top-level snapshot was first inferred. Independent of createdAt. */
  inferred_at?: string
  /** Short human summary of what was scanned. Privacy: NOT raw content. */
  source_summary?: string

  identity?: ProfileIdentity
  preferences?: ProfilePreferences
  knowledge_domains?: string[]
  recurring_patterns?: string[]
  evidence_atom_ids?: string[]

  /** D-010: stack of historic profile snapshots, NEW→OLD. */
  previous_versions?: ProfileVersionSnapshot[]

  stats: AtomStats
  createdAt: string
  updatedAt: string
}

/**
 * Discriminated union of all atom kinds. Use this for code that needs to
 * handle any variant (indexing, search, feed rendering, CLI serialization).
 */
export type AtomAny =
  | MethodologyAtom
  | ExperienceAtom
  | ExperienceFragment
  | SkillInventoryItem
  | ProfileAtom

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

export function isProfileAtom(atom: AtomAny): atom is ProfileAtom {
  return atom.kind === 'profile'
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
  cellId: number | string
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

/**
 * V2.x bootstrap-skill · Lightweight projection of the singleton ProfileAtom
 * for the knowledge index. Singleton invariant: `profiles` array length ≤ 1
 * in normal operation; tolerated as array for forward compat / multi-tenant
 * fixtures. GUI / CLI default consumers should pick `profiles[0]`.
 */
export interface IndexedProfile {
  id: string
  name: string
  verified: boolean
  verifiedAt: string | null
  /** Number of historic snapshots in previous_versions[]. Lets GUI badge "v3 / 3 versions". */
  previousVersionsCount: number
  /** Number of evidence atoms backing this profile. Lets cards say "based on N atoms". */
  evidenceCount: number
  updatedAt: string
  path: string
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
  /** V2.x bootstrap-skill · profile singleton bucket (≤ 1 entry). Optional for older indexes. */
  profiles?: IndexedProfile[]
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
  | 'chat-send'

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

// =============================================================================
// V2.0 M6 · Notes module types (re-exported from notes.ts)
// =============================================================================

export type {
  CrystallizeStatus,
  NoteGroup,
  NotesMeta,
  NotesSortOrder,
  NoteMeta,
  Note,
} from './notes'

export { defaultNotesMeta, defaultNoteMeta } from './notes'

// =============================================================================
// V2.1 · Framework coverage statistics (GET /api/frameworks/:id/stats)
// =============================================================================

export interface FrameworkStatsNode {
  nodeId: string | number
  name: string
  methodologyCount: number
  fragmentCount: number
  methodologyIds: string[]
}

export interface FrameworkStatsTotal {
  nodeCount: number
  coveredNodes: number
  totalMethodologies: number
  totalFragments: number
  coveragePercent: number
}

export interface FrameworkStats {
  frameworkId: string
  frameworkName: string
  nodes: FrameworkStatsNode[]
  total: FrameworkStatsTotal
}

// =============================================================================
// V2.1 P1 · Analysis types (GET /api/analysis/*)
// =============================================================================

export interface DimensionAnalysis {
  total: number
  byRole: Record<string, number>
  bySituation: Record<string, number>
  byActivity: Record<string, number>
  byInsightType: Record<string, number>
  crossMatrix: {
    roles: string[]
    situations: string[]
    counts: number[][]
  }
  recency: {
    recent: number   // 30 天内
    moderate: number // 30-90 天
    stale: number    // 90 天+
  }
}

export interface TimelineMonth {
  month: string
  fragmentCount: number
  methodologyCount: number
  topRoles: string[]
  topInsightTypes: string[]
}

export interface TimelineAnalysis {
  months: TimelineMonth[]
  streak: {
    current: number
    longest: number
  }
  velocity: {
    last7d: number
    last30d: number
    trend: 'up' | 'down' | 'stable'
  }
}

export interface CoverageFrameworkEntry {
  id: string
  name: string
  layoutType: string
  nodeCount: number
  coveredNodes: number
  coveragePercent: number
  totalFragments: number
}

export interface CoverageAnalysis {
  frameworks: CoverageFrameworkEntry[]
  overall: {
    totalNodes: number
    coveredNodes: number
    coveragePercent: number
    totalFragments: number
  }
}

export interface UncoveredMethodology {
  frameworkId: string
  frameworkName: string
  nodeId: string | number
  nodeName: string
  methodologyCount: number
}

export interface StaleDimension {
  dimension: 'role' | 'situation' | 'activity' | 'insight_type'
  value: string
  lastSeenAt: string
  daysSince: number
}

export interface GapAnalysis {
  uncoveredMethodologies: UncoveredMethodology[]
  staleDimensions: StaleDimension[]
  theoryPracticeRatio: {
    methodologies: number
    fragments: number
    ratio: number
  }
}

export interface AnalysisSnapshot {
  dimensions: DimensionAnalysis
  timeline: TimelineAnalysis
  coverage: CoverageAnalysis
  gaps: GapAnalysis
}

export interface RadarDimension {
  axis: string        // 维度名称 e.g. "认知深度"
  score: number       // 0-100 分值
  description: string // 一句话解读
}

export interface AnalysisReportResult {
  summary: string
  strengths: string[]
  blindSpots: string[]
  suggestions: string[]
  narrative: string
  radar?: RadarDimension[]  // 认知雷达各维度评分
}

export interface AnalysisReport {
  id: string
  createdAt: string
  timeRange: {
    from: string
    to: string
    label: string
  }
  status: 'generating' | 'completed' | 'failed'
  snapshot: AnalysisSnapshot
  analysis?: AnalysisReportResult
  modelUsed?: string
}

// =============================================================================
// Chat Module — Sessions, Memory, Messages (V2.x)
// =============================================================================

export interface ChatAttachment {
  id: string
  type: 'image' | 'file'
  name: string
  /** base64-encoded data for images, text content for files */
  data: string
  mediaType: string
  size: number
}

export interface ChatMessageRecord {
  id: string
  role: 'user' | 'assistant'
  content: string               // raw text (may contain [[atom:id|name]] markers)
  timestamp: string
  attachments?: ChatAttachment[]
  metadata?: {
    model?: string
    tokens?: number
    skillsUsed?: string[]
  }
}

export interface ChatSession {
  id: string                    // sess_<timestamp>
  title: string                 // auto-generated from first message, user can rename
  createdAt: string
  updatedAt: string
  modelId?: string              // model used to create this session
  messages: ChatMessageRecord[]
  summary?: string              // cached summary for context compression (after 6+ turns)
}

export interface ChatSessionIndexEntry {
  id: string
  title: string
  updatedAt: string
  messageCount: number
  preview: string               // first 80 chars of last message
}

export interface ChatSessionIndex {
  sessions: ChatSessionIndexEntry[]
}

export type MemoryType = 'preference' | 'decision' | 'context'

export interface MemoryEntry {
  id: string                    // mem_<timestamp>
  type: MemoryType
  content: string               // concise one-liner
  source: 'auto' | 'user'      // auto=AI extracted, user=explicitly saved
  sessionId: string
  createdAt: string
}
