import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import RequireAuth from './auth/RequireAuth'
import AdminOnly from './components/AdminOnly'
import Login from './pages/auth/Login'
import { envError } from './lib/env'

// Protected screens are code-split: their code is only downloaded after a successful login.
const WorkspaceLayout = lazy(() => import('./layouts/WorkspaceLayout'))
const Home = lazy(() => import('./pages/home/Home'))
const Team = lazy(() => import('./pages/team/Team'))
const MemberProfile = lazy(() => import('./pages/team/MemberProfile'))
const Projects = lazy(() => import('./pages/projects/Projects'))
const ProjectDetails = lazy(() => import('./pages/projects/ProjectDetails'))
const Tasks = lazy(() => import('./pages/tasks/Tasks'))
const Settings = lazy(() => import('./pages/settings/Settings'))
const Messages = lazy(() => import('./pages/messages/Messages'))
const Files = lazy(() => import('./pages/files/Files'))
const Analytics = lazy(() => import('./pages/analytics/Analytics'))
const Integrations = lazy(() => import('./pages/integrations/Integrations'))
const Automations = lazy(() => import('./pages/automations/Automations'))
const YouTube = lazy(() => import('./pages/automations/YouTube'))
const Instagram = lazy(() => import('./pages/automations/Instagram'))
const Activity = lazy(() => import('./pages/activity/Activity'))
const Agents = lazy(() => import('./pages/agents/Agents'))
const Office = lazy(() => import('./pages/office/Office'))

export default function App() {
  if (envError) return <div className="m-8 card p-6 text-red-600" role="alert">{envError}</div>
  return (
    <HashRouter>
      <AuthProvider>
        <Suspense fallback={<div className="p-10 text-slate-500">Loading…</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<WorkspaceLayout />}>
                {/* available to Admin and Team Member */}
                <Route index element={<Home />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/:id" element={<ProjectDetails />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/files" element={<Files />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/office" element={<Office />} />
                <Route path="/activity" element={<Activity />} />
                {/* Admin only */}
                <Route element={<AdminOnly />}>
                  <Route path="/team" element={<Team />} />
                  <Route path="/team/:id" element={<MemberProfile />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/automations" element={<Automations />} />
                  <Route path="/automations/youtube" element={<YouTube />} />
                  <Route path="/automations/instagram" element={<Instagram />} />
                  <Route path="/integrations" element={<Integrations />} />
                  <Route path="/agents" element={<Agents />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </HashRouter>
  )
}
