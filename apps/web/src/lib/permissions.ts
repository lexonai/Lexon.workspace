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
  { key: 'notifications.broadcast', label: 'Send announcements to everyone' },
  { key: 'office.access', label: 'Open Lexon Office' },
  { key: 'office.edit', label: 'Change things inside Lexon Office (otherwise read-only)' }
] as const
// What an Admin can grant to an individual Team Member (everything else is Admin-only). Mirrors grantable_permissions() in SQL.
export const GRANTABLE = [
  { key: 'office.access', label: 'Open Lexon Office', hint: 'Needed to see the Office page at all.' },
  { key: 'office.edit', label: 'Edit inside Lexon Office', hint: 'Without it Office is read-only for this member.' },
  { key: 'tasks.create', label: 'Create tasks', hint: 'Can create and assign tasks.' },
  { key: 'tasks.edit', label: 'Edit any task', hint: 'Can change tasks that are not their own.' },
  { key: 'projects.manage', label: 'Create and edit projects', hint: 'Can see and manage all projects.' },
  { key: 'files.delete', label: 'Delete files and folders', hint: '' }
] as const
export const EDITABLE_ROLES = [
  { key: 'admin', label: 'Admin' }, { key: 'manager', label: 'Manager' },
  { key: 'member', label: 'Team Member' }, { key: 'agent', label: 'Agent' }
] as const
