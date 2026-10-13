export const PERMISSIONS = [
  { key: 'team.view_private', label: 'View personal information (phone, address…)' },
  { key: 'team.edit', label: 'Edit and deactivate members' },
  { key: 'team.rate', label: 'Rate members' },
  { key: 'team.invite', label: 'Invite members' },
  { key: 'team.view_attendance', label: 'View attendance' },
  { key: 'projects.manage', label: 'Create and edit projects' },
  { key: 'tasks.create', label: 'Create tasks' },
  { key: 'tasks.edit', label: 'Edit any task' },
  { key: 'files.delete', label: 'Delete files and folders' },
  { key: 'integrations.manage', label: 'Manage integrations' },
  { key: 'automations.manage', label: 'Use automations (Instagram / YouTube)' },
  { key: 'agents.manage', label: 'Manage agents' },
  { key: 'notifications.broadcast', label: 'Send announcements to everyone' }
] as const
export const EDITABLE_ROLES = [
  { key: 'admin', label: 'Admin' }, { key: 'manager', label: 'Manager' },
  { key: 'member', label: 'Team Member' }, { key: 'agent', label: 'Agent' }
] as const
