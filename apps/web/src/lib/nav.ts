import { Home, MessageCircle, Building2, FolderKanban, Users, Bot, CheckSquare, History, FileText, BarChart3, Zap, Plug, Settings } from 'lucide-react'

// Admin sees everything. Team Members get a fixed, predefined set (no permission editor).
export const NAV = [
  { to: '/', label: 'Home', icon: Home, member: true },
  { to: '/messages', label: 'Messages', icon: MessageCircle, member: true },
  { to: '/office', label: 'Office', icon: Building2, member: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, member: true },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, member: true },
  { to: '/activity', label: 'Activity', icon: History, member: true },
  { to: '/files', label: 'Files', icon: FileText, member: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/automations', label: 'Automations', icon: Zap },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/settings', label: 'Settings', icon: Settings, member: true }
] as { to: string; label: string; icon: any; member?: boolean }[]
