import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import {
  AtlasPage,
  AtomDetailPage,
  GrowthPage,
  OnboardingPage,
  PlaygroundPage,
  ProjectDetailPage,
  SettingsPage,
} from '@/pages/_placeholder'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/atlas" replace />} />
          <Route path="/atlas" element={<AtlasPage />} />
          <Route path="/atlas/:frameworkId" element={<AtlasPage />} />
          <Route path="/atoms/:atomId" element={<AtomDetailPage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
          <Route path="/playground/:projectId" element={<ProjectDetailPage />} />
          <Route path="/growth" element={<GrowthPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/atlas" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
