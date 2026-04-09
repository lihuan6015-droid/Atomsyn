import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { SplashScreen } from '@/components/splash/SplashScreen'
import { LegacyMigrationDialog } from '@/components/migration/LegacyMigrationDialog'
import {
  AtlasPage,
  AtomDetailPage,
  ExperiencesPage,
  GrowthPage,
  OnboardingPage,
  PlaygroundPage,
  ProjectDetailPage,
  SettingsPage,
  SkillMapPage,
} from '@/pages/_placeholder'
import { GardenPage } from '@/pages/GardenPage'
import { ChatPage } from '@/pages/ChatPage'
import BookshelfPage from '@/pages/BookshelfPage'
import { NotesPage } from '@/pages/NotesPage'
import { useEffect } from 'react'
import { appVersionApi, indexApi, seedApi, skillScanApi } from '@/lib/dataApi'
import { SeedUpdateDialog } from '@/components/seed/SeedUpdateDialog'
import { useAppStore } from '@/stores/useAppStore'
import type { SeedCheckResult } from '@/types'

/** Legacy /atoms/:atomId → /atom/atoms/:atomId redirect */
function LegacyAtomRedirect() {
  const { atomId } = useParams()
  return <Navigate to={`/atom/atoms/${atomId}`} replace />
}

export default function App() {
  const [migrationResolved, setMigrationResolved] = useState<boolean>(
    () => sessionStorage.getItem('atomsyn:legacy-migration-dismissed') === 'true',
  )
  const [initDone, setInitDone] = useState<boolean>(
    () => sessionStorage.getItem('ccl:init-done') === 'true',
  )
  const setSeedUpdateAvailable = useAppStore((s) => s.setSeedUpdateAvailable)
  const setAppUpdateAvailable = useAppStore((s) => s.setAppUpdateAvailable)
  const [seedCheckResult, setSeedCheckResult] = useState<SeedCheckResult | null>(null)
  const [seedDialogOpen, setSeedDialogOpen] = useState(false)

  // V1.5 Fix-2 · ensure knowledge index has experiences/skillInventory fields
  // populated by the dev-server's rebuilder. Non-fatal in tauri/prod builds.
  // V1.5 Fix-4 · rescan local skill directories on startup so the Skill Map
  // reflects any changes the user made outside the app. Both calls are best
  // effort and chain: scan first (updates atoms/skill-inventory/), then
  // rebuild the index so experiences/skillInventory fields refresh together.
  // V1.5 · dual update channels — check seed methodology + app version on launch.
  useEffect(() => {
    skillScanApi
      .rescan()
      .catch(() => undefined)
      .finally(() => {
        indexApi.rebuild().catch(() => undefined)
      })
    seedApi
      .check()
      .then((result) => {
        setSeedCheckResult(result)
        const should = result.hasUpdate && !result.dismissed
        setSeedUpdateAvailable(should)
        if (should) setSeedDialogOpen(true)
      })
      .catch(() => undefined)
    appVersionApi
      .check()
      .then((r) => setAppUpdateAvailable(r.hasUpdate))
      .catch(() => undefined)
  }, [setSeedUpdateAvailable, setAppUpdateAvailable])

  // V2.0 M0 · Gate the splash behind the legacy migration dialog.
  // The dialog self-decides whether to show (Tauri-only + legacy found)
  // and resolves immediately in all other cases via onResolved.
  if (!migrationResolved) {
    return <LegacyMigrationDialog onResolved={() => setMigrationResolved(true)} />
  }

  if (!initDone) {
    return (
      <SplashScreen
        onComplete={() => {
          sessionStorage.setItem('ccl:init-done', 'true')
          setInitDone(true)
        }}
      />
    )
  }

  return (
    <BrowserRouter>
      <SeedUpdateDialog
        open={seedDialogOpen}
        result={seedCheckResult}
        onClose={() => setSeedDialogOpen(false)}
      />
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/chat" replace />} />
          {/* ─── Chat mode ─── */}
          <Route path="/chat" element={<ChatPage />} />
          {/* ─── Atom mode ─── */}
          <Route path="/atom" element={<Navigate to="/atom/garden" replace />} />
          <Route path="/atom/garden" element={<GardenPage />} />
          <Route path="/atom/atoms/:atomId" element={<AtomDetailPage />} />
          <Route path="/atom/playground" element={<PlaygroundPage />} />
          <Route path="/atom/playground/:projectId" element={<ProjectDetailPage />} />
          <Route path="/atom/growth" element={<GrowthPage />} />
          <Route path="/atom/skills" element={<SkillMapPage />} />
          <Route path="/atom/bookshelf" element={<BookshelfPage />} />
          {/* ─── Notes mode ─── */}
          <Route path="/notes" element={<NotesPage />} />
          {/* ─── Legacy redirects ─── */}
          <Route path="/garden" element={<Navigate to="/atom/garden" replace />} />
          <Route path="/atlas" element={<Navigate to="/atom/garden" replace />} />
          <Route path="/atlas/:frameworkId" element={<Navigate to="/atom/garden" replace />} />
          <Route path="/experiences" element={<Navigate to="/atom/garden" replace />} />
          <Route path="/atoms/:atomId" element={<LegacyAtomRedirect />} />
          <Route path="/playground" element={<Navigate to="/atom/playground" replace />} />
          <Route path="/growth" element={<Navigate to="/atom/growth" replace />} />
          <Route path="/skills" element={<Navigate to="/atom/skills" replace />} />
          <Route path="/settings" element={<Navigate to="/chat" replace />} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
