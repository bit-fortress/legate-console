import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eye, RefreshCw, ShieldCheck, ShieldOff, UserRoundX, X } from 'lucide-react';
import {
  LegateAPIError,
  disableAdminIdentity,
  getAdminUser,
  listAdminUserIdentities,
  listAdminUsers,
  prepareDevelopmentIdentityMigration,
  revokeAdminUserSessions,
  updateAdminUser
} from './api';
import type { AdminLoginMethod } from './auth';
import { createTranslator } from './i18n';
import type {
  AdminIdentity,
  AdminInvitationStatus,
  AdminUser,
  AdminUserDetail,
  AdminUserStatus,
  Locale
} from './types';

type ToastTone = 'success' | 'error' | 'info';

interface AdminUsersPageProps {
  currentUserId: number;
  methods: AdminLoginMethod[];
  onSelfDemoted: () => void;
  onToast: (tone: ToastTone, message: string) => void;
}

export default function AdminUsersPage({ currentUserId, methods, onSelfDemoted, onToast }: AdminUsersPageProps) {
  const locale = useDocumentLocale();
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [identities, setIdentities] = useState<AdminIdentity[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const [mutating, setMutating] = useState(false);
  const [migrationProviderID, setMigrationProviderID] = useState('');
  const [migrationEmail, setMigrationEmail] = useState('');
  const detailRequestSequence = useRef(0);
  const selectedDetailUserID = useRef<number | null>(null);
  const detailDialogOpen = useRef(false);

  useEffect(() => {
    void reloadUsers();
  }, []);

  useEffect(() => {
    if (!detail) return;
    syncMigrationDraft(detail, identities, methods, setMigrationProviderID, setMigrationEmail);
  }, [methods]);

  useEffect(() => () => {
    detailRequestSequence.current += 1;
    selectedDetailUserID.current = null;
    detailDialogOpen.current = false;
  }, []);

  useEffect(() => {
    if (!detail) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDetail();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [detail]);

  async function reloadUsers() {
    setLoading(true);
    setError('');
    try {
      setUsers(await listAdminUsers());
    } catch (cause) {
      setError(actionError(cause, t('app.error'), t));
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(user: AdminUser) {
    const requestSequence = ++detailRequestSequence.current;
    selectedDetailUserID.current = user.userId;
    detailDialogOpen.current = true;
    setDetail({ ...user, invitations: [] });
    setIdentities([]);
    setMutationError('');
    setMigrationEmail(user.email);
    setDetailLoading(true);
    try {
      const [nextDetail, nextIdentities] = await Promise.all([
        getAdminUser(user.userId),
        listAdminUserIdentities(user.userId)
      ]);
      if (!isCurrentDetailRequest(requestSequence, user.userId)) return;
      setDetail(nextDetail);
      setIdentities(nextIdentities);
      syncMigrationDraft(nextDetail, nextIdentities, methods, setMigrationProviderID, setMigrationEmail);
    } catch (cause) {
      if (!isCurrentDetailRequest(requestSequence, user.userId)) return;
      setMutationError(actionError(cause, t('app.error'), t));
    } finally {
      if (isCurrentDetailRequest(requestSequence, user.userId)) setDetailLoading(false);
    }
  }

  function closeDetail() {
    detailRequestSequence.current += 1;
    selectedDetailUserID.current = null;
    detailDialogOpen.current = false;
    setDetail(null);
    setIdentities([]);
    setMutationError('');
  }

  function isCurrentDetailRequest(requestSequence: number, userID: number) {
    return detailDialogOpen.current
      && selectedDetailUserID.current === userID
      && detailRequestSequence.current === requestSequence;
  }

  async function refreshDetail(userID: number, requestSequence: number) {
    const [nextUsers, nextDetail, nextIdentities] = await Promise.all([
      listAdminUsers(),
      getAdminUser(userID),
      listAdminUserIdentities(userID)
    ]);
    if (!isCurrentDetailRequest(requestSequence, userID)) return;
    setUsers(nextUsers);
    setDetail(nextDetail);
    setIdentities(nextIdentities);
    syncMigrationDraft(nextDetail, nextIdentities, methods, setMigrationProviderID, setMigrationEmail);
  }

  async function runConfirmedAction(message: string, action: () => Promise<void>) {
    if (!detail || !window.confirm(message)) return;
    const userID = detail.userId;
    const requestSequence = detailRequestSequence.current;
    setMutating(true);
    setMutationError('');
    try {
      await action();
      if (isCurrentDetailRequest(requestSequence, userID)) await refreshDetail(userID, requestSequence);
      onToast('success', t('toast.saved'));
    } catch (cause) {
      const messageText = actionError(cause, t('app.error'), t);
      setMutationError(messageText);
      onToast('error', messageText);
    } finally {
      setMutating(false);
    }
  }

  async function prepareMigration() {
    if (!detail || !canPrepareDevelopmentMigration(detail, identities)) return;
    const providerId = migrationProviderID.trim();
    const email = migrationEmail.trim();
    if (!providerId || !email) {
      setMutationError(t('adminUsers.migrationRequired'));
      return;
    }
    if (!methods.some((method) => method.id === providerId)) {
      setMutationError(providerUnavailableMessage(providerId, t));
      return;
    }
    if (!window.confirm(t('adminUsers.confirmMigration'))) return;
    const userID = detail.userId;
    const requestSequence = detailRequestSequence.current;
    setMutating(true);
    setMutationError('');
    try {
      await prepareDevelopmentIdentityMigration(userID, { providerId, email });
      if (isCurrentDetailRequest(requestSequence, userID)) await refreshDetail(userID, requestSequence);
      onToast('success', t('adminUsers.migrationPrepared'));
    } catch (cause) {
      const messageText = actionError(cause, t('app.error'), t);
      setMutationError(messageText);
      onToast('error', messageText);
    } finally {
      setMutating(false);
    }
  }

  async function changePlatformAdmin(grant: boolean) {
    if (!detail) return;
    if (grant && (detail.platformAdmin || detail.status !== 'active')) return;
    if (!grant && !detail.platformAdmin) return;
    if (!window.confirm(grant ? t('adminUsers.confirmPromote') : t('adminUsers.confirmDemote'))) return;
    const userID = detail.userId;
    const requestSequence = detailRequestSequence.current;
    setMutating(true);
    setMutationError('');
    try {
      await updateAdminUser(userID, { platformAdmin: grant });
      if (!grant && userID === currentUserId) {
        onToast('success', t('toast.saved'));
        onSelfDemoted();
        return;
      }
      if (isCurrentDetailRequest(requestSequence, userID)) await refreshDetail(userID, requestSequence);
      onToast('success', t('toast.saved'));
    } catch (cause) {
      const messageText = actionError(cause, t('app.error'), t);
      setMutationError(messageText);
      onToast('error', messageText);
    } finally {
      setMutating(false);
    }
  }

  async function copyDiagnostic(value: string) {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      onToast('success', t('toast.copied'));
    } catch {
      onToast('error', t('toast.copyFailed'));
    }
  }

  const pendingMigrationInvitation = detail ? exactPendingMigrationInvitation(detail) : null;
  const canPrepareMigration = Boolean(detail && canPrepareDevelopmentMigration(detail, identities));
  const migrationProviderUnavailable = Boolean(
    pendingMigrationInvitation && !methods.some((method) => method.id === pendingMigrationInvitation.providerId)
  );

  return (
    <div className="admin-users-page">
      <div className="page-intro">
        <div>
          <h1>{t('adminUsers.title')}</h1>
          <p>{t('adminUsers.subtitle')}</p>
        </div>
        <div className="page-actions">
          <button type="button" className="icon-button" aria-label={t('actions.refresh')} title={t('actions.refresh')} onClick={() => void reloadUsers()}>
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {error && <div className="notice error"><X size={17} /><span>{error}</span></div>}

      <section className="table-panel admin-user-table-panel" aria-label={t('adminUsers.title')}>
        <div className="table-toolbar">
          <h3>{t('adminUsers.directory')}</h3>
          <span className="count">{users.length}</span>
        </div>
        <div className="admin-user-table-scroll">
          <table className="data-table admin-user-table">
            <colgroup>
              <col className="admin-user-col-profile" />
              <col className="admin-user-col-status" />
              <col className="admin-user-col-authority" />
              <col className="admin-user-col-login" />
              <col className="admin-user-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('adminUsers.user')}</th>
                <th>{t('adminUsers.status')}</th>
                <th>{t('adminUsers.authority')}</th>
                <th>{t('adminUsers.lastLogin')}</th>
                <th aria-label={t('adminUsers.actions')} />
              </tr>
            </thead>
            <tbody>
              {!loading && users.length === 0 && (
                <tr><td colSpan={5} className="empty-cell">{t('app.empty')}</td></tr>
              )}
              {users.map((adminUser) => (
                <tr key={adminUser.userId}>
                  <td>
                    <div className="admin-user-profile">
                      <strong>{adminUser.displayName || adminUser.email || `#${adminUser.userId}`}</strong>
                      <span>{adminUser.email || `#${adminUser.userId}`}</span>
                    </div>
                  </td>
                  <td><StatusBadge label={userStatusLabel(adminUser.status, t)} tone={userStatusTone(adminUser.status)} /></td>
                  <td>
                    {adminUser.platformAdmin
                      ? <span className="admin-authority"><ShieldCheck size={14} />{t('adminUsers.platformAdmin')}</span>
                      : <span className="muted">{t('adminUsers.workspaceUser')}</span>}
                  </td>
                  <td>{formatTimestamp(adminUser.lastLoginAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`${t('actions.view')} ${adminUser.displayName || adminUser.email}`}
                      title={t('actions.view')}
                      onClick={() => void openDetail(adminUser)}
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeDetail()}>
          <section className="modal wide admin-user-modal" role="dialog" aria-modal="true" aria-label={t('adminUsers.detailTitle')}>
            <div className="admin-user-dialog">
              <div className="modal-head">
                <div>
                  <h2>{t('adminUsers.detailTitle')}</h2>
                  <span>{detail.displayName || detail.email} · #{detail.userId}</span>
                </div>
                <button type="button" className="icon-button" aria-label={t('actions.close')} title={t('actions.close')} onClick={closeDetail}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body admin-user-detail-body">
                {detailLoading && <div className="muted">{t('app.loading')}</div>}
                {mutationError && <div className="notice error"><X size={17} /><span>{mutationError}</span></div>}

                <section className="admin-user-summary" aria-label={t('adminUsers.account')}>
                  <div><span>{t('adminUsers.email')}</span><strong title={detail.email}>{detail.email || '—'}</strong></div>
                  <div><span>{t('adminUsers.status')}</span><StatusBadge label={userStatusLabel(detail.status, t)} tone={userStatusTone(detail.status)} /></div>
                  <div><span>{t('adminUsers.authority')}</span><strong>{detail.platformAdmin ? t('adminUsers.platformAdmin') : t('adminUsers.workspaceUser')}</strong></div>
                  <div><span>{t('adminUsers.lastLogin')}</span><strong>{formatTimestamp(detail.lastLoginAt)}</strong></div>
                </section>

                <section className="admin-user-actions" aria-label={t('adminUsers.accountActions')}>
                  <h3>{t('adminUsers.accountActions')}</h3>
                  <div className="admin-action-row">
                    <button
                      type="button"
                      className={detail.status === 'suspended' ? 'btn secondary' : 'btn danger small'}
                      disabled={mutating}
                      onClick={() => void runConfirmedAction(
                        detail.status === 'suspended' ? t('adminUsers.confirmRestore') : t('adminUsers.confirmSuspend'),
                        async () => { await updateAdminUser(detail.userId, { status: detail.status === 'suspended' ? 'active' : 'suspended' }); }
                      )}
                    >
                      {detail.status === 'suspended' ? <ShieldCheck size={15} /> : <UserRoundX size={15} />}
                      {detail.status === 'suspended' ? t('adminUsers.restore') : t('adminUsers.suspend')}
                    </button>
                    {detail.platformAdmin ? (
                      <button type="button" className="btn danger small" disabled={mutating} onClick={() => void changePlatformAdmin(false)}>
                        <ShieldOff size={15} /> {t('adminUsers.demote')}
                      </button>
                    ) : detail.status === 'active' ? (
                      <button type="button" className="btn secondary" disabled={mutating} onClick={() => void changePlatformAdmin(true)}>
                        <ShieldCheck size={15} /> {t('adminUsers.promote')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn danger small"
                      disabled={mutating}
                      onClick={() => void runConfirmedAction(t('adminUsers.confirmRevokeSessions'), () => revokeAdminUserSessions(detail.userId))}
                    >
                      <UserRoundX size={15} /> {t('adminUsers.revokeSessions')}
                    </button>
                  </div>
                </section>

                <section className="admin-detail-section" aria-label={t('adminUsers.identities')}>
                  <div className="admin-detail-section-head">
                    <h3>{t('adminUsers.identities')}</h3>
                    <span>{identities.length}</span>
                  </div>
                  {identities.length === 0 ? <p className="muted">{t('adminUsers.noIdentities')}</p> : (
                    <div className="admin-identity-list">
                      {identities.map((identity) => (
                        <article className="admin-identity-row" key={identity.identityId}>
                          <div className="admin-identity-overview">
                            <div className="admin-identity-main">
                              <strong>{providerLabel(identity.providerId, methods)}</strong>
                              <span>{identity.emailAtLink}</span>
                              <code>{identity.providerId}</code>
                            </div>
                            <div className="admin-identity-state">
                              <StatusBadge label={identityStatusLabel(identity.status, t)} tone={identity.status === 'active' ? 'good' : 'muted'} />
                              <div className="admin-identity-login">
                                <span>{t('adminUsers.lastLogin')}</span>
                                <strong>{formatTimestamp(identity.lastLoginAt)}</strong>
                              </div>
                            </div>
                            {identity.status === 'active' && (
                              <button
                                type="button"
                                className="btn danger small admin-identity-disable"
                                disabled={mutating}
                                aria-label={`${t('adminUsers.disableIdentity')} ${providerLabel(identity.providerId, methods)}`}
                                onClick={() => void runConfirmedAction(t('adminUsers.confirmDisableIdentity'), () => disableAdminIdentity(detail.userId, identity.identityId))}
                              >
                                <ShieldOff size={14} /> {t('adminUsers.disableIdentity')}
                              </button>
                            )}
                          </div>
                          <div className="admin-diagnostic-grid">
                            <div className="admin-diagnostic">
                              <span>{t('adminUsers.issuer')}</span>
                              <code title={identity.issuer}>{identity.issuer}</code>
                              <button type="button" className="icon-button" aria-label={`${t('actions.copy')} issuer`} title={`${t('actions.copy')} issuer`} onClick={() => void copyDiagnostic(identity.issuer)}><Copy size={14} /></button>
                            </div>
                            <div className="admin-diagnostic">
                              <span>{t('adminUsers.subject')}</span>
                              <code title={identity.subject}>{identity.subject}</code>
                              <button type="button" className="icon-button" aria-label={`${t('actions.copy')} subject`} title={`${t('actions.copy')} subject`} onClick={() => void copyDiagnostic(identity.subject)}><Copy size={14} /></button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="admin-detail-section" aria-label={t('adminUsers.invitationHistory')}>
                  <div className="admin-detail-section-head">
                    <h3>{t('adminUsers.invitationHistory')}</h3>
                    <span>{detail.invitations.length}</span>
                  </div>
                  {detail.invitations.length === 0 ? <p className="muted">{t('adminUsers.noInvitations')}</p> : (
                    <div className="admin-invitation-list">
                      {detail.invitations.map((invitation) => (
                        <div className="admin-invitation-row" key={invitation.invitationId}>
                          <div className="admin-invitation-main">
                            <strong>{providerLabel(invitation.providerId, methods)}</strong>
                            <code>{invitation.providerId}</code>
                          </div>
                          <StatusBadge label={invitationStatusLabel(invitation.status, t)} tone={invitationStatusTone(invitation.status)} />
                          <div className="admin-invitation-times">
                            <div><span>{t('adminUsers.createdAt')}</span><strong>{formatTimestamp(invitation.createdAt)}</strong></div>
                            <div><span>{t('adminUsers.expiresAt')}</span><strong>{formatTimestamp(invitation.expiresAt)}</strong></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {canPrepareMigration && (
                  <section className="admin-migration" aria-label={t('adminUsers.prepareMigration')}>
                    <h3>{t('adminUsers.prepareMigration')}</h3>
                    <p>{t('adminUsers.migrationHelp')}</p>
                    <div className="admin-migration-form">
                      <div className="field">
                        <span>{t('adminUsers.migrationProvider')}</span>
                        <select aria-label={t('adminUsers.migrationProvider')} value={migrationProviderID} onChange={(event) => setMigrationProviderID(event.target.value)}>
                          <option value="">{t('adminUsers.selectProvider')}</option>
                          {migrationProviderUnavailable && pendingMigrationInvitation && (
                            <option value={pendingMigrationInvitation.providerId} disabled>
                              {pendingMigrationInvitation.providerId} · {t('adminUsers.providerUnavailableOption')}
                            </option>
                          )}
                          {methods.map((method) => <option key={method.id} value={method.id}>{method.label} · {method.id}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <span>{t('adminUsers.migrationEmail')}</span>
                        <input aria-label={t('adminUsers.migrationEmail')} type="email" value={migrationEmail} onChange={(event) => setMigrationEmail(event.target.value)} />
                      </div>
                      <button type="button" className="btn primary" disabled={mutating || methods.length === 0 || migrationProviderUnavailable} onClick={() => void prepareMigration()}>
                        {t('adminUsers.prepareMigrationAction')}
                      </button>
                    </div>
                    {migrationProviderUnavailable && pendingMigrationInvitation && (
                      <p className="inline-error">{providerUnavailableMessage(pendingMigrationInvitation.providerId, t)}</p>
                    )}
                  </section>
                )}
              </div>

              <div className="modal-actions admin-user-footer">
                <button type="button" className="btn secondary" onClick={closeDetail}>{t('actions.close')}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

function providerLabel(providerID: string, methods: AdminLoginMethod[]) {
  return methods.find((method) => method.id === providerID)?.label ?? providerID;
}

function canPrepareDevelopmentMigration(detail: AdminUserDetail, identities: AdminIdentity[]) {
  if (detail.platformAdmin || detail.status === 'suspended') return false;
  if (identities.length === 0 || identities.some((identity) => identity.providerId !== 'dev-bootstrap')) return false;
  if (detail.status === 'active') return true;
  return detail.status === 'invited' && exactPendingMigrationInvitation(detail) !== null;
}

function exactPendingMigrationInvitation(detail: AdminUserDetail) {
  const pending = detail.invitations.filter((invitation) => invitation.status === 'pending' && invitation.providerId !== 'dev-bootstrap');
  return pending.length === 1 ? pending[0] : null;
}

function syncMigrationDraft(
  detail: AdminUserDetail,
  identities: AdminIdentity[],
  methods: AdminLoginMethod[],
  setProviderID: (value: string) => void,
  setEmail: (value: string) => void
) {
  if (!canPrepareDevelopmentMigration(detail, identities)) {
    setProviderID('');
    setEmail('');
    return;
  }
  const pending = detail.status === 'invited' ? exactPendingMigrationInvitation(detail) : null;
  setProviderID(pending?.providerId ?? methods[0]?.id ?? '');
  setEmail(detail.email);
}

function userStatusLabel(status: AdminUserStatus, t: ReturnType<typeof createTranslator>) {
  return t(`adminUser.status.${status}`);
}

function userStatusTone(status: AdminUserStatus) {
  if (status === 'active') return 'good';
  if (status === 'suspended') return 'danger';
  return 'blue';
}

function identityStatusLabel(status: AdminIdentity['status'], t: ReturnType<typeof createTranslator>) {
  return status === 'active' ? t('adminUsers.identityActive') : t('adminUsers.identityDisabled');
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

function formatTimestamp(value: string | null | undefined) {
  if (!value) return '—';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '—';
  const parts = [
    timestamp.getUTCFullYear(),
    padTimestamp(timestamp.getUTCMonth() + 1),
    padTimestamp(timestamp.getUTCDate()),
    padTimestamp(timestamp.getUTCHours()),
    padTimestamp(timestamp.getUTCMinutes())
  ];
  return `${parts[0]}-${parts[1]}-${parts[2]} ${parts[3]}:${parts[4]} UTC`;
}

function padTimestamp(value: number) {
  return String(value).padStart(2, '0');
}

function actionError(error: unknown, fallback: string, t: ReturnType<typeof createTranslator>) {
  if (error instanceof LegateAPIError) {
    if (error.code === 'admin_auth_locked') return t('adminUsers.errorAuthLocked');
    if (error.code === 'admin_recovery_target_in_use') return t('adminUsers.errorRecoveryTarget');
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function providerUnavailableMessage(providerID: string, t: ReturnType<typeof createTranslator>) {
  return t('adminUsers.providerUnavailable').replace('{provider}', providerID);
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
