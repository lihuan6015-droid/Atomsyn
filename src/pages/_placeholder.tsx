/**
 * Page barrel re-exports.
 *
 * Stage 1 used inline placeholders here. Stage 2 sub-agents wrote the real
 * page modules; Stage 3 swaps the exports to point at them. Routes in App.tsx
 * import from this file, so wiring stays in one place.
 */

export { default as AtlasPage } from './AtlasPage'
export { default as AtomDetailPage } from './AtomDetailPage'
export { default as PlaygroundPage } from './PlaygroundPage'
export { default as ProjectDetailPage } from './ProjectDetailPage'
export { default as GrowthPage } from './GrowthPage'
export { default as SettingsPage } from './SettingsPage'
export { default as OnboardingPage } from './OnboardingPage'
export { default as SkillMapPage } from './SkillMapPage'
export { default as ExperiencesPage } from './ExperiencesPage'
