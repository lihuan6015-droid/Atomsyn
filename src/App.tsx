import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
import { useEffect } from 'react'
import { appVersionApi, indexApi, seedApi, skillScanApi } from '@/lib/dataApi'
import { SeedUpdateDialog } from '@/components/seed/SeedUpdateDialog'
import { useAppStore } from '@/stores/useAppStore'
import type { SeedCheckResult } from '@/types'

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
          <Route index element={<Navigate to="/garden" replace />} />
          {/* V2.0 M3: Memory Garden replaces Library + Experiences */}
          <Route path="/garden" element={<GardenPage />} />
          {/* Legacy routes → redirect to garden */}
          <Route path="/atlas" element={<Navigate to="/garden" replace />} />
          <Route path="/atlas/:frameworkId" element={<Navigate to="/garden" replace />} />
          <Route path="/experiences" element={<Navigate to="/garden" replace />} />
          <Route path="/atoms/:atomId" element={<AtomDetailPage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
          <Route path="/playground/:projectId" element={<ProjectDetailPage />} />
          <Route path="/growth" element={<GrowthPage />} />
          <Route path="/skills" element={<SkillMapPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/garden" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
