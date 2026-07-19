import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Ellipsis, Plus, Trash2 } from 'lucide-react';
import './EndpointsPage.css';

export type EndpointListKind = 'text' | 'image' | 'video';
export type EndpointListStatus = 'enabled' | 'disabled' | 'error';

export interface EndpointListItem {
  id: number;
  name: string;
  remark?: string;
  kind: EndpointListKind;
  status: EndpointListStatus;
  driverLabel: string;
  modelCount: number;
}

export interface EndpointGroupListItem {
  id: number;
  name: string;
  remark?: string;
  endpoints: readonly EndpointListItem[];
  deleteBlocked?: boolean;
}

export interface EndpointsPageLabels {
  title: string;
  subtitle: string;
  createGroup: string;
  createEndpoint: (groupName: string) => string;
  openGroupActions: (groupName: string) => string;
  deleteGroup: string;
  groupDeleteBlocked: string;
  expandGroup: (groupName: string) => string;
  collapseGroup: (groupName: string) => string;
  openEndpoint: (endpointName: string) => string;
  endpointCount: (count: number) => string;
  modelCount: (count: number) => string;
  emptyGroup: string;
  emptyPage: string;
  driver: string;
  models: string;
  kind: string;
  status: string;
  kinds: Record<EndpointListKind, string>;
  statuses: Record<EndpointListStatus, string>;
}

interface EndpointsPageProps {
  workspaceKey: string | number;
  groups: readonly EndpointGroupListItem[];
  canWrite: boolean;
  labels: EndpointsPageLabels;
  onCreateGroup: () => void;
  onCreateEndpoint: (groupID: number) => void;
  onDeleteGroup: (groupID: number) => void;
  onOpenEndpoint?: (endpointID: number) => void;
}

const COLLAPSE_STORAGE_PREFIX = 'legate.endpoints.group-collapsed';

export default function EndpointsPage({
  workspaceKey,
  groups,
  canWrite,
  labels,
  onCreateGroup,
  onCreateEndpoint,
  onDeleteGroup,
  onOpenEndpoint
}: EndpointsPageProps) {
  const instanceID = useId().replace(/:/g, '');
  const titleID = `${instanceID}-title`;
  const workspaceStorageKey = String(workspaceKey);
  const groupIDs = useMemo(() => groups.map((group) => group.id).join(','), [groups]);
  const [openActionsGroupID, setOpenActionsGroupID] = useState<number | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [collapsedGroupIDs, setCollapsedGroupIDs] = useState<Set<number>>(
    () => readCollapsedGroups(workspaceStorageKey, groups)
  );

  useEffect(() => {
    setCollapsedGroupIDs(readCollapsedGroups(workspaceStorageKey, groups));
    setOpenActionsGroupID(null);
  }, [workspaceStorageKey, groupIDs]);

  useEffect(() => {
    if (openActionsGroupID == null) return;

    function handlePointerDown(event: MouseEvent) {
      if (actionsMenuRef.current?.contains(event.target as Node)) return;
      setOpenActionsGroupID(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenActionsGroupID(null);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionsGroupID]);

  function toggleGroup(groupID: number) {
    setCollapsedGroupIDs((current) => {
      const next = new Set(current);
      const collapsed = !next.has(groupID);
      if (collapsed) next.add(groupID);
      else next.delete(groupID);
      writeCollapsedGroup(workspaceStorageKey, groupID, collapsed);
      return next;
    });
  }

  return (
    <main className="endpoints-page" aria-labelledby={titleID}>
      <header className="endpoints-page-header">
        <div className="endpoints-page-heading">
          <h1 id={titleID}>{labels.title}</h1>
          <p>{labels.subtitle}</p>
        </div>
        {canWrite && (
          <button type="button" className="btn primary endpoints-page-create-group" onClick={onCreateGroup}>
            <Plus size={16} aria-hidden="true" />
            {labels.createGroup}
          </button>
        )}
      </header>

      <div className="endpoint-group-list">
        {groups.map((group) => {
          const collapsed = collapsedGroupIDs.has(group.id);
          const actionsOpen = openActionsGroupID === group.id;
          const deleteBlocked = group.deleteBlocked ?? group.endpoints.length > 0;
          const toggleID = `${instanceID}-group-${group.id}-toggle`;
          const contentID = `${instanceID}-group-${group.id}-content`;
          const deleteTooltipID = `${instanceID}-group-${group.id}-delete-tooltip`;
          return (
            <section className="endpoint-group-section" data-group-id={group.id} key={group.id}>
              <header className="endpoint-group-header">
                <button
                  type="button"
                  className="endpoint-group-toggle"
                  id={toggleID}
                  aria-controls={contentID}
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? labels.expandGroup(group.name) : labels.collapseGroup(group.name)}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span className="endpoint-group-chevron" aria-hidden="true">
                    {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                  </span>
                  <span className="endpoint-group-copy">
                    <strong>{group.name}</strong>
                    {group.remark && <span>{group.remark}</span>}
                  </span>
                  <span className="endpoint-group-count">{labels.endpointCount(group.endpoints.length)}</span>
                </button>

                {canWrite && (
                  <div className="endpoint-group-actions" role="group" aria-label={labels.openGroupActions(group.name)}>
                    <button
                      type="button"
                      className="endpoint-group-action"
                      aria-label={labels.createEndpoint(group.name)}
                      title={labels.createEndpoint(group.name)}
                      onClick={() => onCreateEndpoint(group.id)}
                    >
                      <Plus size={17} aria-hidden="true" />
                    </button>
                    <div
                      className="endpoint-group-action-menu"
                      ref={actionsOpen ? actionsMenuRef : null}
                    >
                      <button
                        type="button"
                        className="endpoint-group-action"
                        aria-label={labels.openGroupActions(group.name)}
                        title={labels.openGroupActions(group.name)}
                        aria-haspopup="menu"
                        aria-expanded={actionsOpen}
                        onClick={() => setOpenActionsGroupID((current) => current === group.id ? null : group.id)}
                      >
                        <Ellipsis size={18} aria-hidden="true" />
                      </button>
                      {actionsOpen && (
                        <div className="endpoint-group-action-popover" role="menu" aria-label={labels.openGroupActions(group.name)}>
                          <span
                            className={deleteBlocked ? 'endpoint-group-menu-item-wrap blocked' : 'endpoint-group-menu-item-wrap'}
                            tabIndex={deleteBlocked ? 0 : undefined}
                          >
                            <button
                              type="button"
                              role="menuitem"
                              className="endpoint-group-menu-item danger"
                              disabled={deleteBlocked}
                              aria-describedby={deleteBlocked ? deleteTooltipID : undefined}
                              onClick={() => {
                                setOpenActionsGroupID(null);
                                onDeleteGroup(group.id);
                              }}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                              <span>{labels.deleteGroup}</span>
                            </button>
                            {deleteBlocked && (
                              <span className="endpoint-group-menu-tooltip" role="tooltip" id={deleteTooltipID}>
                                {labels.groupDeleteBlocked}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </header>

              {!collapsed && (
                <div
                  className="endpoint-group-content"
                  id={contentID}
                  role="region"
                  aria-labelledby={toggleID}
                >
                  {group.endpoints.length === 0 ? (
                    <p className="endpoint-group-empty">{labels.emptyGroup}</p>
                  ) : (
                    <ul className="endpoint-list">
                      {group.endpoints.map((endpoint) => (
                        <li className="endpoint-list-item" key={endpoint.id}>
                          <div className="endpoint-list-primary">
                            {onOpenEndpoint ? (
                              <button
                                type="button"
                                className="endpoint-name-button"
                                aria-label={labels.openEndpoint(endpoint.name)}
                                onClick={() => onOpenEndpoint(endpoint.id)}
                              >
                                {endpoint.name}
                              </button>
                            ) : (
                              <strong className="endpoint-name-text">{endpoint.name}</strong>
                            )}
                            {endpoint.remark && <span>{endpoint.remark}</span>}
                          </div>

                          <dl className="endpoint-list-classification">
                            <div>
                              <dt>{labels.kind}</dt>
                              <dd>
                                <span className="endpoint-kind" data-kind={endpoint.kind}>
                                  {labels.kinds[endpoint.kind]}
                                </span>
                              </dd>
                            </div>
                            <div>
                              <dt>{labels.status}</dt>
                              <dd>
                                <span className="endpoint-status" data-status={endpoint.status}>
                                  <span aria-hidden="true" />
                                  {labels.statuses[endpoint.status]}
                                </span>
                              </dd>
                            </div>
                          </dl>

                          <dl className="endpoint-list-facts">
                            <div>
                              <dt>{labels.driver}</dt>
                              <dd title={endpoint.driverLabel}>{endpoint.driverLabel || '-'}</dd>
                            </div>
                            <div>
                              <dt>{labels.models}</dt>
                              <dd>{labels.modelCount(endpoint.modelCount)}</dd>
                            </div>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {groups.length === 0 && <p className="endpoint-page-empty">{labels.emptyPage}</p>}
      </div>
    </main>
  );
}

function collapseStorageKey(workspaceKey: string, groupID: number): string {
  return `${COLLAPSE_STORAGE_PREFIX}:${encodeURIComponent(workspaceKey)}:${groupID}`;
}

function readCollapsedGroups(
  workspaceKey: string,
  groups: readonly Pick<EndpointGroupListItem, 'id'>[]
): Set<number> {
  const collapsed = new Set<number>();
  try {
    if (typeof localStorage === 'undefined') return collapsed;
    for (const group of groups) {
      if (localStorage.getItem(collapseStorageKey(workspaceKey, group.id)) === '1') collapsed.add(group.id);
    }
  } catch {
    return collapsed;
  }
  return collapsed;
}

function writeCollapsedGroup(workspaceKey: string, groupID: number, collapsed: boolean) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(collapseStorageKey(workspaceKey, groupID), collapsed ? '1' : '0');
  } catch {
    // Storage can be unavailable in hardened or private browsing contexts.
  }
}
