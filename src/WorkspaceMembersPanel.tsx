import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import {
  addWorkspaceMember,
  deleteWorkspaceMember,
  listWorkspaceMembers,
  resolveWorkspaceMember
} from './api';
import type { AdminLoginMethod } from './auth';
import { createTranslator } from './i18n';
import type {
  AdminInvitationStatus,
  AdminUserStatus,
  Locale,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberResolution,
  WorkspaceRole
} from './types';
import { SelectControl, SelectField } from './SelectControl';

type MemberMode = 'existing' | 'invite';
type ToastTone = 'success' | 'error' | 'info';

interface WorkspaceMembersPanelProps {
  workspace: Pick<Workspace, 'id' | 'slug' | 'name'>;
  canWrite: boolean;
  methods: AdminLoginMethod[];
  onClose: () => void;
  onToast: (tone: ToastTone, message: string) => void;
}

export default function WorkspaceMembersPanel({
  workspace,
  canWrite,
  methods,
  onClose,
  onToast
}: WorkspaceMembersPanelProps) {
  const locale = useDocumentLocale();
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<MemberMode>('existing');
  const [existingEmail, setExistingEmail] = useState('');
  const [existingRole, setExistingRole] = useState<WorkspaceRole>('viewer');
  const [resolved, setResolved] = useState<WorkspaceMemberResolution | null>(null);
  const [resolving, setResolving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteProviderID, setInviteProviderID] = useState(methods[0]?.id ?? '');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('viewer');
  const [mutating, setMutating] = useState(false);
  const [mutatingUserID, setMutatingUserID] = useState<number | null>(null);
  const resolverSequence = useRef(0);
  const existingEmailRef = useRef('');

  useEffect(() => {
    setInviteProviderID((current) => methods.some((method) => method.id === current) ? current : methods[0]?.id ?? '');
  }, [methods]);

  useEffect(() => {
    let cancelled = false;
    setMembers([]);
    setError('');
    setLoading(true);
    void listWorkspaceMembers(workspace.id)
      .then((items) => {
        if (!cancelled) setMembers(items);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorText(cause, t('app.error')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.id, t]);

  async function reloadMembers() {
    setLoading(true);
    setError('');
    try {
      setMembers(await listWorkspaceMembers(workspace.id));
    } catch (cause) {
      const message = errorText(cause, t('app.error'));
      setError(message);
      onToast('error', message);
    } finally {
      setLoading(false);
    }
  }

  async function resolveExistingUser() {
    const email = existingEmail.trim();
    if (!email) {
      onToast('error', `${t('workspaces.existingUserEmail')} ${t('form.required')}`);
      return;
    }
    const normalizedEmail = normalizeEmailInput(email);
    const sequence = ++resolverSequence.current;
    setResolving(true);
    setResolved(null);
    setError('');
    try {
      const result = await resolveWorkspaceMember(workspace.id, email);
      if (isCurrentResolverRequest(sequence, normalizedEmail)) setResolved(result);
    } catch (cause) {
      if (!isCurrentResolverRequest(sequence, normalizedEmail)) return;
      const message = errorText(cause, t('workspaces.resolveFailed'));
      setError(message);
      onToast('error', message);
    } finally {
      if (isCurrentResolverRequest(sequence, normalizedEmail)) setResolving(false);
    }
  }

  function isCurrentResolverRequest(sequence: number, normalizedEmail: string) {
    return sequence === resolverSequence.current
      && normalizeEmailInput(existingEmailRef.current) === normalizedEmail;
  }

  async function addResolvedUser() {
    if (!resolved || resolved.status === 'suspended') return;
    await mutate(async () => {
      await addWorkspaceMember(workspace.id, { userId: resolved.userId, role: existingRole });
      resolverSequence.current += 1;
      existingEmailRef.current = '';
      setExistingEmail('');
      setResolved(null);
    });
  }

  async function inviteUser() {
    const email = inviteEmail.trim();
    if (!email || !inviteProviderID) {
      onToast('error', t('workspaces.inviteRequired'));
      return;
    }
    await mutate(async () => {
      await addWorkspaceMember(workspace.id, { email, providerId: inviteProviderID, role: inviteRole });
      setInviteEmail('');
    });
  }

  async function changeRole(member: WorkspaceMember, role: WorkspaceRole) {
    if (member.userStatus === 'suspended') return;
    setMutatingUserID(member.userId);
    try {
      await addWorkspaceMember(workspace.id, { userId: member.userId, role });
      onToast('success', t('toast.saved'));
      await reloadMembers();
    } catch (cause) {
      onToast('error', errorText(cause, t('app.error')));
    } finally {
      setMutatingUserID(null);
    }
  }

  async function removeMember(member: WorkspaceMember) {
    if (!window.confirm(t('workspaces.confirmRemoveMember').replace('{name}', member.displayName || member.email))) return;
    setMutatingUserID(member.userId);
    try {
      await deleteWorkspaceMember(workspace.id, member.userId);
      onToast('success', t('toast.deleted'));
      await reloadMembers();
    } catch (cause) {
      onToast('error', errorText(cause, t('app.error')));
    } finally {
      setMutatingUserID(null);
    }
  }

  async function mutate(action: () => Promise<void>) {
    setMutating(true);
    try {
      await action();
      onToast('success', t('toast.saved'));
      await reloadMembers();
    } catch (cause) {
      onToast('error', errorText(cause, t('app.error')));
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="workspace-members-panel">
      <p className="muted panel-help">{t('workspaces.memberHelp')}</p>

      {canWrite && (
        <section className="member-create" aria-label={t('actions.addMember')}>
          <div className="member-mode segmented" aria-label={t('workspaces.memberAddMode')}>
            <button type="button" className={mode === 'existing' ? 'active' : ''} aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>
              {t('workspaces.existingUser')}
            </button>
            <button type="button" className={mode === 'invite' ? 'active' : ''} aria-pressed={mode === 'invite'} onClick={() => setMode('invite')}>
              {t('workspaces.inviteNewUser')}
            </button>
          </div>

          {mode === 'existing' ? (
            <div className="member-add-form">
              <div className="member-form-grid">
                <div className="field member-email-field">
                  <span>{t('workspaces.existingUserEmail')}</span>
                  <input
                    aria-label={t('workspaces.existingUserEmail')}
                    type="email"
                    value={existingEmail}
                    onChange={(event) => {
                      const value = event.target.value;
                      resolverSequence.current += 1;
                      existingEmailRef.current = value;
                      setExistingEmail(value);
                      setResolved(null);
                      setResolving(false);
                      setError('');
                    }}
                  />
                </div>
                <RoleField value={existingRole} onChange={setExistingRole} label={t('workspaces.memberRole')} t={t} />
                <button type="button" className="btn secondary member-resolve-button" disabled={resolving || mutating} onClick={() => void resolveExistingUser()}>
                  <Search size={15} /> {resolving ? t('app.loading') : t('workspaces.resolveExact')}
                </button>
              </div>
              {resolved && (
                <div className={`member-resolution ${resolved.status === 'suspended' ? 'danger' : ''}`}>
                  <div>
                    <strong>{resolved.displayName || resolved.email}</strong>
                    <span>{resolved.email}</span>
                  </div>
                  <code>#{resolved.userId}</code>
                  <StatusBadge label={userStatusLabel(resolved.status, t)} tone={userStatusTone(resolved.status)} />
                  {resolved.status === 'suspended' ? (
                    <span className="member-resolution-warning">{t('workspaces.suspendedCannotJoin')}</span>
                  ) : (
                    <button type="button" className="btn primary" disabled={mutating} onClick={() => void addResolvedUser()}>
                      {t('workspaces.confirmAddUser').replace('{id}', String(resolved.userId))}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="member-add-form">
              {methods.length === 0 ? (
                <p className="empty-inline">{t('workspaces.noOIDCMethods')}</p>
              ) : (
                <div className="member-form-grid invite">
                  <div className="field member-email-field">
                    <span>{t('workspaces.inviteEmail')}</span>
                    <input aria-label={t('workspaces.inviteEmail')} type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} />
                  </div>
                  <SelectField
                    label={t('workspaces.oidcMethod')}
                    value={inviteProviderID}
                    onChange={setInviteProviderID}
                    options={methods.map((method) => ({ value: method.id, label: method.label }))}
                  />
                  <RoleField value={inviteRole} onChange={setInviteRole} label={t('workspaces.memberRole')} t={t} />
                  <button type="button" className="btn primary member-invite-button" disabled={mutating} onClick={() => void inviteUser()}>
                    {t('workspaces.sendInvitation')}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="member-list-head">
        <h3>{t('workspaces.members')} <span className="count">{members.length}</span></h3>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {loading ? (
        <p className="empty-inline">{t('app.loading')}</p>
      ) : members.length === 0 ? (
        <p className="empty-inline">{t('app.empty')}</p>
      ) : (
        <div className="table-scroll member-table-scroll">
          <table className="data-table member-table">
            <thead>
              <tr>
                <th>{t('workspaces.memberUser')}</th>
                <th>{t('workspaces.memberStatus')}</th>
                <th>{t('workspaces.invitationStatus')}</th>
                <th>{t('workspaces.memberRole')}</th>
                <th>{t('workspaces.lastLogin')}</th>
                {canWrite && <th className="actions-col">{t('actions.delete')}</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td>
                    <div className="member-identity">
                      <strong>{member.displayName || member.email}</strong>
                      <span>{member.email}</span>
                      <code>#{member.userId}</code>
                    </div>
                  </td>
                  <td><StatusBadge label={userStatusLabel(member.userStatus, t)} tone={userStatusTone(member.userStatus)} /></td>
                  <td>
                    {member.invitationStatus
                      ? <StatusBadge label={invitationStatusLabel(member.invitationStatus, t)} tone={invitationStatusTone(member.invitationStatus)} />
                      : '—'}
                  </td>
                  <td>
                    {canWrite ? (
                      <SelectControl
                        className="member-role-select"
                        ariaLabel={`${member.displayName || member.email} ${t('workspaces.memberRole')}`}
                        value={member.role}
                        disabled={member.userStatus === 'suspended' || mutatingUserID === member.userId}
                        onChange={(role) => void changeRole(member, role as WorkspaceRole)}
                        options={roleOptions(t)}
                      />
                    ) : roleLabel(member.role, t)}
                  </td>
                  <td>{formatTimestamp(member.lastLoginAt, locale)}</td>
                  {canWrite && (
                    <td>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`${t('actions.delete')} ${member.displayName || member.email}`}
                        title={t('actions.delete')}
                        disabled={mutatingUserID === member.userId}
                        onClick={() => void removeMember(member)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="member-panel-actions">
        <button type="button" className="btn secondary" onClick={onClose}>{t('actions.close')}</button>
      </div>
    </div>
  );
}

function RoleField({ value, onChange, label, t }: { value: WorkspaceRole; onChange: (role: WorkspaceRole) => void; label: string; t: ReturnType<typeof createTranslator> }) {
  return (
    <SelectField
      label={label}
      value={value}
      onChange={(role) => onChange(role as WorkspaceRole)}
      options={roleOptions(t)}
    />
  );
}

function roleOptions(t: ReturnType<typeof createTranslator>) {
  return [
    { value: 'admin', label: t('workspace.roleAdmin') },
    { value: 'viewer', label: t('workspace.roleViewer') },
    { value: 'usage_viewer', label: t('workspace.roleUsageViewer') }
  ];
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

function userStatusLabel(status: AdminUserStatus, t: ReturnType<typeof createTranslator>) {
  return t(`adminUser.status.${status}`);
}

function userStatusTone(status: AdminUserStatus) {
  if (status === 'active') return 'good';
  if (status === 'suspended') return 'danger';
  return 'blue';
}

function invitationStatusLabel(status: AdminInvitationStatus, t: ReturnType<typeof createTranslator>) {
  return t(`adminInvitation.status.${status}`);
}

function invitationStatusTone(status: AdminInvitationStatus) {
  if (status === 'claimed') return 'good';
  if (status === 'pending') return 'blue';
  if (status === 'expired') return 'danger';
  return 'muted';
}

function roleLabel(role: WorkspaceRole, t: ReturnType<typeof createTranslator>) {
  if (role === 'admin') return t('workspace.roleAdmin');
  if (role === 'usage_viewer') return t('workspace.roleUsageViewer');
  return t('workspace.roleViewer');
}

function formatTimestamp(value: string | null, locale: Locale) {
  if (!value) return '—';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(timestamp);
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalizeEmailInput(value: string) {
  return value.trim().toLowerCase();
}

function useDocumentLocale(): Locale {
  const readLocale = () => document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';
  const [locale, setLocale] = useState<Locale>(readLocale);
  useEffect(() => {
    const observer = new MutationObserver(() => setLocale(readLocale()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => observer.disconnect();
  }, []);
  return locale;
}
