/**
 * V2.0 M2 · Single source of truth for insight_type → color mapping.
 *
 * Uses the stage color palette from CLAUDE.md design contract:
 * violet / sky / emerald / amber / orange / pink + neutral variants.
 *
 * Referenced by Fragment Card (M3), QuickIngestDialog, and any future GUI
 * that renders insight_type chips.
 */

import type { InsightType } from '@/types'

export interface InsightColorEntry {
  label: string
  /** Tailwind bg class for light chip */
  bg: string
  /** Tailwind text class */
  text: string
  /** Tailwind dark mode bg */
  darkBg: string
  /** Tailwind dark mode text */
  darkText: string
  /** CSS hex for programmatic use (e.g. chart rendering) */
  hex: string
}

export const INSIGHT_COLORS: Record<string, InsightColorEntry> = {
  '反直觉': {
    label: '反直觉',
    bg: 'bg-violet-500/10',
    text: 'text-violet-700',
    darkBg: 'dark:bg-violet-500/15',
    darkText: 'dark:text-violet-300',
    hex: '#8b5cf6',
  },
  '方法验证': {
    label: '方法验证',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-700',
    darkBg: 'dark:bg-emerald-500/15',
    darkText: 'dark:text-emerald-300',
    hex: '#10b981',
  },
  '方法证伪': {
    label: '方法证伪',
    bg: 'bg-orange-500/10',
    text: 'text-orange-700',
    darkBg: 'dark:bg-orange-500/15',
    darkText: 'dark:text-orange-300',
    hex: '#f97316',
  },
  '情绪复盘': {
    label: '情绪复盘',
    bg: 'bg-pink-500/10',
    text: 'text-pink-700',
    darkBg: 'dark:bg-pink-500/15',
    darkText: 'dark:text-pink-300',
    hex: '#ec4899',
  },
  '关系观察': {
    label: '关系观察',
    bg: 'bg-sky-500/10',
    text: 'text-sky-700',
    darkBg: 'dark:bg-sky-500/15',
    darkText: 'dark:text-sky-300',
    hex: '#0ea5e9',
  },
  '时机判断': {
    label: '时机判断',
    bg: 'bg-amber-500/10',
    text: 'text-amber-700',
    darkBg: 'dark:bg-amber-500/15',
    darkText: 'dark:text-amber-300',
    hex: '#f59e0b',
  },
  '原则提炼': {
    label: '原则提炼',
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-700',
    darkBg: 'dark:bg-indigo-500/15',
    darkText: 'dark:text-indigo-300',
    hex: '#6366f1',
  },
  '纯好奇': {
    label: '纯好奇',
    bg: 'bg-neutral-500/10',
    text: 'text-neutral-600',
    darkBg: 'dark:bg-neutral-500/15',
    darkText: 'dark:text-neutral-400',
    hex: '#737373',
  },
}

/** Get color entry for an insight_type. Falls back to neutral for unknown types. */
export function getInsightColor(type: InsightType | string): InsightColorEntry {
  return (
    INSIGHT_COLORS[type] ?? {
      label: type,
      bg: 'bg-neutral-500/10',
      text: 'text-neutral-600',
      darkBg: 'dark:bg-neutral-500/15',
      darkText: 'dark:text-neutral-400',
      hex: '#737373',
    }
  )
}
