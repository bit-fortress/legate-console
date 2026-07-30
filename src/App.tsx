import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Braces,
  Boxes,
  CalendarClock,
  ChartColumn,
  Check,
  CircleAlert,
  CircleCheck,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Copy,
  Cpu,
  Database,
  Edit3,
  Globe2,
  Info,
  KeyRound,
  LayoutList,
  Layers,
  LogOut,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Server,
  Sun,
  Trash2,
  Upload,
  Users,
  UserCog,
  Workflow,
  X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  LegateAPIError,
  createAPIKey,
  createEndpointGroup,
  createGroup,
  createEndpoint,
  createSidecarToken,
  createWorkspace,
  deleteAPIKey,
  deleteGroup,
  deleteDriverProfile,
  deleteEndpointGroup,
  deleteEndpoint,
  discoverEndpointModels,
  deleteSidecarToken,
  getAnalyticsSummary,
  getGroup,
  getModelGroupUptimeSummaries,
  getSidecarSnapshot,
  getSidecarInstance,
  getWorkspaceSlug,
  healthz,
  listAPIKeys,
  listEndpointGroups,
  listGroups,
  listInvocationAttempts,
  listInvocationRequests,
  listMyWorkspaces,
  listEndpoints,
  listDriverProfiles,
  listDrivers,
  listSidecarTokens,
  listSidecarInstances,
  listWorkspaces,
  saveWorkspaceSlug,
  moveEndpoint,
  updateAPIKey,
  updateGroup,
  updateEndpoint,
  updateDriverAlias,
  updateEndpointGroup,
  updateEndpointSchedule,
  updateSidecarToken,
  updateWorkspace,
  uploadDriverProfile
} from './api';
import type {
  APIKey,
  InvocationAnalyticsSummary,
  InvocationAttempt,
  InvocationOutcome,
  InvocationRequest,
  ImageProtocolContract,
  Locale,
  ModelGroup,
  ModelGroupMapping,
  ModelGroupUptimeSummary,
  ModelKind,
  Endpoint,
  DriverCatalogItem,
  DriverProfile,
  DriverUploadManifest,
  EndpointGroup,
  EndpointModel,
  SidecarSnapshot,
  SidecarToken,
  SidecarInstance,
  SidecarInstanceDetail,
  TextProtocolContract,
  ThemeName,
  Workspace,
  WorkspaceAccess,
  WorkspaceCapability,
  WorkspaceRole
} from './types';
import type {
  APIKeyPayload,
  EndpointGroupPayload,
  GroupPayload,
  SidecarTokenPayload,
  WorkspacePayload
} from './api';
import {
  canManageWorkspaceMembers,
  canWriteWorkspaceMembers,
  endpointModelCompatibility,
  filterDriversByKind,
  hasWorkspaceCapability,
  normalizeGroupMappings,
  endpointInsightRows,
  routingTierLabel,
  sortGroupMappingsByTier,
  uptimeTone
} from './domain';
import { createTranslator } from './i18n';
import { applyTheme, initialLocale, initialTheme, persistLocale, persistTheme, subscribeToSystemTheme } from './theme';
import type { AdminPrincipal, PublicAdminAuthConfig } from './auth';
import legateLogo from './assets/legate-transparent.png';
import WorkspaceMembersPanel from './WorkspaceMembersPanel';
import AdminUsersPage from './AdminUsersPage';
import { SelectControl, SelectField } from './SelectControl';
import EndpointsPage, { type EndpointGroupListItem } from './EndpointsPage';
import EndpointEditor, { EndpointDetail, type EndpointEditorSubmission } from './EndpointEditor';
import TextProtocolSelector from './TextProtocolSelector';
import ImageProtocolSelector from './ImageProtocolSelector';
import { ModelGroupMappingVisualizer } from './ModelGroupMappingVisualizer';
import ModelGroupDetailPage from './ModelGroupDetailPage';
import { TEXT_PROTOCOL_CONTRACTS, textProtocolDisplayName } from './textProtocols';
import { IMAGE_PROTOCOL_CONTRACTS, imageProtocolDisplayName } from './imageProtocols';
import { AnalyticsAttemptTable, AnalyticsCompletenessBanner, AnalyticsRequestTable, AnalyticsSummaryView, formatNanoUSD } from './AnalyticsViews';

const MODEL_GROUP_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export type PageKey = 'overview' | 'endpoints' | 'drivers' | 'groups' | 'keys' | 'sidecars' | 'analytics' | 'workspaces' | 'users';
type AnalyticsTab = 'endpoints' | 'pricing' | 'performance' | 'uptime' | 'activity';
type AnalyticsRangeKey = '15m' | '1h' | '6h' | '24h' | '7d' | '30d';
type AnalyticsRangeSelection =
  | { kind: 'preset'; key: AnalyticsRangeKey }
  | { kind: 'absolute'; from: string; to: string };
type SidecarView = 'instances' | 'tokens';
type DriverView = 'builtin' | 'profiles';
type DriverKindFilter = 'all' | ModelKind;
type GroupMappingView = 'list' | 'visual';
type GroupUptimeState = 'idle' | 'loading' | 'ready' | 'error';
type ModalName = 'endpoint' | 'endpointDetail' | 'endpointGroup' | 'driverUpload' | 'driverDetail' | 'group' | 'key' | 'sidecar' | 'workspace' | 'members' | 'token' | 'delete' | null;
type DeleteTarget = {
  kind: 'endpoint' | 'endpointGroup' | 'driverProfile' | 'group' | 'key' | 'sidecar';
  id: number;
  name: string;
};

const NAV_SECTIONS: Array<{ labelKey?: string; pages: PageKey[] }> = [
  { pages: ['overview', 'endpoints', 'drivers', 'groups', 'keys', 'sidecars'] },
  { labelKey: 'nav.sectionInsights', pages: ['analytics'] },
  { labelKey: 'nav.sectionPlatform', pages: ['workspaces', 'users'] }
];

interface ToastState {
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface DriverUploadDraft {
  manifestFile: File | null;
  wasmFile: File | null;
  manifest: DriverUploadManifest | null;
  manifestError: string;
}

interface GroupDraft extends Omit<GroupPayload, 'firstResponseTimeoutSeconds' | 'mappings'> {
  id?: number;
  firstResponseTimeoutSeconds: string;
  mappings: ModelGroupMapping[];
}

interface EndpointGroupDraft extends EndpointGroupPayload {
  id?: number;
}

interface APIKeyDraft extends APIKeyPayload {
  id?: number;
}

interface SidecarDraft extends SidecarTokenPayload {
  id?: number;
}

interface WorkspaceDraft extends WorkspacePayload {
  id?: number;
}

const emptyOutcomeCounts = {
  success: 0,
  clientError: 0,
  authError: 0,
  routingError: 0,
  capacityError: 0,
  upstreamError: 0,
  timeout: 0,
  canceled: 0,
  internalError: 0
};

const emptySummary: InvocationAnalyticsSummary = {
  window: { from: '', to: '' },
  requests: { count: 0, successfulCount: 0, failedCount: 0, outcomes: emptyOutcomeCounts, averageDurationMs: null },
  attempts: {
    count: 0,
    successfulCount: 0,
    failedCount: 0,
    outcomes: emptyOutcomeCounts,
    availableCount: 0,
    unavailableCount: 0,
    retryableCount: 0,
    retriedCount: 0,
    finalCount: 0,
    committedCount: 0,
    usage: {
      knownInputTokens: null,
      knownOutputTokens: null,
      knownCachedTokens: null,
      knownReasoningTokens: null,
      finalAttemptCount: 0,
      partialAttemptCount: 0,
      unavailableAttemptCount: 0
    },
    cost: { knownEndpointCostNanoUSD: '0', knownAttemptCount: 0, unknownAttemptCount: 0 },
    averageDurationMs: null,
    averageTimeToFirstEventMs: null,
    averageTimeToFirstOutputMs: null
  },
  completeness: {
    complete: true,
    coverageStartedAt: null,
    coveredThrough: null,
    expectedSourceCount: 0,
    reportingSourceCount: 0,
    completeSourceCount: 0,
    missingCurrentSessionSourceCount: 0,
    inactiveSourceCount: 0,
    staleSourceCount: 0,
    coverageGapSourceCount: 0,
    watermarkMissingSourceCount: 0,
    pendingQueueSourceCount: 0,
    pendingInFlightSourceCount: 0,
    knownLossSourceCount: 0,
    unknownLossSourceCount: 0,
    saturatedSourceCount: 0,
    knownDroppedEventCount: 0,
    dropCounterSaturated: false,
    knownDroppedEventCountSaturated: false,
    sources: []
  }
};

const analyticsRanges: Array<{ key: AnalyticsRangeKey; labelKey: string; minutes: number }> = [
  { key: '15m', labelKey: 'analytics.range15m', minutes: 15 },
  { key: '1h', labelKey: 'analytics.range1h', minutes: 60 },
  { key: '6h', labelKey: 'analytics.range6h', minutes: 360 },
  { key: '24h', labelKey: 'analytics.range24h', minutes: 1440 },
  { key: '7d', labelKey: 'analytics.range7d', minutes: 10080 },
  { key: '30d', labelKey: 'analytics.range30d', minutes: 43200 }
];

const invocationOutcomes: InvocationOutcome[] = [
  'success',
  'client_error',
  'auth_error',
  'routing_error',
  'capacity_error',
  'upstream_error',
  'timeout',
  'canceled',
  'internal_error'
];

const pageIcons = {
  overview: Activity,
  endpoints: Server,
  drivers: Cpu,
  groups: Layers,
  keys: KeyRound,
  sidecars: Boxes,
  analytics: ChartColumn,
  workspaces: Database,
  users: Users
};

const navIconProps = {
  size: 18,
  strokeWidth: 1.25,
  absoluteStrokeWidth: true
} as const;

const PAGE_PATHS: Record<PageKey, string> = {
  overview: '/',
  endpoints: '/endpoints',
  drivers: '/drivers',
  groups: '/groups',
  keys: '/keys',
  sidecars: '/sidecars',
  analytics: '/analytics',
  workspaces: '/workspaces',
  users: '/users'
};

export function pageKeyForPath(pathname: string): PageKey {
  if (/^\/groups\/\d+$/.test(pathname)) return 'groups';
  return (Object.entries(PAGE_PATHS).find(([, path]) => path === pathname)?.[0] as PageKey | undefined) ?? 'overview';
}

export function groupIdForPath(pathname: string): number | null {
  const match = pathname.match(/^\/groups\/(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function pathForPageKey(page: PageKey): string {
  return PAGE_PATHS[page];
}

interface AppProps {
  currentAdmin: AdminPrincipal;
  authConfig: PublicAdminAuthConfig;
  onLogout: () => Promise<void>;
}

export default function App({ currentAdmin, authConfig, onLogout }: AppProps) {
  const [theme, setTheme] = useState<ThemeName>(() => initialTheme());
  const [locale, setLocale] = useState<Locale>(() => initialLocale());
  const t = useMemo(() => createTranslator(locale), [locale]);

  const [activePage, setActivePage] = useState<PageKey>(() => pageKeyForPath(window.location.pathname));
  const [groupDetailId, setGroupDetailId] = useState<number | null>(() => groupIdForPath(window.location.pathname));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsed());
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<'unknown' | 'ok' | 'failed'>('unknown');
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  const [workspaceSlug, setWorkspaceSlug] = useState(() => getWorkspaceSlug());

  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [endpointGroups, setEndpointGroups] = useState<EndpointGroup[]>([]);
  const [drivers, setDrivers] = useState<DriverCatalogItem[]>([]);
  const [driverProfiles, setDriverProfiles] = useState<DriverProfile[]>([]);
  const [groups, setGroups] = useState<ModelGroup[]>([]);
  const [groupUptimes, setGroupUptimes] = useState<ModelGroupUptimeSummary[]>([]);
  const [groupUptimeState, setGroupUptimeState] = useState<GroupUptimeState>('idle');
  const [groupDetailLoadError, setGroupDetailLoadError] = useState<'notFound' | 'error' | ''>('');
  const [apiKeys, setAPIKeys] = useState<APIKey[]>([]);
  const [sidecars, setSidecars] = useState<SidecarToken[]>([]);
  const [sidecarView, setSidecarView] = useState<SidecarView>(() => sidecarViewForSearch(window.location.search));
  const [sidecarInstances, setSidecarInstances] = useState<SidecarInstance[]>([]);
  const [sidecarInstanceTotal, setSidecarInstanceTotal] = useState(0);
  const [sidecarInstancesLoading, setSidecarInstancesLoading] = useState(false);
  const [sidecarInstanceError, setSidecarInstanceError] = useState('');
  const [sidecarSearch, setSidecarSearch] = useState('');
  const [sidecarOnlineFilter, setSidecarOnlineFilter] = useState('');
  const [sidecarTokenFilter, setSidecarTokenFilter] = useState('');
  const [sidecarVersionFilter, setSidecarVersionFilter] = useState('');
  const [sidecarInstanceOffset, setSidecarInstanceOffset] = useState(0);
  const [selectedSidecarInstance, setSelectedSidecarInstance] = useState<SidecarInstanceDetail | null>(null);
  const [sidecarDetailError, setSidecarDetailError] = useState('');
  const [myWorkspaces, setMyWorkspaces] = useState<WorkspaceAccess[]>([]);
  const [platformWorkspaces, setPlatformWorkspaces] = useState<Workspace[]>([]);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(currentAdmin.platformAdmin);
  const [summary, setSummary] = useState<InvocationAnalyticsSummary>(emptySummary);
  const [requests, setRequests] = useState<InvocationRequest[]>([]);
  const [endpointAttempts, setEndpointAttempts] = useState<InvocationAttempt[]>([]);
  const [activityAttempts, setActivityAttempts] = useState<InvocationAttempt[]>([]);

  const [driverView, setDriverView] = useState<DriverView>('builtin');
  const [driverKindFilter, setDriverKindFilter] = useState<DriverKindFilter>('all');
  const [analyticsKind, setAnalyticsKind] = useState<ModelKind>('text');
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('endpoints');
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRangeSelection>({ kind: 'preset', key: '15m' });
  const [analyticsOutcome, setAnalyticsOutcome] = useState<InvocationOutcome | ''>('');

  const [modal, setModal] = useState<ModalName>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [endpointEditorTarget, setEndpointEditorTarget] = useState<{ group: EndpointGroup; endpoint?: Endpoint } | null>(null);
  const [endpointGroupDraft, setEndpointGroupDraft] = useState<EndpointGroupDraft | null>(null);
  const [driverUploadDraft, setDriverUploadDraft] = useState<DriverUploadDraft | null>(null);
  const [selectedEndpointDriver, setSelectedEndpointDriver] = useState<DriverCatalogItem | null>(null);
  const [editingDriverAlias, setEditingDriverAlias] = useState(false);
  const [driverAliasDraft, setDriverAliasDraft] = useState('');
  const [selectedEndpointDetail, setSelectedEndpointDetail] = useState<Endpoint | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft | null>(null);
  const [groupMappingView, setGroupMappingView] = useState<GroupMappingView>('list');
  const [pendingMappingTierIndex, setPendingMappingTierIndex] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState<APIKeyDraft | null>(null);
  const [sidecarDraft, setSidecarDraft] = useState<SidecarDraft | null>(null);
  const [workspaceDraft, setWorkspaceDraft] = useState<WorkspaceDraft | null>(null);
  const [memberWorkspace, setMemberWorkspace] = useState<Pick<Workspace, 'id' | 'slug' | 'name'> | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState('');
  const [oneTimeTokenCopied, setOneTimeTokenCopied] = useState(false);
  const [sidecarVerifyToken, setSidecarVerifyToken] = useState('');
  const [sidecarVerifyResult, setSidecarVerifyResult] = useState('');
  const sidecarRequestRef = useRef(0);
  const sidecarDetailRequestRef = useRef(0);
  const sidecarDrawerTriggerRef = useRef<HTMLElement | null>(null);
  const refreshRequestRef = useRef(0);
  const selfDemotedRef = useRef(false);

  const currentWorkspace =
    myWorkspaces.find((item) => item.slug === workspaceSlug) ??
    myWorkspaces.find((item) => item.status === 'active') ??
    myWorkspaces[0] ??
    null;
  const canReadEndpoints = canReadWorkspaceResource(currentWorkspace, 'endpoints:read', 'endpoints:write');
  const canWriteEndpoints = hasWorkspaceCapability(currentWorkspace, 'endpoints:write');
  const canReadEndpointDrivers = canReadWorkspaceResource(currentWorkspace, 'endpoint_drivers:read', 'endpoint_drivers:write');
  const canWriteEndpointDrivers = hasWorkspaceCapability(currentWorkspace, 'endpoint_drivers:write');
  const canReadGroups = canReadWorkspaceResource(currentWorkspace, 'model_groups:read', 'model_groups:write');
  const canWriteGroups = hasWorkspaceCapability(currentWorkspace, 'model_groups:write');
  const canReadAPIKeys = canReadWorkspaceResource(currentWorkspace, 'api_keys:read', 'api_keys:write');
  const canWriteAPIKeys = hasWorkspaceCapability(currentWorkspace, 'api_keys:write');
  const canReadSidecars = canReadWorkspaceResource(currentWorkspace, 'sidecar_tokens:read', 'sidecar_tokens:write');
  const canWriteSidecars = hasWorkspaceCapability(currentWorkspace, 'sidecar_tokens:write');
  const canReadAnalytics = hasWorkspaceCapability(currentWorkspace, 'analytics:read');

  useEffect(() => {
    applyTheme(theme, locale);
    persistTheme(theme);
    persistLocale(locale);
    if (theme === 'system') {
      return subscribeToSystemTheme(() => applyTheme(theme, locale));
    }
  }, [theme, locale]);

  useEffect(() => {
    writeSidebarCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handlePopState = () => {
      setActivePage(pageKeyForPath(window.location.pathname));
      setGroupDetailId(groupIdForPath(window.location.pathname));
      setSidecarView(sidecarViewForSearch(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const analyticsRangeSignature = useMemo(
    () => (analyticsRange.kind === 'preset' ? `preset:${analyticsRange.key}` : `absolute:${analyticsRange.from}|${analyticsRange.to}`),
    [analyticsRange]
  );
  const activeAnalyticsRangeSignature = activePage === 'analytics'
    ? `${analyticsRangeSignature}|outcome:${analyticsOutcome}`
    : activePage === 'overview' ? analyticsRangeSignature : '';
  const activeSidecarView = activePage === 'sidecars' ? sidecarView : null;

  useEffect(() => {
    void refresh();
  }, [activePage, groupDetailId, workspaceSlug, activeAnalyticsRangeSignature, activeSidecarView]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.tone === 'error' ? 4500 : 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!oneTimeTokenCopied) return;
    const timer = window.setTimeout(() => setOneTimeTokenCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [oneTimeTokenCopied]);

  useEffect(() => {
    if (!canReadSidecars || activePage !== 'sidecars' || sidecarView !== 'instances') return;
    const timer = window.setTimeout(() => void loadSidecarInstances(), sidecarSearch ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [activePage, sidecarView, workspaceSlug, canReadSidecars, sidecarSearch, sidecarOnlineFilter, sidecarTokenFilter, sidecarVersionFilter, sidecarInstanceOffset]);

  useEffect(() => {
    if (!selectedSidecarInstance) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSidecarDrawer();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedSidecarInstance]);

  const analyticsRows = useMemo(() => endpointInsightRows(endpoints, endpointAttempts, analyticsKind), [endpoints, endpointAttempts, analyticsKind]);
  const filteredGroups = groups;
  const groupUptimeByID = useMemo(
    () => new Map(groupUptimes.map((summary) => [summary.groupId, summary])),
    [groupUptimes]
  );
  const filteredKeys = apiKeys;
  const filteredSidecars = sidecars;
  const sidecarVersions = useMemo(
    () => Array.from(new Set(sidecars.flatMap((token) => token.versions.map((version) => version.version)))).sort(),
    [sidecars]
  );
  const sidecarRuntime = useMemo(
    () => sidecars.reduce((summary, token) => ({
      total: summary.total + token.instanceCount,
      online: summary.online + token.onlineInstanceCount,
      offline: summary.offline + token.offlineInstanceCount
    }), { total: 0, online: 0, offline: 0 }),
    [sidecars]
  );

  async function loadSidecarInstances(readable = canReadSidecars) {
    if (!readable) {
      setSidecarInstances([]);
      setSidecarInstanceTotal(0);
      setSidecarInstanceError('');
      return;
    }
    const requestID = ++sidecarRequestRef.current;
    setSidecarInstancesLoading(true);
    setSidecarInstanceError('');
    const tokensResultPromise = listSidecarTokens().then(
      (value) => ({ status: 'fulfilled', value } as const),
      (reason) => ({ status: 'rejected', reason } as const)
    );
    try {
      const page = await listSidecarInstances({
        q: sidecarSearch,
        online: sidecarOnlineFilter === '' ? undefined : sidecarOnlineFilter === 'true',
        tokenId: sidecarTokenFilter ? Number(sidecarTokenFilter) : undefined,
        version: sidecarVersionFilter,
        limit: 50,
        offset: sidecarInstanceOffset
      });
      if (requestID !== sidecarRequestRef.current) return;
      setSidecarInstances(page.items);
      setSidecarInstanceTotal(page.total);
      const tokensResult = await tokensResultPromise;
      if (requestID !== sidecarRequestRef.current) return;
      if (tokensResult.status === 'fulfilled') setSidecars(tokensResult.value);
      else setSidecarInstanceError(errorMessage(tokensResult.reason, t));
    } catch (loadError) {
      if (requestID !== sidecarRequestRef.current) return;
      setSidecarInstances([]);
      setSidecarInstanceTotal(0);
      setSidecarInstanceError(errorMessage(loadError, t));
    } finally {
      if (requestID === sidecarRequestRef.current) setSidecarInstancesLoading(false);
    }
  }

  function changeSidecarView(view: SidecarView) {
    setSidecarView(view);
    const query = new URLSearchParams(window.location.search);
    query.set('view', view);
    window.history.pushState({}, '', `/sidecars?${query}`);
  }

  async function openSidecarDrawer(instance: SidecarInstance, trigger: HTMLElement) {
    if (!canReadSidecars) return;
    sidecarDrawerTriggerRef.current = trigger;
    setSelectedSidecarInstance({ ...instance, telemetry: null });
    setSidecarDetailError('');
    const requestID = ++sidecarDetailRequestRef.current;
    try {
      const detail = await getSidecarInstance(instance.id);
      if (requestID === sidecarDetailRequestRef.current) setSelectedSidecarInstance(detail);
    } catch (detailError) {
      if (requestID === sidecarDetailRequestRef.current) setSidecarDetailError(errorMessage(detailError, t));
    }
  }

  function closeSidecarDrawer() {
    sidecarDetailRequestRef.current += 1;
    setSelectedSidecarInstance(null);
    setSidecarDetailError('');
    window.setTimeout(() => sidecarDrawerTriggerRef.current?.focus(), 0);
  }

  async function refresh() {
    const requestID = ++refreshRequestRef.current;
    setLoading(true);
    setError('');
    if (groupDetailId != null) setGroupDetailLoadError('');
    const range = analyticsRangeParams(analyticsRange);

    const myWorkspaceResult = await Promise.allSettled([listMyWorkspaces()]).then((results) => results[0]);
    if (requestID !== refreshRequestRef.current) return;
    let platform = false;
    let workspaceChanged = false;
    let resolvedAccess: WorkspaceAccess | null = null;
    let resolvedWorkspaceSlug = getWorkspaceSlug();

    if (myWorkspaceResult.status === 'fulfilled') {
      const access = myWorkspaceResult.value;
      setMyWorkspaces(access);
      platform = currentAdmin.platformAdmin && !selfDemotedRef.current;
      setIsPlatformAdmin(platform);
      if (access.length > 0 && !access.some((item) => item.slug === getWorkspaceSlug())) {
        const preferred = access.find((item) => item.status === 'active') ?? access[0];
        saveWorkspaceSlug(preferred.slug);
        setWorkspaceSlug(preferred.slug);
        resolvedWorkspaceSlug = preferred.slug;
        workspaceChanged = true;
      } else {
        setWorkspaceSlug(resolvedWorkspaceSlug);
      }
      resolvedAccess =
        access.find((item) => item.slug === resolvedWorkspaceSlug) ??
        access.find((item) => item.status === 'active') ??
        access[0] ??
        null;
    } else {
      setMyWorkspaces([]);
      platform = currentAdmin.platformAdmin && !selfDemotedRef.current;
      setIsPlatformAdmin(platform);
    }

    if (!platform) {
      setPlatformWorkspaces([]);
      const canOpenWorkspaces =
        myWorkspaceResult.status === 'fulfilled' &&
        myWorkspaceResult.value.some((item) => canManageWorkspaceMembers(item));
      if (activePage === 'workspaces' && !canOpenWorkspaces) setActivePage('overview');
    }

    const accessForRequest = resolvedAccess ? { ...resolvedAccess, platformAdmin: platform } : null;
    const readEndpoints = canReadWorkspaceResource(accessForRequest, 'endpoints:read', 'endpoints:write');
    const readEndpointDrivers = canReadWorkspaceResource(accessForRequest, 'endpoint_drivers:read', 'endpoint_drivers:write');
    const readGroups = canReadWorkspaceResource(accessForRequest, 'model_groups:read', 'model_groups:write');
    const readAPIKeys = canReadWorkspaceResource(accessForRequest, 'api_keys:read', 'api_keys:write');
    const readSidecars = canReadWorkspaceResource(accessForRequest, 'sidecar_tokens:read', 'sidecar_tokens:write');
    const readAnalytics = hasWorkspaceCapability(accessForRequest, 'analytics:read');
    let pageForRequest = activePage;
    if (!canOpenWorkspacePage(pageForRequest, accessForRequest, platform)) {
      pageForRequest = 'overview';
      setActivePage('overview');
      if (window.location.pathname !== PAGE_PATHS.overview || window.location.search) {
        window.history.replaceState({}, '', PAGE_PATHS.overview);
      }
    }

    const loadEndpoints = readEndpoints && ['overview', 'endpoints', 'groups', 'analytics'].includes(pageForRequest);
    const loadEndpointGroups = readEndpoints && (pageForRequest === 'endpoints' || (pageForRequest === 'groups' && groupDetailId != null));
    const loadDriverCatalog = readEndpointDrivers && ['endpoints', 'drivers', 'groups'].includes(pageForRequest);
    const loadDriverProfiles = readEndpointDrivers && pageForRequest === 'drivers';
    const loadGroups = readGroups && ['overview', 'groups', 'keys'].includes(pageForRequest);
    const loadGroupUptimes = readGroups && readAnalytics && pageForRequest === 'groups' && groupDetailId == null;
    const loadKeys = readAPIKeys && ['overview', 'keys'].includes(pageForRequest);
    const loadSidecarTokens = readSidecars && (
      pageForRequest === 'overview' || (pageForRequest === 'sidecars' && sidecarView === 'tokens')
    );
    const loadAnalytics = readAnalytics && ['overview', 'analytics'].includes(pageForRequest);
    const loadPlatformWorkspaces = platform && pageForRequest === 'workspaces';
    const groupUptimeTo = new Date();
    const groupUptimeRange = {
      from: new Date(groupUptimeTo.getTime() - 60 * 60 * 1000).toISOString(),
      to: groupUptimeTo.toISOString()
    };
    if (loadGroupUptimes) setGroupUptimeState('loading');
    const requestPageRequest = loadAnalytics && pageForRequest === 'overview'
      ? listInvocationRequests({ limit: 8, role: 'origin', ...range })
      : Promise.resolve({ items: [], nextCursor: null });
    const endpointAttemptPageRequest = loadAnalytics && pageForRequest === 'analytics'
      ? listInvocationAttempts({ limit: 160, ...range })
      : Promise.resolve({ items: [], nextCursor: null });
    const activityAttemptPageRequest = loadAnalytics && pageForRequest === 'analytics'
      ? analyticsOutcome
        ? listInvocationAttempts({ limit: 160, ...range, outcome: analyticsOutcome })
        : endpointAttemptPageRequest
      : Promise.resolve({ items: [], nextCursor: null });

    // Each route loads only the data it renders or needs for its edit forms.
    const [healthResult, endpointResult, endpointGroupResult, driverResult, driverProfileResult, groupResult, groupUptimeResult, keyResult, sidecarResult, summaryResult, requestPageResult, endpointAttemptPageResult, activityAttemptPageResult, workspaceResult] = await Promise.allSettled([
      healthz(),
      loadEndpoints ? listEndpoints() : Promise.resolve([]),
      loadEndpointGroups ? listEndpointGroups() : Promise.resolve([]),
      loadDriverCatalog ? listDrivers() : Promise.resolve([]),
      loadDriverProfiles ? listDriverProfiles() : Promise.resolve([]),
      loadGroups ? (pageForRequest === 'groups' && groupDetailId != null ? getGroup(groupDetailId).then((group) => [group]) : listGroups()) : Promise.resolve([]),
      loadGroupUptimes ? getModelGroupUptimeSummaries(groupUptimeRange) : Promise.resolve(null),
      loadKeys ? listAPIKeys() : Promise.resolve([]),
      loadSidecarTokens ? listSidecarTokens() : Promise.resolve([]),
      loadAnalytics ? getAnalyticsSummary(range) : Promise.resolve(emptySummary),
      requestPageRequest,
      endpointAttemptPageRequest,
      activityAttemptPageRequest,
      loadPlatformWorkspaces ? listWorkspaces() : Promise.resolve([])
    ]);
    if (requestID !== refreshRequestRef.current) return;

    setHealth(healthResult.status === 'fulfilled' && healthResult.value.ok ? 'ok' : 'failed');
    if (!readEndpoints) setEndpoints([]);
    else if (loadEndpoints && endpointResult.status === 'fulfilled') setEndpoints(endpointResult.value);
    else if (workspaceChanged || (pageForRequest === 'groups' && groupDetailId != null)) setEndpoints([]);
    if (!readEndpoints) setEndpointGroups([]);
    else if (loadEndpointGroups && endpointGroupResult.status === 'fulfilled') setEndpointGroups(endpointGroupResult.value);
    else if (workspaceChanged || (pageForRequest === 'groups' && groupDetailId != null)) setEndpointGroups([]);
    if (!readEndpointDrivers) {
      setDrivers([]);
      setDriverProfiles([]);
    } else {
      if (loadDriverCatalog && driverResult.status === 'fulfilled') setDrivers(driverResult.value);
      else if (workspaceChanged) setDrivers([]);
      if (loadDriverProfiles && driverProfileResult.status === 'fulfilled') setDriverProfiles(driverProfileResult.value);
      else if (workspaceChanged) setDriverProfiles([]);
    }
    if (!readGroups) setGroups([]);
    else if (loadGroups && groupResult.status === 'fulfilled') {
      setGroups(groupResult.value);
      if (pageForRequest === 'groups' && groupDetailId != null) setGroupDetailLoadError('');
    } else if (workspaceChanged || (pageForRequest === 'groups' && groupDetailId != null)) {
      setGroups([]);
      if (groupResult.status === 'rejected' && pageForRequest === 'groups' && groupDetailId != null) {
        setGroupDetailLoadError(groupResult.reason instanceof LegateAPIError && groupResult.reason.status === 404 ? 'notFound' : 'error');
      }
    }
    if (loadGroupUptimes) {
      if (groupUptimeResult.status === 'fulfilled' && groupUptimeResult.value) {
        setGroupUptimes(groupUptimeResult.value.items);
        setGroupUptimeState('ready');
      } else {
        setGroupUptimes([]);
        setGroupUptimeState('error');
      }
    } else {
      setGroupUptimes([]);
      setGroupUptimeState('idle');
    }
    if (!readAPIKeys) setAPIKeys([]);
    else if (loadKeys && keyResult.status === 'fulfilled') setAPIKeys(keyResult.value);
    else if (workspaceChanged) setAPIKeys([]);
    if (!readSidecars) setSidecars([]);
    else if (loadSidecarTokens && sidecarResult.status === 'fulfilled') setSidecars(sidecarResult.value);
    else if (workspaceChanged) setSidecars([]);
    if (!readAnalytics) setSummary(emptySummary);
    else if (loadAnalytics && summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
    if (!readAnalytics) {
      setRequests([]);
      setEndpointAttempts([]);
      setActivityAttempts([]);
    } else {
      if (pageForRequest === 'overview') {
        setRequests(requestPageResult.status === 'fulfilled' ? requestPageResult.value.items : []);
      } else {
        setRequests([]);
      }
      if (pageForRequest === 'analytics') {
        setEndpointAttempts(endpointAttemptPageResult.status === 'fulfilled' ? endpointAttemptPageResult.value.items : []);
        setActivityAttempts(activityAttemptPageResult.status === 'fulfilled' ? activityAttemptPageResult.value.items : []);
      } else {
        setEndpointAttempts([]);
        setActivityAttempts([]);
      }
    }
    if (loadPlatformWorkspaces && workspaceResult.status === 'fulfilled') setPlatformWorkspaces(workspaceResult.value);
    else if (!platform || workspaceChanged) setPlatformWorkspaces([]);

    const requestedResults: Array<PromiseSettledResult<unknown> | null> = [
      loadEndpoints ? endpointResult : null,
      loadEndpointGroups ? endpointGroupResult : null,
      loadDriverCatalog ? driverResult : null,
      loadDriverProfiles ? driverProfileResult : null,
      loadGroups && !(pageForRequest === 'groups' && groupDetailId != null) ? groupResult : null,
      loadKeys ? keyResult : null,
      loadSidecarTokens ? sidecarResult : null,
      loadAnalytics ? summaryResult : null,
      loadAnalytics && pageForRequest === 'overview' ? requestPageResult : null,
      loadAnalytics && pageForRequest === 'analytics' ? endpointAttemptPageResult : null,
      loadAnalytics && pageForRequest === 'analytics' ? activityAttemptPageResult : null,
      loadPlatformWorkspaces ? workspaceResult : null
    ];
    const firstFailure = requestedResults.find((result): result is PromiseRejectedResult => result?.status === 'rejected');
    if (firstFailure) {
      setError(errorMessage(firstFailure.reason, t));
    }
    setLoading(false);
  }

  function clearWorkspaceData() {
    refreshRequestRef.current += 1;
    sidecarRequestRef.current += 1;
    sidecarDetailRequestRef.current += 1;
    setEndpoints([]);
    setEndpointGroups([]);
    setDrivers([]);
    setDriverProfiles([]);
    setGroups([]);
    setGroupUptimes([]);
    setGroupUptimeState('idle');
    setAPIKeys([]);
    setSidecars([]);
    setSidecarInstances([]);
    setSidecarInstanceTotal(0);
    setSelectedSidecarInstance(null);
    setSummary(emptySummary);
    setRequests([]);
    setEndpointAttempts([]);
    setActivityAttempts([]);
    setPlatformWorkspaces([]);
  }

  function switchWorkspace(slug: string) {
    if (!slug || slug === workspaceSlug) {
      setWorkspaceMenuOpen(false);
      return;
    }
    saveWorkspaceSlug(slug);
    clearWorkspaceData();
    setWorkspaceSlug(slug);
    setWorkspaceMenuOpen(false);
    setSettingsOpen(false);
    showToast('info', t('toast.workspaceSwitched'));
  }

  function openPage(page: PageKey) {
    setActivePage(page);
    setGroupDetailId(null);
    setGroupDetailLoadError('');
    if (page === 'sidecars') setSidecarView('instances');
    const path = pathForPageKey(page);
    if (window.location.pathname !== path || window.location.search) {
      window.history.pushState({}, '', path);
    }
  }

  function openGroupDetail(id: number) {
    setActivePage('groups');
    setGroupDetailId(id);
    setGroupDetailLoadError('');
    window.history.pushState({}, '', `/groups/${id}`);
  }

  function handleSelfDemoted() {
    refreshRequestRef.current += 1;
    selfDemotedRef.current = true;
    setIsPlatformAdmin(false);
    setMyWorkspaces([]);
    setPlatformWorkspaces([]);
    setActivePage('overview');
    if (window.location.pathname !== PAGE_PATHS.overview || window.location.search) {
      window.history.replaceState({}, '', PAGE_PATHS.overview);
    }
  }

  function showToast(tone: ToastState['tone'], message: string) {
    setToast({ tone, message });
  }

  function openEndpointDetail(endpoint: Endpoint) {
    if (!canReadEndpoints) return;
    setSelectedEndpointDetail(endpoint);
    setModal('endpointDetail');
  }

  function openEndpointModal(groupID: number, endpoint?: Endpoint) {
    if (!canWriteEndpoints) return;
    const group = endpointGroups.find((item) => item.id === (endpoint?.groupId ?? groupID));
    if (!group) return;
    setEndpointEditorTarget({ group, endpoint });
    setModal('endpoint');
  }

  async function saveEndpointSubmission(submission: EndpointEditorSubmission) {
    if (!canWriteEndpoints) return;
    const { id, groupId, kind, ...payload } = submission;
    await runAction(async () => {
      if (id) {
        const current = endpoints.find((endpoint) => endpoint.id === id);
        await updateEndpoint(id, payload);
        if (current && current.groupId !== groupId) await moveEndpoint(id, groupId);
      } else {
        await createEndpoint({ groupId, kind, ...payload });
      }
      setEndpointEditorTarget(null);
      setModal(null);
    }, t('toast.saved'));
  }

  function openEndpointGroupModal(group?: EndpointGroup) {
    if (!canWriteEndpoints) return;
    setEndpointGroupDraft({
      id: group?.id,
      name: group?.name ?? '',
      remark: group?.remark ?? '',
      sortOrder: group?.sortOrder ?? endpointGroups.length
    });
    setModal('endpointGroup');
  }

  async function saveEndpointGroupDraft() {
    if (!canWriteEndpoints || !endpointGroupDraft?.name.trim()) return;
    const payload: EndpointGroupPayload = {
      name: endpointGroupDraft.name.trim(),
      remark: endpointGroupDraft.remark.trim(),
      sortOrder: endpointGroupDraft.sortOrder
    };
    await runAction(async () => {
      if (endpointGroupDraft.id) await updateEndpointGroup(endpointGroupDraft.id, payload);
      else await createEndpointGroup(payload);
      setEndpointGroupDraft(null);
      setModal(null);
    }, t('toast.saved'));
  }

  function openGroupModal(group?: ModelGroup) {
    if (!canWriteGroups) return;
    const kind = group?.kind ?? 'text';
    setGroupMappingView('list');
    setPendingMappingTierIndex(null);
    setGroupDraft({
      id: group?.id,
      name: group?.name ?? '',
      kind,
      description: group?.description ?? '',
      status: group?.status ?? 'normal',
      firstResponseTimeoutSeconds: group?.firstResponseTimeoutSeconds == null
        ? ''
        : String(group.firstResponseTimeoutSeconds),
      routingMode: group?.routingMode ?? 'tiered_failover',
      sidecarConfigMode: group?.sidecarConfigMode ?? 'reference',
      inboundProtocolContracts: group?.inboundProtocolContracts?.length
        ? [...group.inboundProtocolContracts]
        : kind === 'text' ? [...TEXT_PROTOCOL_CONTRACTS] : kind === 'image' ? [...IMAGE_PROTOCOL_CONTRACTS] : [],
      mappings: group?.mappings?.length ? normalizeGroupMappings(group.mappings.map((mapping) => ({ ...mapping }))) : [emptyMapping(kind)]
    });
    setModal('group');
  }

  async function saveGroupDraft() {
    if (!canWriteGroups) return;
    if (!groupDraft?.name.trim()) {
      showToast('error', `${t('groups.name')} ${t('form.required')}`);
      return;
    }
    if (!MODEL_GROUP_NAME_PATTERN.test(groupDraft.name.trim())) {
      showToast('error', t('form.invalidGroupName'));
      return;
    }
    const mappings = normalizeGroupMappings(
      groupDraft.mappings.filter((mapping) => mapping.endpointId && mapping.modelId.trim())
    );
    if (groupDraft.kind === 'text' && groupDraft.inboundProtocolContracts.length === 0) {
      showToast('error', t('form.selectInvocations'));
      return;
    }
    if (groupDraft.kind === 'image' && groupDraft.inboundProtocolContracts.length === 0) {
      showToast('error', t('form.selectInvocations'));
      return;
    }
    if (mappings.length === 0) {
      showToast('error', t('form.selectMappings'));
      return;
    }
    const timeoutSeconds = groupDraft.firstResponseTimeoutSeconds.trim();
    const parsedTimeoutSeconds = timeoutSeconds === '' ? null : Number(timeoutSeconds);
    if (parsedTimeoutSeconds !== null &&
      (!Number.isInteger(parsedTimeoutSeconds) || parsedTimeoutSeconds < 1 || parsedTimeoutSeconds > 1800)) {
      showToast('error', t('form.invalidFirstResponseTimeout'));
      return;
    }
    const hasIncompatibleMapping = mappings.some((mapping) => {
      const endpoint = endpoints.find((item) => item.id === mapping.endpointId);
      const model = endpoint?.models.find((item) => item.id === mapping.modelId);
      return !endpoint || !model || !endpointModelCompatibility(endpoint, model, groupDraft, drivers).compatible;
    });
    if (hasIncompatibleMapping) {
      showToast('error', t('form.incompatibleMappings'));
      return;
    }
    const payload: GroupPayload = {
      name: groupDraft.name.trim(),
      kind: groupDraft.kind,
      description: groupDraft.description.trim(),
      status: groupDraft.status,
      firstResponseTimeoutSeconds: parsedTimeoutSeconds,
      routingMode: groupDraft.routingMode,
      sidecarConfigMode: groupDraft.sidecarConfigMode,
      inboundProtocolContracts: groupDraft.kind === 'video' ? [] : groupDraft.inboundProtocolContracts,
      mappings: mappings.map((mapping) => ({
        endpointId: mapping.endpointId,
        modelId: mapping.modelId,
        tier: mapping.tier ?? 0,
        weight: mapping.weight ?? 100,
        sortOrder: mapping.sortOrder ?? 0
      }))
    };
    await runAction(async () => {
      if (groupDraft.id) await updateGroup(groupDraft.id, payload);
      else await createGroup(payload);
      setModal(null);
    }, t('toast.saved'));
  }

  function openDriverUploadModal() {
    if (!canWriteEndpointDrivers) return;
    setDriverUploadDraft({ manifestFile: null, wasmFile: null, manifest: null, manifestError: '' });
    setModal('driverUpload');
  }

  async function selectDriverManifest(file: File | null) {
    if (!file) {
      setDriverUploadDraft((current) => current ? { ...current, manifestFile: null, manifest: null, manifestError: '' } : current);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await readFileText(file));
      if (!isDriverUploadManifest(parsed)) {
        throw new Error('invalid manifest');
      }
      setDriverUploadDraft((current) => current ? { ...current, manifestFile: file, manifest: parsed, manifestError: '' } : current);
    } catch {
      setDriverUploadDraft((current) => current ? { ...current, manifestFile: file, manifest: null, manifestError: t('drivers.invalidManifest') } : current);
    }
  }

  async function submitDriverUpload() {
    if (!canWriteEndpointDrivers || !driverUploadDraft?.manifestFile || !driverUploadDraft.wasmFile || !driverUploadDraft.manifest) {
      showToast('error', t('form.selectDriverFiles'));
      return;
    }
    const manifest = driverUploadDraft.manifest;
    const wasmFile = driverUploadDraft.wasmFile;
    await runAction(async () => {
      await uploadDriverProfile(manifest, wasmFile);
      setModal(null);
      setDriverUploadDraft(null);
    }, t('toast.driverUploaded'));
  }

  function openDriverDetail(driver: DriverCatalogItem) {
    if (!canReadEndpointDrivers) return;
    setSelectedEndpointDriver(driver);
    setDriverAliasDraft(endpointDriverAlias(driver));
    setEditingDriverAlias(false);
    setModal('driverDetail');
  }

  async function saveDriverAlias(alias: string) {
    if (!canWriteEndpointDrivers || !selectedEndpointDriver) return;
    const normalized = alias.trim();
    if (normalized.length > 120) {
      showToast('error', t('drivers.aliasTooLong'));
      return;
    }
    await runAction(async () => {
      await updateDriverAlias(selectedEndpointDriver.ref, normalized);
      const nextDriver = { ...selectedEndpointDriver, alias: normalized || undefined };
      setSelectedEndpointDriver(nextDriver);
      setDrivers((drivers) => drivers.map((driver) => driver.ref === nextDriver.ref ? nextDriver : driver));
      setDriverAliasDraft(normalized);
      setEditingDriverAlias(false);
    }, t('toast.driverAliasUpdated'));
  }

  function openKeyModal(key?: APIKey) {
    if (!canWriteAPIKeys) return;
    setKeyDraft({
      id: key?.id,
      name: key?.name ?? '',
      remark: key?.remark ?? '',
      status: key?.status ?? 'enabled',
      modelGroupIds: key?.modelGroups.map((group) => group.groupId) ?? []
    });
    setModal('key');
  }

  async function saveKeyDraft() {
    if (!canWriteAPIKeys) return;
    if (!keyDraft?.name.trim()) {
      showToast('error', `${t('keys.name')} ${t('form.required')}`);
      return;
    }
    if (keyDraft.modelGroupIds.length === 0) {
      showToast('error', t('form.selectGroups'));
      return;
    }
    const payload: APIKeyPayload = {
      name: keyDraft.name.trim(),
      remark: keyDraft.remark.trim(),
      status: keyDraft.status,
      modelGroupIds: keyDraft.modelGroupIds
    };
    await runAction(async () => {
      if (keyDraft.id) await updateAPIKey(keyDraft.id, payload);
      else {
        const created = await createAPIKey(payload);
        setOneTimeToken(created.key);
        setOneTimeTokenCopied(false);
        setModal('token');
      }
      if (keyDraft.id) setModal(null);
    }, t('toast.saved'));
  }

  function openSidecarModal(token?: SidecarToken) {
    if (!canWriteSidecars) return;
    setSidecarDraft({
      id: token?.id,
      name: token?.name ?? '',
      remark: token?.remark ?? '',
      status: token?.status ?? 'enabled'
    });
    setModal('sidecar');
  }

  async function saveSidecarDraft() {
    if (!canWriteSidecars) return;
    if (!sidecarDraft?.name.trim()) {
      showToast('error', `${t('sidecars.name')} ${t('form.required')}`);
      return;
    }
    const payload: SidecarTokenPayload = {
      name: sidecarDraft.name.trim(),
      remark: sidecarDraft.remark.trim(),
      status: sidecarDraft.status
    };
    await runAction(async () => {
      if (sidecarDraft.id) await updateSidecarToken(sidecarDraft.id, payload);
      else {
        const created = await createSidecarToken(payload);
        setOneTimeToken(created.key);
        setOneTimeTokenCopied(false);
        setModal('token');
      }
      if (sidecarDraft.id) setModal(null);
    }, t('toast.saved'));
  }

  function openWorkspaceModal(workspace?: Workspace) {
    if (!isPlatformAdmin) return;
    setWorkspaceDraft({
      id: workspace?.id,
      slug: workspace?.slug ?? '',
      name: workspace?.name ?? '',
      status: workspace?.status ?? 'active'
    });
    setModal('workspace');
  }

  async function saveWorkspaceDraft() {
    if (!isPlatformAdmin) return;
    if (!workspaceDraft?.slug.trim() || !workspaceDraft.name.trim()) {
      showToast('error', `${t('workspaces.slug')} / ${t('workspaces.name')} ${t('form.required')}`);
      return;
    }
    const payload: WorkspacePayload = {
      slug: workspaceDraft.slug.trim(),
      name: workspaceDraft.name.trim(),
      status: workspaceDraft.status
    };
    await runAction(async () => {
      if (workspaceDraft.id) await updateWorkspace(workspaceDraft.id, payload);
      else await createWorkspace(payload);
      setModal(null);
    }, t('toast.saved'));
  }

  function openMembersModal(workspace: Pick<Workspace, 'id' | 'slug' | 'name'>) {
    const access = myWorkspaces.find((item) => item.id === workspace.id);
    if (!isPlatformAdmin && !canManageWorkspaceMembers(access)) return;
    setMemberWorkspace(workspace);
    setModal('members');
  }

  async function verifySidecar() {
    if (!sidecarVerifyToken.trim()) {
      showToast('error', `${t('sidecars.verifyToken')} ${t('form.required')}`);
      return;
    }
    await runAction(async () => {
      const snapshot = await getSidecarSnapshot(sidecarVerifyToken.trim(), workspaceSlug);
      setSidecarVerifyResult(formatSidecarSnapshot(snapshot));
    }, t('toast.verified'));
  }

  async function runAction(action: () => Promise<void>, success: string) {
    setLoading(true);
    try {
      await action();
      showToast('success', success);
      await refresh();
    } catch (err) {
      showToast('error', errorMessage(err, t));
    } finally {
      setLoading(false);
    }
  }

  function canDeleteEntity(kind: DeleteTarget['kind']): boolean {
    if (kind === 'endpoint') return canWriteEndpoints;
    if (kind === 'endpointGroup') return canWriteEndpoints;
    if (kind === 'driverProfile') return canWriteEndpointDrivers;
    if (kind === 'group') return canWriteGroups;
    if (kind === 'key') return canWriteAPIKeys;
    return canWriteSidecars;
  }

  function openDeleteModal(kind: DeleteTarget['kind'], id: number, name: string) {
    if (!canDeleteEntity(kind)) return;
    setDeleteTarget({ kind, id, name });
    setDeleteConfirmText('');
    setModal('delete');
  }

  function closeDeleteModal() {
    setModal(null);
    setDeleteTarget(null);
    setDeleteConfirmText('');
  }

  async function confirmDeleteEntity() {
    if (!deleteTarget || !canDeleteEntity(deleteTarget.kind)) return;
    if (deleteTarget.kind !== 'endpointGroup' && deleteConfirmText.trim() !== t('form.confirmDeletePhrase')) {
      showToast('error', t('form.confirmDeleteMismatch'));
      return;
    }
    const { kind, id } = deleteTarget;
    await runAction(async () => {
      if (kind === 'endpoint') await deleteEndpoint(id);
      if (kind === 'endpointGroup') await deleteEndpointGroup(id);
      if (kind === 'driverProfile') await deleteDriverProfile(id);
      if (kind === 'group') await deleteGroup(id);
      if (kind === 'key') await deleteAPIKey(id);
      if (kind === 'sidecar') await deleteSidecarToken(id);
      closeDeleteModal();
    }, t('toast.deleted'));
  }

  async function removeEntity(kind: DeleteTarget['kind'], id: number, name = '') {
    openDeleteModal(kind, id, name);
  }

  async function copyValue(value?: string): Promise<boolean> {
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      showToast('success', t('toast.copied'));
      return true;
    } catch {
      showToast('error', t('toast.copyFailed'));
      return false;
    }
  }

  async function toggleSchedule(endpoint: Endpoint) {
    if (!canWriteEndpoints) return;
    await runAction(async () => {
      await updateEndpointSchedule(endpoint.id, !endpoint.scheduleEnabled);
    }, t('toast.scheduleUpdated'));
  }

  const workspaceConnected = health === 'ok';
  const workspaceSwitcherTitle = workspaceConnected
    ? (currentWorkspace?.name || workspaceSlug)
    : 'Unknown';
  const workspaceSwitcherSubtitle = workspaceConnected
    ? `${workspaceSlug}${currentWorkspace ? ` · ${currentWorkspace.platformAdmin ? t('workspace.platformAdmin') : roleLabel(currentWorkspace.role)}` : ''}`
    : t('app.disconnected');
  const workspaceSwitcherAvatar = workspaceConnected
    ? workspaceInitials(currentWorkspace?.name || workspaceSlug)
    : '?';
  const visibleNavSections = NAV_SECTIONS.map((section) => ({
    ...section,
    pages: section.pages.filter((page) => canOpenWorkspacePage(page, currentWorkspace, isPlatformAdmin))
  })).filter((section) => section.pages.length > 0);

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
      <aside className={[
        'sidebar',
        sidebarCollapsed ? 'collapsed' : '',
        workspaceMenuOpen ? 'workspace-menu-open' : ''
      ].filter(Boolean).join(' ')}>
        <div className="brand">
          {sidebarCollapsed ? (
            <button
              type="button"
              className="brand-toggle"
              data-testid="sidebar-toggle"
              onClick={() => {
                setSidebarCollapsed(false);
                setWorkspaceMenuOpen(false);
              }}
              aria-label={t('nav.expand')}
              title={t('nav.expand')}
            >
              <img
                className="brand-logo"
                src={legateLogo}
                alt=""
                draggable={false}
              />
              <PanelLeftOpen size={16} className="brand-expand-icon" aria-hidden="true" />
            </button>
          ) : (
            <>
              <span className="brand-mark">
                <img
                  className="brand-logo"
                  src={legateLogo}
                  alt="Legate"
                  draggable={false}
                />
              </span>
              <div>
                <strong>{t('app.name')}</strong>
              </div>
              <button
                type="button"
                className="sidebar-toggle"
                data-testid="sidebar-collapse"
                onClick={() => {
                  setSidebarCollapsed(true);
                  setWorkspaceMenuOpen(false);
                }}
                aria-label={t('nav.collapse')}
                title={t('nav.collapse')}
              >
                <PanelLeftClose size={16} />
              </button>
            </>
          )}
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          {visibleNavSections.map((section, index) => (
            <div key={section.labelKey ?? `section-${index}`}>
              {section.labelKey && (
                sidebarCollapsed
                  ? <div className="nav-section-divider" aria-hidden="true" />
                  : <div className="nav-section-label">{t(section.labelKey)}</div>
              )}
              {section.pages.map((page) => {
                const Icon = pageIcons[page];
                const label = t(`nav.${page}`);
                return (
                  <button
                    key={page}
                    type="button"
                    className={activePage === page ? 'nav-item active' : 'nav-item'}
                    onClick={() => openPage(page)}
                    title={label}
                    aria-label={label}
                  >
                    <Icon {...navIconProps} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          {workspaceMenuOpen && (
            <div className="workspace-menu" data-testid="workspace-menu">
              <div className="workspace-menu-head">
                <span>{t('workspace.switch')}</span>
                <span className={health === 'ok' ? 'health-ok' : 'health-failed'}>
                  {health === 'ok' ? t('app.connected') : t('app.disconnected')}
                </span>
              </div>
              <div className="workspace-menu-list">
                {myWorkspaces.length === 0 && <div className="workspace-empty">{t('workspace.empty')}</div>}
                {myWorkspaces.map((item) => {
                  const active = item.slug === workspaceSlug;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={active ? 'workspace-option active' : 'workspace-option'}
                      onClick={() => switchWorkspace(item.slug)}
                      disabled={item.status === 'disabled'}
                    >
                      <span className="workspace-avatar">{workspaceInitials(item.name || item.slug)}</span>
                      <span className="workspace-option-copy">
                        <strong>{item.name || item.slug}</strong>
                        <span>
                          {item.slug}
                          {' · '}
                          {item.platformAdmin ? t('workspace.platformAdmin') : roleLabel(item.role)}
                          {item.status === 'disabled' ? ` · ${t('status.disabled')}` : ''}
                        </span>
                      </span>
                      {active && <Check size={16} className="check" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button
            type="button"
            className={workspaceMenuOpen ? 'workspace-switcher open' : 'workspace-switcher'}
            data-testid="workspace-switcher"
            onClick={() => {
              setWorkspaceMenuOpen((open) => !open);
              setSettingsOpen(false);
            }}
            aria-label={t('workspace.switch')}
            title={workspaceSwitcherTitle}
          >
            <span className="workspace-avatar">{workspaceSwitcherAvatar}</span>
            {!sidebarCollapsed && (
              <>
                <span className="workspace-switcher-copy">
                  <strong>{workspaceSwitcherTitle}</strong>
                  <span>{workspaceSwitcherSubtitle}</span>
                </span>
                <span className="workspace-switcher-meta">
                  <span className={health === 'ok' ? 'health-dot ok' : health === 'failed' ? 'health-dot failed' : 'health-dot'} />
                  {workspaceMenuOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
              </>
            )}
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="top-actions">
            <div className="settings-wrap">
              <button
                type="button"
                className="avatar-button"
                onClick={() => {
                  setSettingsOpen((open) => !open);
                  setWorkspaceMenuOpen(false);
                }}
                aria-label={t('top.settings')}
              >
                <CircleUserRound size={23} />
                <ChevronDown size={14} />
              </button>
              {settingsOpen && (
                <section className="settings-menu" data-testid="settings-menu">
                  <div className="settings-head">
                    <UserCog size={18} />
                    <div className="settings-identity">
                      <strong>{currentAdmin.displayName || currentAdmin.email || `#${currentAdmin.userId}`}</strong>
                      <span>{currentAdmin.email || `#${currentAdmin.userId}`}</span>
                    </div>
                  </div>
                  <SettingRow label={t('settings.theme')}>
                    <Segmented
                      value={theme}
                      options={[
                        { value: 'system', label: t('settings.system'), icon: Monitor },
                        { value: 'light', label: t('settings.light'), icon: Sun },
                        { value: 'dark', label: t('settings.dark'), icon: Moon }
                      ]}
                      onChange={(value) => setTheme(value as ThemeName)}
                      testId="theme-toggle"
                    />
                  </SettingRow>
                  <SettingRow label={t('settings.language')}>
                    <Segmented
                      value={locale}
                      options={[
                        { value: 'zh', label: t('settings.zh'), icon: Globe2 },
                        { value: 'en', label: t('settings.en'), icon: Globe2 }
                      ]}
                      onChange={(value) => setLocale(value as Locale)}
                      testId="locale-toggle"
                    />
                  </SettingRow>
                  {authConfig.mode !== 'disabled' && (
                    <button type="button" className="settings-logout" onClick={() => void onLogout()}>
                      <LogOut size={16} aria-hidden="true" />
                      <span>{t('actions.logout')}</span>
                    </button>
                  )}
                </section>
              )}
            </div>
          </div>
        </header>

        {error && (
          <div className="notice error">
            <X size={18} />
            <span>{error}</span>
          </div>
        )}

        <section className="workspace-page">
          {activePage === 'overview' && renderOverview()}
          {activePage === 'endpoints' && canReadEndpoints && renderEndpoints()}
          {activePage === 'drivers' && canReadEndpointDrivers && renderDrivers()}
          {activePage === 'groups' && canReadGroups && (groupDetailId == null ? renderGroups() : (
            <ModelGroupDetailPage
              group={groups.find((group) => group.id === groupDetailId) ?? null}
              loading={loading}
              staticError={groupDetailLoadError}
              endpoints={endpoints}
              endpointGroups={endpointGroups}
              workspaceSlug={workspaceSlug}
              canReadAnalytics={canReadAnalytics}
              canReadEndpoints={canReadEndpoints}
              canWriteGroups={canWriteGroups}
              t={t}
              onBack={() => openPage('groups')}
              onRetry={() => void refresh()}
              onEdit={openGroupModal}
              onViewEndpoint={openEndpointDetail}
            />
          ))}
          {activePage === 'keys' && canReadAPIKeys && renderKeys()}
          {activePage === 'sidecars' && canReadSidecars && renderSidecars()}
          {activePage === 'analytics' && canReadAnalytics && renderAnalytics()}
          {activePage === 'workspaces' && (isPlatformAdmin || canManageWorkspaceMembers(currentWorkspace)) && renderWorkspaces()}
          {activePage === 'users' && isPlatformAdmin && (
            <AdminUsersPage
              currentUserId={currentAdmin.userId}
              methods={authConfig.methods}
              onSelfDemoted={handleSelfDemoted}
              onToast={showToast}
            />
          )}
        </section>
      </main>

      {toast && (
        <div
          className={`toast ${toast.tone}`}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
        >
          <span className="toast-icon" aria-hidden="true">
            {toast.tone === 'success' && <CircleCheck size={20} />}
            {toast.tone === 'error' && <CircleAlert size={20} />}
            {toast.tone === 'info' && <Info size={20} />}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label={t('toast.dismiss')}
            title={t('toast.dismiss')}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      )}
      {renderModal()}
      {canReadSidecars && selectedSidecarInstance && renderSidecarDrawer(selectedSidecarInstance)}
    </div>
  );

  function renderOverview() {
    const healthClass = health === 'ok' ? 'good' : 'danger';
    return (
      <>
        <PageIntro title={t('overview.title')} subtitle={t('overview.subtitle')} className="analytics-page-intro">
          {canReadAnalytics && (
            <>
              <button type="button" className="icon-button" onClick={() => void refresh()} aria-label={t('actions.refresh')} title={t('actions.refresh')}>
                <RefreshCw size={18} className={loading ? 'spin' : ''} />
              </button>
              <TimeRangePicker value={analyticsRange} onChange={setAnalyticsRange} t={t} />
            </>
          )}
        </PageIntro>
        {canReadAnalytics && <AnalyticsCompletenessBanner completeness={summary.completeness} t={t} />}
        {canReadAnalytics && (
          <div className="metrics-grid">
            <MetricCard label={t('overview.requests')} value={formatInteger(summary.requests.count)} trend={`${formatInteger(summary.requests.successfulCount)} ${t('overview.success')}`} />
            <MetricCard
              label={t('overview.availability')}
              value={formatPercent(analyticsAvailability(summary))}
              tone={uptimeTone(analyticsAvailability(summary))}
              trend={`${summary.attempts.availableCount}/${summary.attempts.count}`}
            />
            <MetricCard
              label={summary.attempts.cost.unknownAttemptCount > 0 ? t('analytics.knownCost') : t('overview.cost')}
              value={formatNanoUSD(summary.attempts.cost.knownEndpointCostNanoUSD)}
              trend={`${t('analytics.inputShort')} ${formatOptionalInteger(summary.attempts.usage.knownInputTokens)} · ${t('analytics.outputShort')} ${formatOptionalInteger(summary.attempts.usage.knownOutputTokens)}`}
            />
          </div>
        )}

        <div className="overview-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <span>{t('overview.health')}</span>
                <h2>{health === 'ok' ? t('app.connected') : t('app.disconnected')}</h2>
              </div>
              <StatusBadge label={health === 'ok' ? t('status.available') : t('status.unavailable')} tone={healthClass} />
            </div>
            <div className="hero-stats">
              {canReadEndpoints && <StatPill label={t('overview.endpoints')} value={String(endpoints.length)} />}
              {canReadGroups && <StatPill label={t('overview.groups')} value={String(groups.length)} />}
              {canReadAPIKeys && <StatPill label={t('overview.keys')} value={String(apiKeys.length)} />}
              {canReadSidecars && <StatPill label={t('overview.sidecars')} value={String(sidecars.length)} />}
            </div>
          </section>

          {canReadEndpoints && (
            <section className="panel">
              <div className="panel-head">
                <div>
                  <span>{t('overview.endpointHealth')}</span>
                  <h2>{t('endpoints.title')}</h2>
                </div>
              </div>
              <div className="endpoint-list compact-list">
                {endpoints.slice(0, 6).map((endpoint) => (
                  <div className="endpoint-health-row" key={endpoint.id}>
                    <EndpointAvatar name={endpoint.name} />
                    <div>
                      <strong>{endpoint.name}</strong>
                      <span>{endpoint.modelGroupNames.join(', ') || t('app.empty')}</span>
                    </div>
                    <Progress value={endpoint.uptime.percentage} tone={uptimeTone(endpoint.uptime.percentage)} />
                  </div>
                ))}
                {endpoints.length === 0 && <EmptyState label={t('app.empty')} />}
              </div>
            </section>
          )}
        </div>

        {canReadAnalytics && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <span>{t('overview.recent')}</span>
                <h2>{t('analytics.activity')}</h2>
              </div>
            </div>
            <AnalyticsRequestTable requests={requests} t={t} />
          </section>
        )}
      </>
    );
  }

  function renderEndpoints() {
    const grouped: EndpointGroupListItem[] = [...endpointGroups]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
      .map((group) => ({
        id: group.id,
        name: group.name,
        remark: group.remark,
        deleteBlocked: group.endpointCount > 0 || endpoints.some((endpoint) => endpoint.groupId === group.id),
        endpoints: endpoints
          .filter((endpoint) => endpoint.groupId === group.id)
          .map((endpoint) => ({
            id: endpoint.id,
            name: endpoint.name,
            remark: endpoint.remark,
            kind: endpoint.kind,
            status: endpoint.status,
            driverLabel: drivers.find((driver) => driver.ref === endpoint.driverRef)?.alias
              || drivers.find((driver) => driver.ref === endpoint.driverRef)?.manifest.displayName
              || endpoint.driverRef,
            modelCount: endpoint.models.length
          }))
      }));
    return (
      <EndpointsPage
        workspaceKey={currentWorkspace?.id ?? workspaceSlug}
        groups={grouped}
        canWrite={canWriteEndpoints}
        labels={{
          title: t('endpoints.title'),
          subtitle: t('endpoints.subtitle'),
          createGroup: t('endpoints.createGroup'),
          createEndpoint: (name) => t('endpoints.createInGroup').replace('{group}', name),
          openGroupActions: (name) => t('endpoints.groupActions').replace('{group}', name),
          deleteGroup: t('actions.delete'),
          groupDeleteBlocked: t('endpoints.groupDeleteBlocked'),
          expandGroup: (name) => t('endpoints.expandGroup').replace('{group}', name),
          collapseGroup: (name) => t('endpoints.collapseGroup').replace('{group}', name),
          openEndpoint: (name) => t('endpoints.openEndpoint').replace('{endpoint}', name),
          endpointCount: (count) => t('endpoints.endpointCount').replace('{count}', String(count)),
          modelCount: (count) => t('endpoints.modelCount').replace('{count}', String(count)),
          emptyGroup: t('endpoints.emptyGroup'),
          emptyPage: t('endpoints.emptyPage'),
          driver: t('endpoints.driver'),
          models: t('endpoints.models'),
          kind: t('endpoints.kind'),
          status: t('endpoints.status'),
          kinds: { text: t('kind.text'), image: t('kind.image'), video: t('kind.video') },
          statuses: {
            enabled: t('status.enabled'),
            disabled: t('status.disabled'),
            error: t('status.error')
          }
        }}
        onCreateGroup={() => openEndpointGroupModal()}
        onCreateEndpoint={(groupID) => openEndpointModal(groupID)}
        onDeleteGroup={(groupID) => {
          const group = endpointGroups.find((item) => item.id === groupID);
          if (!group || group.endpointCount > 0 || endpoints.some((endpoint) => endpoint.groupId === groupID)) return;
          openDeleteModal('endpointGroup', group.id, group.name);
        }}
        onOpenEndpoint={(endpointID) => {
          const endpoint = endpoints.find((item) => item.id === endpointID);
          if (endpoint) openEndpointDetail(endpoint);
        }}
      />
    );
  }

  function renderDrivers() {
    const builtins = drivers.filter((item) => item.source === 'builtin');
    const filteredBuiltins = driverKindFilter === 'all'
      ? builtins
      : builtins.filter((item) => item.manifest.kind === driverKindFilter);
    const filteredDriverProfiles = driverKindFilter === 'all'
      ? driverProfiles
      : driverProfiles.filter((profile) => profile.manifest.kind === driverKindFilter);
    const profileCatalog = new Map(drivers.filter((item) => item.source === 'profile').map((item) => [item.ref, item]));
    return (
      <>
        <PageIntro title={t('drivers.title')} subtitle={t('drivers.subtitle')} className="driver-page-intro" />

        <div className="driver-filter-bar">
          <div className="driver-filter-controls">
            <div className="driver-tabs">
              <Segmented
                value={driverView}
                options={[
                  { value: 'builtin', label: t('drivers.builtin'), icon: Cpu },
                  { value: 'profiles', label: t('drivers.profiles'), icon: Braces }
                ]}
                onChange={(value) => setDriverView(value as DriverView)}
                testId="driver-view"
                ariaLabel={t('drivers.sourceFilter')}
              />
            </div>
            <span className="driver-filter-divider" aria-hidden="true" />
            <div className="driver-kind-tabs">
              <Segmented
                value={driverKindFilter}
                options={[
                  { value: 'all', label: t('kind.all') },
                  { value: 'text', label: t('kind.text') },
                  { value: 'image', label: t('kind.image') },
                  { value: 'video', label: t('kind.video') }
                ]}
                onChange={(value) => setDriverKindFilter(value as DriverKindFilter)}
                testId="driver-kind-filter"
                ariaLabel={t('drivers.kindFilter')}
              />
            </div>
          </div>
          {driverView === 'profiles' && canWriteEndpointDrivers && (
            <button type="button" className="btn primary driver-upload-action" onClick={openDriverUploadModal}>
              <Upload size={16} /> {t('drivers.upload')}
            </button>
          )}
        </div>

        {driverView === 'builtin' ? (
          <section className="panel table-panel driver-table-panel">
            <div className="table-toolbar driver-catalog-toolbar">
              <div>
                <h3>{t('drivers.builtinCatalog')}</h3>
                <p>{t('drivers.builtinCatalogHelp')}</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table driver-table">
                <thead>
                  <tr>
                    <th>{t('drivers.name')}</th>
                    <th>{t('drivers.reference')}</th>
                    <th>{t('drivers.version')}</th>
                    <th>{t('drivers.runtime')}</th>
                    <th>{t('drivers.invocations')}</th>
                    <th>{t('drivers.management')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBuiltins.map((driver) => (
                    <tr key={driver.ref}>
                      <td><button type="button" className="table-name-link" onClick={() => openDriverDetail(driver)}><DriverNameWithAlias driver={driver} /></button></td>
                      <td><code>{driver.ref}</code></td>
                      <td>{driver.manifest.version}</td>
                      <td><span className="driver-runtime-tag">Built-in</span></td>
                      <td><TagList values={driverCapabilityLabels(driver)} more={0} /></td>
                      <td><TagList values={driver.manifest.managementCapabilities} more={0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredBuiltins.length === 0 && <EmptyState label={t('drivers.noMatchingKind')} />}
          </section>
        ) : (
          <section className="panel table-panel driver-table-panel">
            <div className="table-toolbar driver-catalog-toolbar">
              <div>
                <h3>{t('drivers.wasmCatalog')}</h3>
                <p>{t('drivers.wasmCatalogHelp')}</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table driver-profile-table">
                <colgroup>
                  <col className="driver-profile-name-col" />
                  <col className="driver-profile-ref-col" />
                  <col className="driver-profile-invocations-col" />
                  <col className="driver-profile-uploader-col" />
                  <col className="driver-profile-size-col" />
                  <col className="driver-profile-created-col" />
                  {canWriteEndpointDrivers && <col className="driver-profile-actions-col" />}
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('drivers.name')}</th>
                    <th>{t('drivers.reference')}</th>
                    <th>{t('drivers.invocations')}</th>
                    <th>{t('drivers.uploadedBy')}</th>
                    <th>{t('drivers.artifactSize')}</th>
                    <th>{t('drivers.createdAt')}</th>
                    {canWriteEndpointDrivers && <th className="actions-col">{t('actions.more')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredDriverProfiles.map((profile) => {
                    const driver = {
                      ...(profileCatalog.get(profile.ref) ?? {
                        ref: profile.ref,
                        source: 'profile' as const,
                        runtimeKind: 'wasm' as const,
                        manifest: profile.manifest,
                        profileId: profile.id,
                        artifactSizeBytes: profile.artifactSizeBytes,
                        createdAt: profile.createdAt
                      }),
                      uploadedBy: profile.uploadedBy
                    };
                    return (
                    <tr key={profile.id}>
                      <td><button type="button" className="table-name-link" onClick={() => openDriverDetail(driver)}><DriverNameWithAlias driver={driver} /></button></td>
                      <td className="driver-profile-ref-cell"><code title={profile.ref}>{profile.ref}</code></td>
                      <td><TagList className="driver-invocation-tags" values={driverCapabilityLabels(driver)} more={0} /></td>
                      <td className="driver-profile-uploader-cell" title={profile.uploadedBy.displayName}>{profile.uploadedBy.displayName}</td>
                      <td>{formatBytes(profile.artifactSizeBytes)}</td>
                      <td>{formatDate(profile.createdAt, t)}</td>
                      {canWriteEndpointDrivers && <td>
                        <RowActions>
                          <button type="button" title={t('actions.delete')} onClick={() => openDeleteModal('driverProfile', profile.id, endpointDriverAccessibleName(driver))}><Trash2 size={15} /></button>
                        </RowActions>
                      </td>}
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            {filteredDriverProfiles.length === 0 && (
              <EmptyState label={driverProfiles.length === 0 ? t('drivers.noProfiles') : t('drivers.noMatchingKind')} />
            )}
          </section>
        )}
      </>
    );
  }

  function renderGroups() {
    return (
      <>
        <PageIntro title={t('groups.title')} subtitle={t('groups.subtitle')}>
          {canWriteGroups && (
            <button type="button" className="btn primary" onClick={() => openGroupModal()}>
              <Plus size={16} /> {t('actions.addGroup')}
            </button>
          )}
        </PageIntro>
        <section className="panel table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('groups.id')}</th>
                <th>{t('groups.name')}</th>
                <th>{t('groups.kind')}</th>
                <th>{t('groups.exposedInvocations')}</th>
                <th>{t('groups.status')}</th>
                <th>{t('groups.endpoints')}</th>
                <th title={t('groups.uptimeWindow')}>{t('groups.uptime')}</th>
                <th>{t('groups.mapping')}</th>
                {canWriteGroups && <th className="actions-col">{t('actions.edit')}</th>}
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((group) => (
                <tr key={group.id}>
                  <td><code>#{group.id}</code></td>
                  <td>
                    <div className="stacked">
                      <button type="button" className="table-name-link" onClick={() => openGroupDetail(group.id)}>{group.name}</button>
                      <span>{group.description}</span>
                    </div>
                  </td>
                  <td><StatusBadge label={kindLabel(group.kind)} tone={group.kind === 'image' ? 'purple' : 'blue'} /></td>
                  <td><TagList values={group.kind === 'text'
                    ? group.inboundProtocolContracts.map((contract) => textProtocolDisplayName(contract as TextProtocolContract))
                    : group.inboundProtocolContracts.map((contract) => imageProtocolDisplayName(contract as ImageProtocolContract))} more={0} /></td>
                  <td><StatusBadge label={group.status === 'normal' ? t('status.normal') : t('status.disabled')} tone={group.status === 'normal' ? 'good' : 'muted'} /></td>
                  <td>{group.endpointAvailable}/{group.endpointTotal}</td>
                  <td className="group-uptime-summary-cell">
                    <GroupUptimeCell
                      canReadAnalytics={canReadAnalytics}
                      state={groupUptimeState}
                      summary={groupUptimeByID.get(group.id)}
                      t={t}
                    />
                  </td>
                  <td><TagList values={group.mappings.slice(0, 3).map(mappingLabel)} more={Math.max(0, group.mappings.length - 3)} /></td>
                  {canWriteGroups && (
                    <td>
                      <RowActions>
                        <button type="button" onClick={() => openGroupModal(group)} title={t('actions.edit')}><Edit3 size={15} /></button>
                        <button type="button" onClick={() => void removeEntity('group', group.id, group.name)} title={t('actions.delete')}><Trash2 size={15} /></button>
                      </RowActions>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredGroups.length === 0 && <EmptyState label={t('app.empty')} />}
        </section>
      </>
    );
  }

  function renderKeys() {
    return (
      <>
        <PageIntro title={t('keys.title')} subtitle={t('keys.subtitle')}>
          {canWriteAPIKeys && (
            <button type="button" className="btn primary" onClick={() => openKeyModal()}>
              <Plus size={16} /> {t('actions.addKey')}
            </button>
          )}
        </PageIntro>
        <section className="panel table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('keys.name')}</th>
                <th>{t('keys.status')}</th>
                <th>{t('keys.prefix')}</th>
                <th>{t('keys.groups')}</th>
                <th>{t('keys.lastUsed')}</th>
                {canWriteAPIKeys && <th className="actions-col">{t('actions.edit')}</th>}
              </tr>
            </thead>
            <tbody>
              {filteredKeys.map((key) => (
                <tr key={key.id}>
                  <td>
                    <div className="stacked">
                      <strong>{key.name}</strong>
                      <span>{key.remark}</span>
                    </div>
                  </td>
                  <td><StatusBadge label={statusLabel(key.status)} tone={key.status === 'enabled' ? 'good' : 'muted'} /></td>
                  <td><code>{key.prefix}...{key.suffix}</code></td>
                  <td><TagList values={key.modelGroups.map((group) => group.groupName)} more={0} /></td>
                  <td>{formatDate(key.lastUsedAt, t)}</td>
                  {canWriteAPIKeys && <td>
                      <RowActions>
                        {Boolean(key.key?.trim()) && <button type="button" onClick={() => void copyValue(key.key)} title={t('actions.copy')}><Copy size={15} /></button>}
                        <button type="button" onClick={() => openKeyModal(key)} title={t('actions.edit')}><Edit3 size={15} /></button>
                        <button type="button" onClick={() => void removeEntity('key', key.id, key.name)} title={t('actions.delete')}><Trash2 size={15} /></button>
                      </RowActions>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredKeys.length === 0 && <EmptyState label={t('app.empty')} />}
        </section>
      </>
    );
  }

  function renderSidecars() {
    return (
      <>
        <PageIntro title={t('sidecars.title')} subtitle={t('sidecars.subtitle')}>
          {canWriteSidecars && sidecarView === 'tokens' && (
            <button type="button" className="btn primary" onClick={() => openSidecarModal()}>
              <Plus size={16} /> {t('actions.addSidecar')}
            </button>
          )}
        </PageIntro>
        <div className="tabs sidecar-tabs" role="tablist" aria-label={t('sidecars.title')}>
          <button type="button" role="tab" aria-selected={sidecarView === 'instances'} className={sidecarView === 'instances' ? 'active' : ''} onClick={() => changeSidecarView('instances')}>{t('sidecars.instances')}</button>
          <button type="button" role="tab" aria-selected={sidecarView === 'tokens'} className={sidecarView === 'tokens' ? 'active' : ''} onClick={() => changeSidecarView('tokens')}>{t('sidecars.tokens')}</button>
        </div>
        {sidecarView === 'instances' ? renderSidecarInstances() : renderSidecarTokens()}
      </>
    );
  }

  function renderSidecarInstances() {
    const pageStart = sidecarInstanceTotal === 0 ? 0 : sidecarInstanceOffset + 1;
    const pageEnd = Math.min(sidecarInstanceOffset + sidecarInstances.length, sidecarInstanceTotal);
    return (
      <>
        <div className="sidecar-summary" aria-label={t('sidecars.runtimeSummary')}>
          <StatPill label={t('sidecars.total')} value={String(sidecarRuntime.total)} />
          <StatPill label={t('sidecars.online')} value={String(sidecarRuntime.online)} />
          <StatPill label={t('sidecars.offline')} value={String(sidecarRuntime.offline)} />
        </div>
        <section className="panel sidecar-instance-panel">
          <div className="sidecar-filters">
            <div className="field sidecar-search"><span>{t('sidecars.search')}</span><input aria-label={t('sidecars.search')} value={sidecarSearch} placeholder={t('sidecars.searchPlaceholder')} onChange={(event) => { setSidecarSearch(event.target.value); setSidecarInstanceOffset(0); }} /></div>
            <SelectField label={t('sidecars.status')} value={sidecarOnlineFilter} onChange={(value) => { setSidecarOnlineFilter(value); setSidecarInstanceOffset(0); }} options={[{ value: '', label: t('sidecars.all') }, { value: 'true', label: t('sidecars.online') }, { value: 'false', label: t('sidecars.offline') }]} />
            <SelectField label={t('sidecars.token')} value={sidecarTokenFilter} onChange={(value) => { setSidecarTokenFilter(value); setSidecarInstanceOffset(0); }} options={[{ value: '', label: t('sidecars.all') }, ...sidecars.map((token) => ({ value: String(token.id), label: token.name }))]} />
            <SelectField label={t('sidecars.version')} value={sidecarVersionFilter} onChange={(value) => { setSidecarVersionFilter(value); setSidecarInstanceOffset(0); }} options={[{ value: '', label: t('sidecars.all') }, ...sidecarVersions.map((version) => ({ value: version, label: version }))]} />
          </div>
          {sidecarInstanceError && <div className="notice error"><X size={18} /><span>{sidecarInstanceError}</span></div>}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('sidecars.status')}</th>
                  <th>{t('sidecars.instance')}</th>
                  <th>{t('sidecars.token')}</th>
                  <th>{t('sidecars.version')}</th>
                  <th>{t('sidecars.lastSeen')}</th>
                  <th>{t('sidecars.lastPull')}</th>
                </tr>
              </thead>
              <tbody>
                {sidecarInstances.map((instance) => (
                  <tr key={instance.id} className="clickable-row">
                    <td><StatusBadge label={instance.online ? t('sidecars.online') : t('sidecars.offline')} tone={instance.online ? 'good' : 'muted'} /></td>
                    <td><button type="button" className="instance-link stacked" onClick={(event) => void openSidecarDrawer(instance, event.currentTarget)}><strong>{instance.hostname}</strong><span>{shortenID(instance.instanceId)}</span></button></td>
                    <td>{instance.tokenName}</td>
                    <td><code>{instance.sidecarVersion}</code></td>
                    <td>{formatDate(instance.lastSeenAt, t)}</td>
                    <td><StatusBadge label={pullResultLabel(instance.lastPullSuccess, t)} tone={instance.lastPullSuccess === true ? 'good' : instance.lastPullSuccess === false ? 'danger' : 'muted'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!sidecarInstancesLoading && sidecarInstances.length === 0 && <EmptyState label={t('app.empty')} />}
          <div className="pagination-bar">
            <span>{pageStart}-{pageEnd} / {sidecarInstanceTotal}</span>
            <div className="row-actions">
              <button type="button" disabled={sidecarInstanceOffset === 0} onClick={() => setSidecarInstanceOffset(Math.max(0, sidecarInstanceOffset - 50))} title={t('actions.previous')}><ChevronUp size={15} /></button>
              <button type="button" disabled={sidecarInstanceOffset + 50 >= sidecarInstanceTotal} onClick={() => setSidecarInstanceOffset(sidecarInstanceOffset + 50)} title={t('actions.next')}><ChevronDown size={15} /></button>
            </div>
          </div>
        </section>
      </>
    );
  }

  function renderSidecarTokens() {
    return (
      <div className="split-grid">
        <section className="panel table-panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>{t('sidecars.name')}</th><th>{t('sidecars.status')}</th><th>{t('sidecars.prefix')}</th><th>{t('sidecars.instances')}</th><th>{t('sidecars.lastSeen')}</th><th>{t('sidecars.versions')}</th>{canWriteSidecars && <th className="actions-col">{t('actions.edit')}</th>}</tr></thead>
              <tbody>{filteredSidecars.map((token) => (
                <tr key={token.id}>
                  <td><div className="stacked"><strong>{token.name}</strong><span>{token.remark}</span></div></td>
                  <td><StatusBadge label={statusLabel(token.status)} tone={token.status === 'enabled' ? 'good' : 'muted'} /></td>
                  <td><code>{token.prefix}...{token.suffix}</code></td>
                  <td><div className="stacked"><strong>{token.instanceCount}</strong><span>{token.onlineInstanceCount} online / {token.offlineInstanceCount} offline</span></div></td>
                  <td>{formatDate(token.lastSeenAt, t)}</td>
                  <td><div className="version-list">{token.versions.length ? token.versions.map((version) => <span key={version.version}><code>{version.version}</code> {version.onlineInstanceCount}/{version.instanceCount}</span>) : t('time.never')}</div></td>
                  {canWriteSidecars && <td><RowActions><button type="button" onClick={() => openSidecarModal(token)} title={t('actions.edit')}><Edit3 size={15} /></button><button type="button" onClick={() => void removeEntity('sidecar', token.id, token.name)} title={t('actions.delete')}><Trash2 size={15} /></button></RowActions></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
          {filteredSidecars.length === 0 && <EmptyState label={t('app.empty')} />}
          </section>

          <section className="panel verify-panel">
            <div className="panel-head">
              <div>
                <span>{t('sidecars.snapshot')}</span>
                <h2>/api/v1/sidecar/snapshot</h2>
              </div>
            </div>
            <div className="field">
              <span>{t('sidecars.verifyToken')}</span>
              <input aria-label={t('sidecars.verifyToken')} type="password" value={sidecarVerifyToken} onChange={(event) => setSidecarVerifyToken(event.target.value)} />
            </div>
            <button type="button" className="btn secondary" onClick={() => void verifySidecar()}>
              <Check size={16} /> {t('actions.verify')}
            </button>
            {sidecarVerifyResult && <pre className="console-output">{sidecarVerifyResult}</pre>}
          </section>
        </div>
    );
  }

  function renderSidecarDrawer(instance: SidecarInstanceDetail) {
    return (
      <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSidecarDrawer(); }}>
        <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="sidecar-detail-title">
          <div className="drawer-head"><div><span>{t('sidecars.instanceDetail')}</span><h2 id="sidecar-detail-title">{instance.hostname}</h2></div><button type="button" className="icon-button" onClick={closeSidecarDrawer} aria-label={t('actions.close')}><X size={18} /></button></div>
          {sidecarDetailError && <div className="notice error"><X size={18} /><span>{sidecarDetailError}</span></div>}
          <dl className="detail-list">
            <DetailItem label={t('sidecars.status')} value={instance.online ? t('sidecars.online') : t('sidecars.offline')} />
            <DetailItem label={t('sidecars.instanceId')} value={instance.instanceId} code />
            <DetailItem label={t('sidecars.recordId')} value={String(instance.id)} />
            <DetailItem label={t('sidecars.token')} value={`${instance.tokenName} (#${instance.tokenId})`} />
            <DetailItem label={t('sidecars.version')} value={instance.sidecarVersion} code />
            <DetailItem label={t('sidecars.syncInterval')} value={`${instance.syncIntervalSeconds}s`} />
            <DetailItem label={t('sidecars.lastSeen')} value={formatDate(instance.lastSeenAt, t)} />
            <DetailItem label={t('sidecars.lastPull')} value={formatDate(instance.lastPullAt, t)} />
            <DetailItem label={t('sidecars.pullResult')} value={pullResultLabel(instance.lastPullSuccess, t)} />
            <DetailItem label={t('sidecars.snapshotSchema')} value={instance.appliedSnapshotSchemaVersion > 0 ? String(instance.appliedSnapshotSchemaVersion) : t('time.never')} code />
            <DetailItem label={t('sidecars.snapshotRevision')} value={instance.appliedSnapshotRevision || t('time.never')} code />
            <DetailItem label={t('sidecars.createdAt')} value={formatDate(instance.createdAt, t)} />
            <DetailItem label={t('sidecars.updatedAt')} value={formatDate(instance.updatedAt, t)} />
          </dl>
          <h3 className="drawer-section-title">{t('sidecars.telemetry')}</h3>
          <dl className="detail-list">
            <DetailItem label={t('sidecars.telemetrySession')} value={instance.telemetry?.sessionId || t('sidecars.notReported')} code={Boolean(instance.telemetry)} />
            <DetailItem label={t('sidecars.telemetryGeneration')} value={instance.telemetry ? `${instance.telemetry.incarnation} / ${instance.telemetry.generation}` : t('sidecars.notReported')} />
            <DetailItem label={t('sidecars.lastTelemetry')} value={formatOptionalSidecarDate(instance.telemetry?.lastReportedAt, t)} />
            <DetailItem label={t('sidecars.telemetryCoveredThrough')} value={formatOptionalSidecarDate(instance.telemetry?.coveredThrough, t)} />
            <DetailItem label={t('sidecars.telemetryQueueDepth')} value={formatOptionalSidecarCount(instance.telemetry?.queueDepth, false, t)} />
            <DetailItem label={t('sidecars.telemetryOldestQueued')} value={formatOptionalSidecarDate(instance.telemetry?.oldestQueuedAt, t)} />
            <DetailItem label={t('sidecars.telemetryDropped')} value={formatOptionalSidecarCount(instance.telemetry?.droppedEventCount, instance.telemetry?.dropCounterSaturated === true, t)} />
          </dl>
          {instance.lastPullError && <section className="drawer-error"><span>{t('sidecars.pullError')}</span><pre>{instance.lastPullError}</pre></section>}
        </aside>
      </div>
    );
  }

  function renderAnalytics() {
    const rows = analyticsRows;
    const effectiveAnalyticsTab: AnalyticsTab = canReadEndpoints ? analyticsTab : 'activity';
    const analyticsTabs: AnalyticsTab[] = canReadEndpoints
      ? ['endpoints', 'pricing', 'performance', 'uptime', 'activity']
      : ['activity'];
    return (
      <>
        <PageIntro title={t('analytics.title')} subtitle={t('analytics.subtitle')} className="analytics-page-intro">
          {canReadEndpoints && (
            <Segmented
              value={analyticsKind}
              options={[
                { value: 'text', label: t('kind.text') },
                { value: 'image', label: t('kind.image') }
              ]}
              onChange={(value) => setAnalyticsKind(value as ModelKind)}
            />
          )}
          <button type="button" className="icon-button" onClick={() => void refresh()} aria-label={t('actions.refresh')} title={t('actions.refresh')}>
            <RefreshCw size={18} className={loading ? 'spin' : ''} />
          </button>
          <TimeRangePicker value={analyticsRange} onChange={setAnalyticsRange} t={t} />
        </PageIntro>
        <AnalyticsSummaryView summary={summary} t={t} />
        <div className="tabs">
          {analyticsTabs.map((tab) => (
            <button key={tab} type="button" className={effectiveAnalyticsTab === tab ? 'active' : ''} onClick={() => setAnalyticsTab(tab)}>
              {t(`analytics.${tab}`)}
            </button>
          ))}
        </div>
        <section className="panel table-panel">
          {effectiveAnalyticsTab !== 'activity' ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('endpoints.name')}</th>
                  <th>Model</th>
                  {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'pricing') && <th>{t('analytics.inputPrice')}</th>}
                  {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'pricing') && <th>{t('analytics.outputPrice')}</th>}
                  {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'pricing') && <th>{t('analytics.cachePrice')}</th>}
                  {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'performance') && <th>{t('analytics.latency')}</th>}
                  {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'performance') && <th>{t('analytics.tps')}</th>}
                  {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'uptime') && <th>{t('analytics.calls')}</th>}
                  {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'uptime') && <th>{t('analytics.uptime')}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.endpointId}-${row.kind}-${row.modelId}`}>
                    <td>{row.endpointName}</td>
                    <td><code>{row.modelId}</code></td>
                    {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'pricing') && <td>{formatCurrency(row.inputPricePerMillion, 3)}</td>}
                    {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'pricing') && <td>{formatCurrency(row.outputPricePerMillion, 3)}</td>}
                    {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'pricing') && <td>{formatCurrency(row.cachePricePerMillion, 3)}</td>}
                    {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'performance') && <td>{formatLatency(row.averageLatencyMS)}</td>}
                    {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'performance') && <td>{formatNumber(row.averageTPS)}</td>}
                    {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'uptime') && <td>{row.callCount}</td>}
                    {(effectiveAnalyticsTab === 'endpoints' || effectiveAnalyticsTab === 'uptime') && <td><Progress value={row.uptime.percentage} label={formatPercent(row.uptime.percentage)} tone={uptimeTone(row.uptime.percentage)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <>
              <div className="analytics-activity-toolbar">
                <SelectField
                  label={t('analytics.outcomeFilter')}
                  value={analyticsOutcome}
                  onChange={(value) => setAnalyticsOutcome(value as InvocationOutcome | '')}
                  options={[
                    { value: '', label: t('analytics.allOutcomes') },
                    ...invocationOutcomes.map((outcome) => ({
                      value: outcome,
                      label: t(`analytics.outcome.${outcome}`)
                    }))
                  ]}
                />
              </div>
              <AnalyticsAttemptTable attempts={activityAttempts} t={t} />
            </>
          )}
          {effectiveAnalyticsTab !== 'activity' && rows.length === 0 && <EmptyState label={t('app.empty')} />}
        </section>
      </>
    );
  }

  function renderWorkspaces() {
    if (isPlatformAdmin) {
      return (
        <>
          <PageIntro title={t('workspaces.title')} subtitle={t('workspaces.subtitle')}>
            <button type="button" className="btn primary" onClick={() => openWorkspaceModal()}>
              <Plus size={16} /> {t('actions.addWorkspace')}
            </button>
          </PageIntro>
          <section className="panel table-panel">
            <div className="table-toolbar">
              <h3>
                {t('workspaces.title')}
                <span className="count">{platformWorkspaces.length}</span>
              </h3>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('workspaces.slug')}</th>
                  <th>{t('workspaces.name')}</th>
                  <th>{t('workspaces.status')}</th>
                  <th className="actions-col">{t('actions.edit')}</th>
                </tr>
              </thead>
              <tbody>
                {platformWorkspaces.map((workspace) => (
                  <tr key={workspace.id}>
                    <td><code>{workspace.slug}</code></td>
                    <td>
                      <div className="name-cell">
                        <span className="endpoint-avatar">{workspaceInitials(workspace.name || workspace.slug)}</span>
                        <div>
                          <strong>{workspace.name}</strong>
                          <span>{workspace.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td><StatusBadge label={workspace.status === 'active' ? t('status.active') : t('status.disabled')} tone={workspace.status === 'active' ? 'good' : 'muted'} /></td>
                    <td>
                      <RowActions>
                        <button type="button" onClick={() => void openMembersModal(workspace)} title={t('actions.manageMembers')}><UserCog size={15} /></button>
                        <button type="button" onClick={() => openWorkspaceModal(workspace)} title={t('actions.edit')}><Edit3 size={15} /></button>
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {platformWorkspaces.length === 0 && <EmptyState label={error || t('app.empty')} />}
          </section>
        </>
      );
    }

    const manageable = myWorkspaces.filter((item) => canManageWorkspaceMembers(item));
    if (manageable.length === 0) {
      return (
        <>
          <PageIntro title={t('workspaces.title')} subtitle={t('workspaces.subtitle')} />
          <section className="panel">
            <EmptyState label={t('workspaces.noMemberAccess')} />
          </section>
        </>
      );
    }

    return (
      <>
        <PageIntro title={t('workspaces.title')} subtitle={t('workspaces.subtitle')} />
        <section className="panel table-panel">
          <div className="table-toolbar">
            <h3>
              {t('workspaces.manageCurrent')}
              <span className="count">{manageable.length}</span>
            </h3>
          </div>
          <p className="muted panel-help">{t('workspaces.memberHelp')}</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('workspaces.slug')}</th>
                <th>{t('workspaces.name')}</th>
                <th>{t('workspaces.status')}</th>
                <th className="actions-col">{t('workspaces.members')}</th>
              </tr>
            </thead>
            <tbody>
              {manageable.map((workspace) => (
                <tr key={workspace.id}>
                  <td><code>{workspace.slug}</code></td>
                  <td>
                    <div className="name-cell">
                      <span className="endpoint-avatar">{workspaceInitials(workspace.name || workspace.slug)}</span>
                      <div>
                        <strong>{workspace.name}</strong>
                        <span>{roleLabel(workspace.role)}</span>
                      </div>
                    </div>
                  </td>
                  <td><StatusBadge label={workspace.status === 'active' ? t('status.active') : t('status.disabled')} tone={workspace.status === 'active' ? 'good' : 'muted'} /></td>
                  <td>
                    <RowActions>
                      <button type="button" onClick={() => void openMembersModal(workspace)} title={t('actions.manageMembers')}><UserCog size={15} /></button>
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
    );
  }

  function renderModal() {
    if (modal === 'endpointDetail' && selectedEndpointDetail && canReadEndpoints) {
      const detailGroup = endpointGroups.find((group) => group.id === selectedEndpointDetail.groupId);
      const detailDriver = drivers.find((driver) => driver.ref === selectedEndpointDetail.driverRef);
      const closeDetail = () => {
        setModal(null);
        setSelectedEndpointDetail(null);
      };
      return (
        <Modal
          title={selectedEndpointDetail.name}
          onClose={closeDetail}
          wide
          className="endpoint-detail-modal"
        >
          <EndpointDetail
            endpoint={selectedEndpointDetail}
            group={detailGroup}
            driver={detailDriver}
            labels={{
              group: t('endpoints.group'),
              kind: t('endpoints.kind'),
              status: t('endpoints.status'),
              baseUrl: t('endpoints.baseUrl'),
              driver: t('endpoints.driver'),
              credentials: t('endpoints.credentials'),
              credentialConfigured: t('endpoints.credentialConfigured'),
              credentialMissing: t('endpoints.credentialMissing'),
              models: t('endpoints.models'),
              updatedAt: t('endpoints.updatedAt'),
              empty: t('app.empty'),
              kinds: { text: t('kind.text'), image: t('kind.image'), video: t('kind.video') },
              statuses: { enabled: t('status.enabled'), disabled: t('status.disabled'), error: t('status.error') },
              formatDate: (value) => formatDate(value, t)
            }}
          />
          <div className="modal-actions">
            {canWriteEndpoints && (
              <>
                <button type="button" className="btn danger" onClick={() => {
                  const target = selectedEndpointDetail;
                  closeDetail();
                  openDeleteModal('endpoint', target.id, target.name);
                }}>
                  <Trash2 size={15} aria-hidden="true" />
                  {t('actions.delete')}
                </button>
                <button type="button" className="btn secondary" onClick={() => {
                  closeDetail();
                  openEndpointModal(selectedEndpointDetail.groupId, selectedEndpointDetail);
                }}>
                  {t('actions.edit')}
                </button>
              </>
            )}
            <button type="button" className="btn primary" onClick={closeDetail}>{t('actions.close')}</button>
          </div>
        </Modal>
      );
    }

    if (modal === 'endpoint' && endpointEditorTarget && canWriteEndpoints) {
      return (
        <Modal
          title={endpointEditorTarget.endpoint ? t('endpoints.editTitle') : t('endpoints.createTitle')}
          onClose={() => { setModal(null); setEndpointEditorTarget(null); }}
          wide
          className="endpoint-editor-modal"
        >
          <EndpointEditor
            key={endpointEditorTarget.endpoint?.id ?? `new-${endpointEditorTarget.group.id}`}
            group={endpointEditorTarget.group}
            groups={endpointGroups}
            drivers={drivers}
            endpoint={endpointEditorTarget.endpoint}
            busy={loading}
            labels={endpointEditorLabels(t)}
            onCancel={() => { setModal(null); setEndpointEditorTarget(null); }}
            onSubmit={saveEndpointSubmission}
            onDiscoverModels={discoverEndpointModels}
            onToast={showToast}
          />
        </Modal>
      );
    }

    if (modal === 'endpointGroup' && endpointGroupDraft && canWriteEndpoints) {
      return (
        <Modal
          title={endpointGroupDraft.id ? t('endpoints.editGroup') : t('endpoints.createGroup')}
          onClose={() => { setModal(null); setEndpointGroupDraft(null); }}
          className="endpoint-group-editor-modal"
        >
          <div className="form-grid">
            <TextField label={t('endpoints.groupName')} value={endpointGroupDraft.name} onChange={(name) => setEndpointGroupDraft({ ...endpointGroupDraft, name })} />
            <TextField label={t('endpoints.groupSortOrder')} type="number" value={String(endpointGroupDraft.sortOrder)} onChange={(value) => setEndpointGroupDraft({ ...endpointGroupDraft, sortOrder: Number(value) || 0 })} />
          </div>
          <TextAreaField label={t('endpoints.remark')} rows={3} value={endpointGroupDraft.remark} onChange={(remark) => setEndpointGroupDraft({ ...endpointGroupDraft, remark })} />
          <div className="modal-actions">
            {endpointGroupDraft.id && (
              <button type="button" className="btn danger" onClick={() => {
                const current = endpointGroups.find((group) => group.id === endpointGroupDraft.id);
                if (current) openDeleteModal('endpointGroup', current.id, current.name);
              }}>
                {t('actions.delete')}
              </button>
            )}
            <button type="button" className="btn secondary" onClick={() => { setModal(null); setEndpointGroupDraft(null); }}>{t('actions.cancel')}</button>
            <button type="button" className="btn primary" disabled={!endpointGroupDraft.name.trim()} onClick={() => void saveEndpointGroupDraft()}>{t('actions.save')}</button>
          </div>
        </Modal>
      );
    }

    if (modal === 'driverUpload' && driverUploadDraft && canWriteEndpointDrivers) {
      const ready = Boolean(driverUploadDraft.manifestFile && driverUploadDraft.wasmFile && driverUploadDraft.manifest);
      return (
        <Modal title={t('drivers.upload')} onClose={() => { setModal(null); setDriverUploadDraft(null); }} wide>
          <div className="driver-upload-grid">
            <FileField
              label={t('drivers.manifestFile')}
              accept="application/json,.json"
              file={driverUploadDraft.manifestFile}
              chooseLabel={t('actions.chooseFile')}
              replaceLabel={t('drivers.replaceFile')}
              dropLabel={t('drivers.dropFile')}
              helpLabel={t('drivers.manifestFileHelp')}
              invalidTypeLabel={t('drivers.invalidFileType')}
              onChange={(file) => void selectDriverManifest(file)}
            />
            <FileField
              label={t('drivers.wasmFile')}
              accept="application/wasm,.wasm"
              file={driverUploadDraft.wasmFile}
              chooseLabel={t('actions.chooseFile')}
              replaceLabel={t('drivers.replaceFile')}
              dropLabel={t('drivers.dropFile')}
              helpLabel={t('drivers.wasmFileHelp')}
              invalidTypeLabel={t('drivers.invalidFileType')}
              onChange={(file) => setDriverUploadDraft((current) => current ? { ...current, wasmFile: file } : current)}
            />
          </div>
          {driverUploadDraft.manifestError && <p className="field-error">{driverUploadDraft.manifestError}</p>}
          {(driverUploadDraft.manifestFile || driverUploadDraft.wasmFile) && (
            <section className="driver-upload-details">
              <h3>{t('drivers.fileDetails')}</h3>
              <div className="driver-file-details-grid">
                {driverUploadDraft.manifestFile && (
                  <SelectedFileDetails
                    label={t('drivers.manifestFile')}
                    file={driverUploadDraft.manifestFile}
                    labels={{
                      name: t('drivers.fileName'),
                      size: t('drivers.fileSize'),
                      type: t('drivers.fileType'),
                      lastModified: t('drivers.lastModified')
                    }}
                  />
                )}
                {driverUploadDraft.wasmFile && (
                  <SelectedFileDetails
                    label={t('drivers.wasmFile')}
                    file={driverUploadDraft.wasmFile}
                    labels={{
                      name: t('drivers.fileName'),
                      size: t('drivers.fileSize'),
                      type: t('drivers.fileType'),
                      lastModified: t('drivers.lastModified')
                    }}
                  />
                )}
              </div>
            </section>
          )}
          {driverUploadDraft.manifest && (
            <section className="driver-manifest-preview">
              <h3>{t('drivers.manifestDetails')}</h3>
              <div className="driver-manifest-grid">
                <div>
                  <span>{t('drivers.name')}</span>
                  <strong>{driverUploadDraft.manifest.displayName}</strong>
                </div>
                <div>
                  <span>{t('drivers.driverId')}</span>
                  <strong>{driverUploadDraft.manifest.id}</strong>
                </div>
                <div>
                  <span>{t('drivers.version')}</span>
                  <strong>{driverUploadDraft.manifest.version}</strong>
                </div>
                <div>
                  <span>{t('drivers.kind')}</span>
                  <strong>{kindLabel(driverUploadDraft.manifest.kind)}</strong>
                </div>
                <div>
                  <span>{t('drivers.wireAbi')}</span>
                  <strong>{driverUploadDraft.manifest.wireAbiVersion || '-'}</strong>
                </div>
                <div className="driver-manifest-capabilities">
                  <span>{t('drivers.invocations')}</span>
                  <TagList values={uploadManifestCapabilityLabels(driverUploadDraft.manifest)} more={0} />
                </div>
                <div className="driver-manifest-capabilities">
                  <span>{t('drivers.managementCapabilities')}</span>
                  <TagList values={driverUploadDraft.manifest.managementCapabilities.length ? driverUploadDraft.manifest.managementCapabilities : [t('drivers.none')]} more={0} />
                </div>
                <div className="driver-manifest-capabilities">
                  <span>{t('drivers.requestedCapabilities')}</span>
                  <TagList values={driverUploadDraft.manifest.requestedCapabilities.length ? driverUploadDraft.manifest.requestedCapabilities : [t('drivers.none')]} more={0} />
                </div>
                <div className="driver-manifest-capabilities">
                  <span>{t('drivers.credentials')}</span>
                  <TagList values={driverUploadDraft.manifest.credentialSchema.slots.length ? driverUploadDraft.manifest.credentialSchema.slots.map((slot) => slot.name) : [t('drivers.none')]} more={0} />
                </div>
              </div>
            </section>
          )}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={() => { setModal(null); setDriverUploadDraft(null); }}>{t('actions.cancel')}</button>
            <button type="button" className="btn primary" disabled={!ready || loading} onClick={() => void submitDriverUpload()}>
              <Upload size={16} /> {t('drivers.upload')}
            </button>
          </div>
        </Modal>
      );
    }

    if (modal === 'driverDetail' && selectedEndpointDriver && canReadEndpointDrivers) {
      const isWASM = selectedEndpointDriver.source === 'profile';
      const closeDriverDetail = () => {
        setModal(null);
        setSelectedEndpointDriver(null);
        setEditingDriverAlias(false);
      };
      return (
        <Modal
          title={selectedEndpointDriver.manifest.displayName}
          ariaLabel={selectedEndpointDriver.manifest.displayName}
          onClose={closeDriverDetail}
          wide
          className="driver-profile-modal"
        >
          <dl className="driver-detail-grid driver-profile-detail-grid">
            {isWASM && (
              <DetailItem label={t('drivers.alias')}>
                <span className="driver-alias-editor">
                  {editingDriverAlias ? (
                    <input
                      className="driver-alias-input"
                      aria-label={t('drivers.alias')}
                      value={driverAliasDraft}
                      autoFocus
                      onChange={(event) => setDriverAliasDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveDriverAlias(driverAliasDraft);
                        if (event.key === 'Escape') {
                          setDriverAliasDraft(endpointDriverAlias(selectedEndpointDriver));
                          setEditingDriverAlias(false);
                        }
                      }}
                    />
                  ) : (
                    <span className={selectedEndpointDriver.alias ? '' : 'muted'}>{selectedEndpointDriver.alias || t('drivers.noAlias')}</span>
                  )}
                  {canWriteEndpointDrivers && (
                    editingDriverAlias ? (
                      <button type="button" className="icon-button subtle" title={t('actions.save')} disabled={loading} onClick={() => void saveDriverAlias(driverAliasDraft)}>
                        <Check size={17} />
                      </button>
                    ) : (
                      <button type="button" className="icon-button subtle" title={t('drivers.editAlias')} onClick={() => setEditingDriverAlias(true)}>
                        <Edit3 size={16} />
                      </button>
                    )
                  )}
                </span>
              </DetailItem>
            )}
            <DetailItem label={t('drivers.reference')} value={selectedEndpointDriver.ref} code />
            <DetailItem label={t('drivers.version')} value={selectedEndpointDriver.manifest.version} />
            <DetailItem label={t('drivers.runtime')} value={isWASM ? 'WASM' : 'Built-in'} />
            {isWASM && <DetailItem label={t('drivers.digest')} value={selectedEndpointDriver.manifest.artifactDigest ?? ''} code />}
            {isWASM && selectedEndpointDriver.uploadedBy && <DetailItem label={t('drivers.uploadedBy')} value={selectedEndpointDriver.uploadedBy.displayName} />}
            {isWASM && <DetailItem label={t('drivers.artifactSize')} value={formatBytes(selectedEndpointDriver.artifactSizeBytes ?? 0)} />}
            {isWASM && <DetailItem label={t('drivers.createdAt')} value={formatDate(selectedEndpointDriver.createdAt ?? '', t)} />}
          </dl>
          <section className="driver-detail-section">
            <h3>{t('drivers.invocations')}</h3>
            <TagList className="driver-detail-tags" values={driverCapabilityLabels(selectedEndpointDriver)} more={0} />
          </section>
          {selectedEndpointDriver.manifest.managementCapabilities.length > 0 && (
            <section className="driver-detail-section">
              <h3>{t('drivers.management')}</h3>
              <TagList className="driver-detail-tags" values={selectedEndpointDriver.manifest.managementCapabilities} more={0} />
            </section>
          )}
          <section className="driver-detail-section">
            <h3>{t('endpoints.driverConfigSchema')}</h3>
            <pre className="driver-schema-preview">{formatConfigSchema(selectedEndpointDriver.manifest.configSchemaJson)}</pre>
          </section>
          <div className="modal-actions">
            <button type="button" className="btn primary" onClick={closeDriverDetail}>{t('actions.close')}</button>
          </div>
        </Modal>
      );
    }

    if (modal === 'group' && groupDraft && canWriteGroups) {
      return (
        <Modal title={groupDraft.id ? t('actions.edit') : t('actions.addGroup')} onClose={() => setModal(null)} wide className="group-editor-modal">
          <div className="form-grid">
            <TextField label={t('groups.name')} value={groupDraft.name} onChange={(value) => setGroupDraft({ ...groupDraft, name: value })} />
            <SelectField
              label={t('groups.kind')}
              value={groupDraft.kind}
              onChange={(value) => {
                const kind = value as ModelKind;
                setGroupDraft({
                  ...groupDraft,
                  kind,
                  inboundProtocolContracts: kind === 'text' ? [...TEXT_PROTOCOL_CONTRACTS] : kind === 'image' ? [...IMAGE_PROTOCOL_CONTRACTS] : [],
                  mappings: [emptyMapping(kind)]
                });
              }}
              options={[
                { value: 'text', label: t('kind.text') },
                { value: 'image', label: t('kind.image') },
                { value: 'video', label: t('kind.video') }
              ]}
            />
            <SelectField
              label={t('groups.status')}
              value={groupDraft.status}
              onChange={(value) => setGroupDraft({ ...groupDraft, status: value as GroupDraft['status'] })}
              options={[
                { value: 'normal', label: t('status.normal') },
                { value: 'disabled', label: t('status.disabled') }
              ]}
            />
            <TextField label={t('groups.description')} value={groupDraft.description} onChange={(value) => setGroupDraft({ ...groupDraft, description: value })} />
            <TextField
              label={t('groups.firstResponseTimeout')}
              type="number"
              min="1"
              max="1800"
              step="1"
              placeholder={t('groups.inheritDefault')}
              status={t('groups.firstResponseTimeoutHint')
                .replace('{default}', String(defaultFirstResponseTimeoutSeconds(groupDraft.kind)))
                .replace('{max}', '1800')}
              value={groupDraft.firstResponseTimeoutSeconds}
              onChange={(value) => setGroupDraft({ ...groupDraft, firstResponseTimeoutSeconds: value })}
            />
            <SelectField
              label={t('groups.sidecarConfigMode')}
              value={groupDraft.sidecarConfigMode}
              onChange={(value) => setGroupDraft({ ...groupDraft, sidecarConfigMode: value as GroupDraft['sidecarConfigMode'] })}
              options={[
                { value: 'reference', label: t('groups.sidecarConfigReference') },
                {
                  value: 'full',
                  label: t('groups.sidecarConfigFull'),
                  endAdornment: !groupDraft.id ? (
                    <WarningTooltip label={t('groups.sidecarConfigWarning')} />
                  ) : undefined
                }
              ]}
            />
          </div>
          {groupDraft.kind === 'text' && (
            <TextProtocolSelector
              label={t('groups.inboundProtocols')}
              values={groupDraft.inboundProtocolContracts as TextProtocolContract[]}
              disabledContracts={disabledProtocolContracts(groupDraft)}
              onChange={(inboundProtocolContracts) => setGroupDraft({ ...groupDraft, inboundProtocolContracts })}
            />
          )}
          {groupDraft.kind === 'image' && (
            <ImageProtocolSelector
              label={t('groups.exposedInvocations')}
              values={groupDraft.inboundProtocolContracts as ImageProtocolContract[]}
              disabledContracts={disabledImageProtocolContracts(groupDraft)}
              onChange={(inboundProtocolContracts) => setGroupDraft({ ...groupDraft, inboundProtocolContracts })}
            />
          )}
          <div className="mapping-editor">
            <div className="section-title">
              <strong>{t('groups.mapping')}</strong>
              <div className="mapping-editor-actions">
                <Segmented
                  value={groupMappingView}
                  ariaLabel={t('groups.viewMode')}
                  options={[
                    { value: 'list', label: t('groups.listView'), icon: LayoutList },
                    { value: 'visual', label: t('groups.visualView'), icon: Workflow }
                  ]}
                  onChange={(value) => setGroupMappingView(value as GroupMappingView)}
                />
              </div>
            </div>
            {groupMappingView === 'list' && (
              <div className="mapping-list-toolbar" role="toolbar" aria-label={t('groups.mappingList')}>
                <span>{t('groups.mappingCount').replace('{count}', String(groupDraft.mappings.length))}</span>
                <button type="button" className="btn secondary small" onClick={() => addGroupMapping(0)}>
                  <Plus size={14} /> {t('actions.addMapping')}
                </button>
              </div>
            )}
            {groupMappingView === 'list' ? groupDraft.mappings.map((mapping, index) => (
                <div className="mapping-row" key={index}>
                  <SelectField
                    label={t('groups.endpoint')}
                    value={mapping.endpointId ? String(mapping.endpointId) : ''}
                    placeholder={t('groups.endpoint')}
                    onChange={(value) => updateMapping(index, { endpointId: value ? Number(value) : 0, modelId: '' })}
                    options={compatibleEndpointsForGroup(groupDraft).map((endpoint) => ({ value: String(endpoint.id), label: endpoint.name }))}
                  />
                  <SelectField
                    label={t('groups.model')}
                    value={mapping.modelId}
                    placeholder={t('groups.model')}
                    onChange={(value) => updateMapping(index, { modelId: value })}
                    options={compatibleModelsForGroup(mapping.endpointId, groupDraft).map((model) => ({ value: model.id, label: model.id }))}
                  />
                  <TextField
                    className="mapping-tier-input"
                    label={t('groups.tier')}
                    type="number"
                    value={String(mapping.tier ?? 0)}
                    status={pendingMappingTierIndex === index ? t('groups.pendingApply') : undefined}
                    onChange={(value) => {
                      setPendingMappingTierIndex(index);
                      updateMapping(index, { tier: Math.max(0, Math.floor(Number(value) || 0)) }, false);
                    }}
                    onBlur={() => {
                      updateMapping(index, {});
                      setPendingMappingTierIndex(null);
                    }}
                  />
                  <TextField
                    className="mapping-weight-input"
                    label={t('groups.weight')}
                    type="number"
                    value={String(mapping.weight ?? 100)}
                    onChange={(value) => updateMapping(index, { weight: Math.min(10000, Math.max(1, Math.floor(Number(value) || 100))) })}
                  />
                  <button
                    type="button"
                    className="icon-button danger mapping-delete-button"
                    aria-label={`${t('actions.delete')} ${t('groups.mapping')} ${index + 1}`}
                    title={`${t('actions.delete')} ${t('groups.mapping')} ${index + 1}`}
                    onClick={() => setGroupDraft({ ...groupDraft, mappings: groupDraft.mappings.filter((_, row) => row !== index) })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )) : (
                <ModelGroupMappingVisualizer
                  mode="edit"
                  groupName={groupDraft.name}
                  groupKind={groupDraft.kind}
                  mappings={groupDraft.mappings}
                  endpoints={compatibleEndpointsForGroup(groupDraft)}
                  tierLabel={(tier) => routingTierLabel(tier, locale)}
                  modelsForEndpoint={(endpointId) => compatibleModelsForGroup(endpointId, groupDraft)}
                  onChangeMapping={updateMapping}
                  onAddMapping={addGroupMapping}
                  onRemoveMapping={(index) => setGroupDraft({
                    ...groupDraft,
                    mappings: groupDraft.mappings.filter((_, row) => row !== index)
                  })}
                  labels={{
                    start: t('groups.routeStart'),
                    layer: t('groups.layer'),
                    model: t('groups.model'),
                    endpoint: t('groups.endpoint'),
                    tier: t('groups.tier'),
                    weight: t('groups.weight'),
                    addModel: t('groups.addModel'),
                    addFallback: t('groups.addFallback'),
                    deleteModel: t('groups.deleteModel'),
                    modelConfiguration: t('groups.modelConfiguration'),
                    noModelSelected: t('groups.noModelSelected'),
                    selectModel: t('groups.selectModel'),
                    layerTraffic: t('groups.layerTraffic'),
                    trafficShare: t('groups.trafficShare'),
                    noTraffic: t('groups.noTraffic'),
                    pendingApply: t('groups.pendingApply'),
                    endpointGroup: t('endpoints.group'),
                    schedulable: t('groupDetail.schedulable'),
                    yes: t('groupDetail.yes'),
                    no: t('groupDetail.no')
                  }}
                />
              )}
          </div>
          {renderIncompatibleModels(groupDraft)}
          <ModalActions cancelLabel={t('actions.cancel')} saveLabel={t('actions.save')} onCancel={() => setModal(null)} onSave={() => void saveGroupDraft()} />
        </Modal>
      );
    }

    if (modal === 'key' && keyDraft && canWriteAPIKeys) {
      return (
        <Modal title={keyDraft.id ? t('actions.edit') : t('actions.addKey')} onClose={() => setModal(null)}>
          <TextField label={t('keys.name')} value={keyDraft.name} onChange={(value) => setKeyDraft({ ...keyDraft, name: value })} />
          <TextField label={t('keys.remark')} value={keyDraft.remark} onChange={(value) => setKeyDraft({ ...keyDraft, remark: value })} />
          <SelectField
            label={t('keys.status')}
            value={keyDraft.status}
            onChange={(value) => setKeyDraft({ ...keyDraft, status: value as APIKeyDraft['status'] })}
            options={[
              { value: 'enabled', label: t('status.enabled') },
              { value: 'disabled', label: t('status.disabled') }
            ]}
          />
          <CheckboxGroup
            label={t('keys.groups')}
            options={groups.map((group) => ({ value: group.id, label: `${group.name} · ${kindLabel(group.kind)}` }))}
            values={keyDraft.modelGroupIds}
            onChange={(values) => setKeyDraft({ ...keyDraft, modelGroupIds: values })}
          />
          <ModalActions cancelLabel={t('actions.cancel')} saveLabel={t('actions.save')} onCancel={() => setModal(null)} onSave={() => void saveKeyDraft()} />
        </Modal>
      );
    }

    if (modal === 'sidecar' && sidecarDraft && canWriteSidecars) {
      return (
        <Modal title={sidecarDraft.id ? t('actions.edit') : t('actions.addSidecar')} onClose={() => setModal(null)}>
          <TextField label={t('sidecars.name')} value={sidecarDraft.name} onChange={(value) => setSidecarDraft({ ...sidecarDraft, name: value })} />
          <TextField label={t('sidecars.remark')} value={sidecarDraft.remark} onChange={(value) => setSidecarDraft({ ...sidecarDraft, remark: value })} />
          <SelectField
            label={t('sidecars.status')}
            value={sidecarDraft.status}
            onChange={(value) => setSidecarDraft({ ...sidecarDraft, status: value as SidecarDraft['status'] })}
            options={[
              { value: 'enabled', label: t('status.enabled') },
              { value: 'disabled', label: t('status.disabled') }
            ]}
          />
          <ModalActions cancelLabel={t('actions.cancel')} saveLabel={t('actions.save')} onCancel={() => setModal(null)} onSave={() => void saveSidecarDraft()} />
        </Modal>
      );
    }

    if (modal === 'workspace' && workspaceDraft && isPlatformAdmin) {
      return (
        <Modal title={workspaceDraft.id ? t('actions.edit') : t('actions.addWorkspace')} onClose={() => setModal(null)}>
          <TextField label={t('workspaces.slug')} value={workspaceDraft.slug} onChange={(value) => setWorkspaceDraft({ ...workspaceDraft, slug: value })} />
          <TextField label={t('workspaces.name')} value={workspaceDraft.name} onChange={(value) => setWorkspaceDraft({ ...workspaceDraft, name: value })} />
          <SelectField
            label={t('workspaces.status')}
            value={workspaceDraft.status}
            onChange={(value) => setWorkspaceDraft({ ...workspaceDraft, status: value as WorkspaceDraft['status'] })}
            options={[
              { value: 'active', label: t('status.active') },
              { value: 'disabled', label: t('status.disabled') }
            ]}
          />
          <ModalActions cancelLabel={t('actions.cancel')} saveLabel={t('actions.save')} onCancel={() => setModal(null)} onSave={() => void saveWorkspaceDraft()} />
        </Modal>
      );
    }

    if (modal === 'members' && memberWorkspace) {
      const access =
        myWorkspaces.find((item) => item.id === memberWorkspace.id) ??
        (isPlatformAdmin
          ? {
              id: memberWorkspace.id,
              slug: memberWorkspace.slug,
              name: memberWorkspace.name,
              status: 'active' as const,
              role: 'admin' as WorkspaceRole,
              platformAdmin: true,
              capabilities: [] as WorkspaceAccess['capabilities'],
              createdAt: '',
              updatedAt: ''
            }
          : null);
      const canWriteMembers = canWriteWorkspaceMembers(access);
      const closeMembers = () => {
        setModal(null);
        setMemberWorkspace(null);
      };
      return (
        <Modal
          title={`${t('workspaces.members')} · ${memberWorkspace.name || memberWorkspace.slug}`}
          onClose={closeMembers}
          wide
        >
          <WorkspaceMembersPanel
            workspace={memberWorkspace}
            canWrite={canWriteMembers}
            methods={authConfig.methods}
            onClose={closeMembers}
            onToast={showToast}
          />
        </Modal>
      );
    }

    if (modal === 'token') {
      return (
        <Modal title={t('keys.oneTime')} onClose={() => setModal(null)}>
          <p className="muted">{t('keys.oneTimeHelp')}</p>
          <pre className="token-box">{oneTimeToken}</pre>
          <div className="modal-actions">
            <button
              type="button"
              className={`btn secondary token-copy-button${oneTimeTokenCopied ? ' copied' : ''}`}
              onClick={() => void copyValue(oneTimeToken).then(setOneTimeTokenCopied)}
              aria-live="polite"
            >
              {oneTimeTokenCopied ? <Check size={16} /> : <Copy size={16} />}
              {oneTimeTokenCopied ? t('toast.copied') : t('actions.copy')}
            </button>
            <button type="button" className="btn primary" onClick={() => setModal(null)}>{t('actions.close')}</button>
          </div>
        </Modal>
      );
    }

    if (modal === 'delete' && deleteTarget && canDeleteEntity(deleteTarget.kind)) {
      const confirmPhrase = t('form.confirmDeletePhrase');
      const endpointGroupDelete = deleteTarget.kind === 'endpointGroup';
      const endpointDelete = deleteTarget.kind === 'endpoint';
      const canConfirm = endpointGroupDelete || deleteConfirmText.trim() === confirmPhrase;
      return (
        <Modal title={t('actions.delete')} onClose={closeDeleteModal}>
          <p className="delete-confirm-message">
            {endpointGroupDelete ? (
              <>
                {t('endpoints.groupDeleteConfirmPrefix')}
                <strong>{deleteTarget.name || `#${deleteTarget.id}`}</strong>
                {t('endpoints.groupDeleteConfirmSuffix')}
              </>
            ) : endpointDelete ? (
              <>
                {t('endpoints.endpointDeleteConfirmPrefix')}
                <strong>{deleteTarget.name || `#${deleteTarget.id}`}</strong>
                {t('endpoints.endpointDeleteConfirmSuffix')}
              </>
            ) : t('form.confirmDeleteMessage').replace('{name}', deleteTarget.name || `#${deleteTarget.id}`)}
          </p>
          {!endpointGroupDelete && (
            <TextField
              label={t('form.confirmDeleteHint').replace('{phrase}', confirmPhrase)}
              value={deleteConfirmText}
              onChange={setDeleteConfirmText}
            />
          )}
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={closeDeleteModal}>{t('actions.cancel')}</button>
            <button
              type="button"
              className="btn danger"
              disabled={!canConfirm || loading}
              onClick={() => void confirmDeleteEntity()}
            >
              {t('actions.delete')}
            </button>
          </div>
        </Modal>
      );
    }

    return null;
  }

  function updateMapping(index: number, patch: Partial<ModelGroupMapping>, reorder = true): number {
    if (!groupDraft) return index;
    const updatedMapping = { ...groupDraft.mappings[index], ...patch };
    const updatedMappings = groupDraft.mappings.map((mapping, row) => (row === index ? updatedMapping : mapping));
    const mappings = reorder ? sortGroupMappingsByTier(updatedMappings) : updatedMappings;
    setGroupDraft({
      ...groupDraft,
      mappings
    });
    return mappings.indexOf(updatedMapping);
  }

  function addGroupMapping(tier: number): number {
    if (!groupDraft) return 0;
    const mapping = { ...emptyMapping(groupDraft.kind), tier };
    const mappings = sortGroupMappingsByTier([...groupDraft.mappings, mapping]);
    setGroupDraft({ ...groupDraft, mappings });
    return mappings.indexOf(mapping);
  }

  function compatibleEndpointsForGroup(draft: GroupDraft): Endpoint[] {
    return endpoints.filter((endpoint) => endpoint.kind === draft.kind && compatibleModelsForGroup(endpoint.id, draft).length > 0);
  }

  function disabledProtocolContracts(draft: GroupDraft): Set<TextProtocolContract> {
    const selectedEndpoints = draft.mappings
      .map((mapping) => endpoints.find((endpoint) => endpoint.id === mapping.endpointId))
      .filter((endpoint): endpoint is Endpoint => endpoint != null);
    const disabled = new Set<TextProtocolContract>();
    for (const contract of TEXT_PROTOCOL_CONTRACTS) {
      const unsupported = selectedEndpoints.some((endpoint) => {
        const endpointDriver = drivers.find((driver) => driver.ref === endpoint.driverRef);
        return !(endpointDriver?.manifest.text?.protocolContracts ?? []).includes(contract);
      });
      if (unsupported) disabled.add(contract);
    }
    return disabled;
  }

  function disabledImageProtocolContracts(draft: GroupDraft): Set<ImageProtocolContract> {
    const disabled = new Set<ImageProtocolContract>();
    for (const contract of IMAGE_PROTOCOL_CONTRACTS) {
      const unsupported = draft.mappings.some((mapping) => {
        if (!mapping.endpointId) return false;
        const endpoint = endpoints.find((item) => item.id === mapping.endpointId);
        const endpointDriver = drivers.find((driver) => driver.ref === endpoint?.driverRef);
        if (!endpoint || !(endpointDriver?.manifest.image?.protocolContracts ?? []).includes(contract)) return true;
        if (!mapping.modelId) return false;
        const model = endpoint.models.find((item) => item.id === mapping.modelId);
        return !model?.imageProtocolContracts.includes(contract);
      });
      if (unsupported) disabled.add(contract);
    }
    return disabled;
  }

  function compatibleModelsForGroup(endpointId: number, draft: GroupDraft): EndpointModel[] {
    const endpoint = endpoints.find((item) => item.id === endpointId);
    if (!endpoint) return [];
    return endpoint.models.filter((model) => endpointModelCompatibility(endpoint, model, draft, drivers).compatible);
  }

  function renderIncompatibleModels(draft: GroupDraft) {
    const rows = endpoints.flatMap((endpoint) => {
      if (endpoint.kind !== draft.kind) return [];
      return endpoint.models.flatMap((model) => {
        const result = endpointModelCompatibility(endpoint, model, draft, drivers);
        if (result.compatible) return [];
        const reasons = result.reasons.map((reason) => t(`groups.incompatible.${reason}`));
        return [{ endpoint, model, reasons }];
      });
    });
    if (rows.length === 0) return null;
    return (
      <details className="incompatible-models">
        <summary>{t('groups.incompatibleItems')} ({rows.length})</summary>
        <div className="incompatible-model-list">
          {rows.map(({ endpoint, model, reasons }) => (
            <div key={`${endpoint.id}:${model.id}`}>
              <strong>{endpoint.name} / {model.id}</strong>
              <span>{reasons.join(' · ')}</span>
            </div>
          ))}
        </div>
      </details>
    );
  }

  function mappingLabel(mapping: ModelGroupMapping): string {
    const endpoint = endpoints.find((item) => item.id === mapping.endpointId);
    return `${routingTierLabel(mapping.tier ?? 0, locale)} · ${endpoint?.name ?? `#${mapping.endpointId}`} / ${mapping.modelId} · ${t('groups.weight')} ${mapping.weight ?? 100}`;
  }

  function statusLabel(status: string): string {
    if (status === 'enabled') return t('status.enabled');
    if (status === 'disabled') return t('status.disabled');
    if (status === 'error') return t('status.error');
    return status;
  }

  function kindLabel(kind: ModelKind): string {
    if (kind === 'image') return t('kind.image');
    if (kind === 'video') return t('kind.video');
    return t('kind.text');
  }

  function roleLabel(role: string): string {
    if (role === 'admin') return t('workspace.roleAdmin');
    if (role === 'viewer') return t('workspace.roleViewer');
    if (role === 'usage_viewer') return t('workspace.roleUsageViewer');
    return role;
  }
}

function canReadWorkspaceResource(
  access: Pick<WorkspaceAccess, 'capabilities' | 'platformAdmin'> | null | undefined,
  readCapability: WorkspaceCapability,
  writeCapability: WorkspaceCapability
): boolean {
  return hasWorkspaceCapability(access, readCapability) || hasWorkspaceCapability(access, writeCapability);
}

function canOpenWorkspacePage(
  page: PageKey,
  access: Pick<WorkspaceAccess, 'capabilities' | 'platformAdmin'> | null | undefined,
  platformAdmin: boolean
): boolean {
  if (page === 'overview') return true;
  if (page === 'users') return platformAdmin;
  if (platformAdmin) return true;
  if (page === 'endpoints') return canReadWorkspaceResource(access, 'endpoints:read', 'endpoints:write');
  if (page === 'drivers') return canReadWorkspaceResource(access, 'endpoint_drivers:read', 'endpoint_drivers:write');
  if (page === 'groups') return canReadWorkspaceResource(access, 'model_groups:read', 'model_groups:write');
  if (page === 'keys') return canReadWorkspaceResource(access, 'api_keys:read', 'api_keys:write');
  if (page === 'sidecars') return canReadWorkspaceResource(access, 'sidecar_tokens:read', 'sidecar_tokens:write');
  if (page === 'analytics') return hasWorkspaceCapability(access, 'analytics:read');
  return canManageWorkspaceMembers(access);
}

function workspaceInitials(value: string): string {
  const parts = value.trim().split(/[\s-_]+/).filter(Boolean);
  if (parts.length === 0) return 'WS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

const SIDEBAR_COLLAPSED_KEY = 'legate.sidebarCollapsed';

function readSidebarCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
}

function writeSidebarCollapsed(collapsed: boolean) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
}

function PageIntro({ title, subtitle, children, className }: { title: string; subtitle: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={className ? `page-intro ${className}` : 'page-intro'}>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

function MetricCard({ label, value, trend, tone = 'blue' }: { label: string; value: string; trend?: string; tone?: string }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {trend && <small>{trend}</small>}
    </article>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

function EndpointAvatar({ name }: { name: string }) {
  return <span className="endpoint-avatar">{name.trim().slice(0, 1).toUpperCase() || 'L'}</span>;
}

function Progress({ value, label, tone }: { value: number; label?: string; tone: string }) {
  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <span className={`progress-fill ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      {label && <small>{label}</small>}
    </div>
  );
}

function GroupUptimeCell({
  canReadAnalytics,
  state,
  summary,
  t
}: {
  canReadAnalytics: boolean;
  state: GroupUptimeState;
  summary?: ModelGroupUptimeSummary;
  t: (key: string) => string;
}) {
  if (!canReadAnalytics) return <span className="muted">{t('groupDetail.noPermission')}</span>;
  if (state === 'loading' || state === 'idle') return <span className="muted">{t('groupDetail.runtimeLoading')}</span>;
  if (state === 'error') return <span className="muted">{t('groupDetail.runtimeError')}</span>;
  if (!summary || summary.uptimePercentage === null) return <span className="muted">{t('groupDetail.noSample')}</span>;
  return (
    <Progress
      value={summary.uptimePercentage}
      label={formatPercent(summary.uptimePercentage)}
      tone={uptimeTone(summary.uptimePercentage)}
    />
  );
}

function WarningTooltip({ label }: { label: string }) {
  const tooltipID = useId();
  const [style, setStyle] = useState<CSSProperties | null>(null);

  function showTooltip(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    const verticalStyle = window.innerHeight - rect.bottom >= 72
      ? { top: rect.bottom + 6 }
      : { bottom: window.innerHeight - rect.top + 6 };
    setStyle({ position: 'fixed', width, left, ...verticalStyle });
  }

  return (
    <>
      <span
        className="select-option-warning"
        role="img"
        aria-label={label}
        aria-describedby={tooltipID}
        onMouseEnter={(event) => showTooltip(event.currentTarget)}
        onMouseLeave={() => setStyle(null)}
      >
        <CircleAlert size={16} aria-hidden="true" />
      </span>
      {style && createPortal(
        <span className="select-option-tooltip" role="tooltip" id={tooltipID} style={style}>{label}</span>,
        document.body
      )}
    </>
  );
}

function TagList({ values, more, className }: { values: string[]; more: number; className?: string }) {
  if (values.length === 0 && more === 0) return <span className="muted">-</span>;
  return (
    <div className={className ? `tag-list ${className}` : 'tag-list'}>
      {values.map((value) => <span key={value}>{value}</span>)}
      {more > 0 && <span>+{more}</span>}
    </div>
  );
}

function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="row-actions">{children}</div>;
}

function RowActionMenu({
  label,
  items
}: {
  label: string;
  items: Array<{
    key: string;
    label: string;
    icon?: LucideIcon;
    tone?: 'danger';
    onSelect: () => void;
  }>;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const preferred = Math.min(220, items.length * 36 + 12);
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const nextPlacement = spaceBelow < preferred && spaceAbove > spaceBelow ? 'up' : 'down';
      setPlacement(nextPlacement);
      setMenuStyle({
        position: 'fixed',
        top: nextPlacement === 'down' ? rect.bottom + 4 : undefined,
        bottom: nextPlacement === 'up' ? window.innerHeight - rect.top + 4 : undefined,
        left: Math.max(8, rect.right - 148),
        minWidth: 148
      });
    }

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={open ? `row-action-menu open placement-${placement}` : 'row-action-menu'} ref={rootRef}>
      <button
        type="button"
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={15} />
      </button>
      {open && createPortal(
        <div className={`row-action-dropdown placement-${placement}`} role="menu" ref={menuRef} style={menuStyle}>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                title={item.label}
                className={item.tone === 'danger' ? 'row-action-item danger' : 'row-action-item'}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {Icon && <Icon size={14} aria-hidden="true" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

function DetailItem({
  label,
  value,
  code = false,
  children,
  wide = false
}: {
  label: string;
  value?: string;
  code?: boolean;
  children?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'detail-wide' : undefined}>
      <dt>{label}</dt>
      <dd>{children ?? (code ? <code>{value ?? ''}</code> : (value ?? ''))}</dd>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
  testId,
  ariaLabel
}: {
  value: string;
  options: Array<{ value: string; label: string; icon?: LucideIcon }>;
  onChange: (value: string) => void;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel} data-testid={testId}>
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            className={value === option.value ? 'active' : ''}
            onClick={() => onChange(option.value)}
          >
            {Icon && <Icon size={14} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Modal({ title, ariaLabel, onClose, children, wide = false, className }: { title: React.ReactNode; ariaLabel?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; className?: string }) {
  const modalClassName = [wide ? 'modal wide' : 'modal', className].filter(Boolean).join(' ');
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={modalClassName} role="dialog" aria-modal="true" aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function ModalActions({
  cancelLabel,
  saveLabel,
  onCancel,
  onSave
}: {
  cancelLabel: string;
  saveLabel: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="modal-actions">
      <button type="button" className="btn secondary" onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className="btn primary" onClick={onSave}>{saveLabel}</button>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  onBlur,
  status,
  type = 'text',
  min,
  max,
  step,
  placeholder,
  className
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  status?: string;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className ? `field ${className}` : 'field'}>
      {status ? (
        <span className="field-label-row">
          <span>{label}</span>
          <small>{status}</small>
        </span>
      ) : <span>{label}</span>}
      <input
        aria-label={label}
        type={type}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onBlur) event.currentTarget.blur();
        }}
      />
    </div>
  );
}

function defaultFirstResponseTimeoutSeconds(kind: ModelKind): number {
  return kind === 'text' ? 180 : 300;
}

function TextAreaField({
  label,
  value,
  onChange,
  rows,
  className
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  className?: string;
}) {
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <span>{label}</span>
      <textarea aria-label={label} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function CheckboxGroup({
  label,
  options,
  values,
  onChange
}: {
  label: string;
  options: Array<{ value: number; label: string }>;
  values: number[];
  onChange: (values: number[]) => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="checkbox-grid">
        {options.map((option) => (
          <label key={option.value} className="check-row">
            <input
              type="checkbox"
              checked={values.includes(option.value)}
              onChange={(event) => {
                const next = event.target.checked ? [...values, option.value] : values.filter((value) => value !== option.value);
                onChange(next);
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function StringCheckboxGroup<T extends string>({
  label,
  options,
  values,
  onChange
}: {
  label: string;
  options: T[];
  values: T[];
  onChange: (values: T[]) => void;
}) {
  return (
    <div className="field group-invocation-field">
      <span>{label}</span>
      <div className="checkbox-grid invocation-grid">
        {options.map((option) => {
          const checked = values.includes(option);
          return (
            <label key={option} className={checked ? 'invocation-card selected' : 'invocation-card'}>
              <span className="invocation-card-label">{option}</span>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? values.filter((value) => value !== option) : [...values, option])}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function FileField({
  label,
  accept,
  file,
  chooseLabel,
  replaceLabel,
  dropLabel,
  helpLabel,
  invalidTypeLabel,
  onChange
}: {
  label: string;
  accept: string;
  file: File | null;
  chooseLabel: string;
  replaceLabel: string;
  dropLabel: string;
  helpLabel: string;
  invalidTypeLabel: string;
  onChange: (file: File | null) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState('');

  function acceptFile(nextFile: File) {
    if (!fileMatchesAccept(nextFile, accept)) {
      setFileError(invalidTypeLabel);
      return;
    }
    setFileError('');
    onChange(nextFile);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const clipboardFile = event.clipboardData.files[0]
      ?? Array.from(event.clipboardData.items).find((item) => item.kind === 'file')?.getAsFile();
    if (clipboardFile) {
      event.preventDefault();
      const fallbackName = accept.includes('.wasm') ? 'driver.wasm' : 'manifest.json';
      acceptFile(clipboardFile.name ? clipboardFile : new File([clipboardFile], fallbackName, { type: clipboardFile.type }));
      return;
    }
    if (!accept.includes('.json')) return;
    const text = event.clipboardData.getData('application/json') || event.clipboardData.getData('text/plain');
    if (!text.trim()) return;
    event.preventDefault();
    acceptFile(new File([text], 'manifest.json', { type: 'application/json' }));
  }

  function handleDragEnter(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) acceptFile(droppedFile);
  }

  return (
    <div className="field file-field" onPaste={handlePaste}>
      <span>{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        aria-label={label}
        className="file-picker-input"
        type="file"
        tabIndex={-1}
        accept={accept}
        onChange={(event) => {
          const selectedFile = event.target.files?.[0];
          if (selectedFile) acceptFile(selectedFile);
          event.target.value = '';
        }}
      />
      <button
        type="button"
        className={`file-dropzone${dragActive ? ' dragging' : ''}${file ? ' selected' : ''}`}
        aria-label={`${file ? replaceLabel : chooseLabel}: ${label}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="file-dropzone-icon" aria-hidden="true">
          {accept.includes('.json') ? <Braces size={20} /> : <Cpu size={20} />}
        </span>
        <span className="file-dropzone-copy">
          <strong title={file?.name}>{file?.name ?? dropLabel}</strong>
          <span>{file ? `${formatBytes(file.size)} · ${file.type || fileExtension(file.name)}` : helpLabel}</span>
        </span>
        <span className="file-dropzone-action"><Upload size={14} /> {file ? replaceLabel : chooseLabel}</span>
      </button>
      {fileError && <span className="file-field-error">{fileError}</span>}
    </div>
  );
}

function SelectedFileDetails({
  label,
  file,
  labels
}: {
  label: string;
  file: File;
  labels: { name: string; size: string; type: string; lastModified: string };
}) {
  return (
    <article className="selected-file-details">
      <h4>{label}</h4>
      <dl>
        <div><dt>{labels.name}</dt><dd title={file.name}>{file.name}</dd></div>
        <div><dt>{labels.size}</dt><dd>{formatBytes(file.size)}</dd></div>
        <div><dt>{labels.type}</dt><dd>{file.type || fileExtension(file.name)}</dd></div>
        <div><dt>{labels.lastModified}</dt><dd>{formatFileModified(file.lastModified)}</dd></div>
      </dl>
    </article>
  );
}

function fileMatchesAccept(file: File, accept: string): boolean {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();
  return accept.split(',').some((candidate) => {
    const rule = candidate.trim().toLowerCase();
    return rule.startsWith('.') ? fileName.endsWith(rule) : fileType === rule;
  });
}

function fileExtension(fileName: string): string {
  const separator = fileName.lastIndexOf('.');
  return separator >= 0 ? fileName.slice(separator).toLowerCase() : '-';
}

function formatFileModified(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '-';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
    reader.readAsText(file);
  });
}

function isDriverUploadManifest(value: unknown): value is DriverUploadManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const manifest = value as Record<string, unknown>;
  if (
    !nonEmptyString(manifest.id)
    || !nonEmptyString(manifest.displayName)
    || !nonEmptyString(manifest.version)
    || !isModelKind(manifest.kind)
    || !nonEmptyString(manifest.wireAbiVersion)
    || !Array.isArray(manifest.managementCapabilities)
    || !manifest.managementCapabilities.every(nonEmptyString)
    || !Array.isArray(manifest.requestedCapabilities)
    || !manifest.requestedCapabilities.every(nonEmptyString)
    || !('configSchema' in manifest)
  ) {
    return false;
  }
  if (!manifest.credentialSchema || typeof manifest.credentialSchema !== 'object' || Array.isArray(manifest.credentialSchema)) {
    return false;
  }
  if (manifest.kind === 'text' && !validTextManifestCapabilities(manifest.text)) return false;
  if (manifest.kind === 'image' && !validImageManifestCapabilities(manifest.image)) return false;
  const slots = (manifest.credentialSchema as Record<string, unknown>).slots;
  return Array.isArray(slots) && slots.every((slot) => {
    if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return false;
    const candidate = slot as Record<string, unknown>;
    return nonEmptyString(candidate.name) && typeof candidate.required === 'boolean';
  });
}

function isModelKind(value: unknown): value is ModelKind {
  return value === 'text' || value === 'image' || value === 'video';
}

function validTextManifestCapabilities(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const text = value as Record<string, unknown>;
  return Array.isArray(text.protocolContracts)
    && text.protocolContracts.length > 0
    && text.protocolContracts.every(nonEmptyString);
}

function validImageManifestCapabilities(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const image = value as Record<string, unknown>;
  return Array.isArray(image.protocolContracts)
    && image.protocolContracts.length > 0
    && image.protocolContracts.every((contract) => IMAGE_PROTOCOL_CONTRACTS.includes(contract as ImageProtocolContract));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function driverCapabilityLabels(driver: DriverCatalogItem): string[] {
  if (driver.manifest.kind === 'text') {
    return (driver.manifest.text?.protocolContracts ?? []).map(textProtocolDisplayName);
  }
  if (driver.manifest.kind === 'image') {
    return (driver.manifest.image?.protocolContracts ?? []).map(imageProtocolDisplayName);
  }
  return [];
}

function uploadManifestCapabilityLabels(manifest: DriverUploadManifest): string[] {
  if (manifest.kind === 'text') return (manifest.text?.protocolContracts ?? []).map(textProtocolDisplayName);
  if (manifest.kind === 'image') return (manifest.image?.protocolContracts ?? []).map(imageProtocolDisplayName);
  return [];
}

function endpointEditorLabels(t: (key: string) => string) {
  return {
    createTitle: t('endpoints.createTitle'),
    editTitle: t('endpoints.editTitle'),
    group: t('endpoints.group'),
    kind: t('endpoints.kind'),
    name: t('endpoints.name'),
    remark: t('endpoints.remark'),
    schedule: t('endpoints.schedule'),
    baseUrl: t('endpoints.baseUrl'),
    endpointType: t('endpoints.endpointType'),
    selectEndpointType: t('endpoints.selectEndpointType'),
    driver: t('endpoints.driver'),
    selectDriver: t('endpoints.selectDriver'),
    noDrivers: t('endpoints.noDrivers'),
    credentials: t('endpoints.credentials'),
    credentialConfigured: t('endpoints.credentialConfigured'),
    credentialOptional: t('endpoints.credentialOptional'),
    credentialPreserve: t('endpoints.credentialPreserve'),
    credentialNotRequired: t('endpoints.credentialNotRequired'),
    models: t('endpoints.models'),
    imageProtocols: t('endpoints.imageProtocols'),
    modelId: t('endpoints.modelId'),
    addModel: t('endpoints.addModel'),
    syncModels: t('endpoints.syncModels'),
    syncingModels: t('endpoints.syncingModels'),
    syncModelsFailed: t('endpoints.syncModelsFailed'),
    syncModelsEmpty: t('endpoints.syncModelsEmpty'),
    removeModel: t('endpoints.removeModel'),
    pricing: t('endpoints.pricing'),
    pricingConfigured: t('endpoints.pricingConfigured'),
    pricingUnconfigured: t('endpoints.pricingUnconfigured'),
    capabilities: t('endpoints.capabilities'),
    capabilitiesUnconfigured: t('endpoints.capabilitiesUnconfigured'),
    applyCapabilities: t('endpoints.applyCapabilities'),
    capabilitySettings: t('endpoints.capabilitySettings'),
    maxImagesPerRequest: t('endpoints.maxImagesPerRequest'),
    maxReferenceImages: t('endpoints.maxReferenceImages'),
    inputPrice: t('endpoints.inputPrice'),
    outputPrice: t('endpoints.outputPrice'),
    cachePrice: t('endpoints.cachePrice'),
    priceUnit: t('endpoints.priceUnit'),
    applyPricing: t('endpoints.applyPricing'),
    invalidPrice: t('endpoints.invalidPrice'),
    cancel: t('actions.cancel'),
    save: t('actions.save'),
    required: t('form.required'),
    invalidConfig: t('form.invalidDriverConfig'),
    changeDriverConfirm: t('endpoints.changeDriverConfirm'),
    kinds: { text: t('kind.text'), image: t('kind.image'), video: t('kind.video') },
    textEndpointTypes: {
      openai_chat: t('endpoints.type.openaiChat'),
      openai_responses: t('endpoints.type.openaiResponses'),
      anthropic_messages: t('endpoints.type.anthropicMessages'),
      custom: t('endpoints.type.custom')
    },
    driverConfig: t('endpoints.driverConfigStructured'),
    driverConfigEmpty: t('endpoints.driverConfigEmpty'),
    driverConfigAdvanced: t('endpoints.driverConfigAdvanced'),
    driverConfigUnsupported: t('endpoints.driverConfigUnsupported'),
    invalidNumber: t('form.invalidNumber')
  };
}

function endpointDriverAlias(driver: DriverCatalogItem): string {
  return driver.alias?.trim() ?? '';
}

function endpointDriverAccessibleName(driver: DriverCatalogItem): string {
  const alias = endpointDriverAlias(driver);
  return alias ? `${driver.manifest.displayName} (${alias})` : driver.manifest.displayName;
}

function DriverNameWithAlias({ driver }: { driver: DriverCatalogItem }) {
  const alias = endpointDriverAlias(driver);
  return (
    <span className="driver-name-with-alias">
      <strong>{driver.manifest.displayName}</strong>
      {alias && <span className="driver-alias">({alias})</span>}
    </span>
  );
}

function formatConfigSchema(schemaJSON: string): string {
  try {
    return JSON.stringify(JSON.parse(schemaJSON || '{}'), null, 2);
  } catch {
    return '{}';
  }
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatSidecarSnapshot(snapshot: SidecarSnapshot): string {
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    revision: snapshot.revision,
    profiles: snapshot.profiles.map((profile) => ({
      ref: profile.ref,
      displayName: profile.manifest.displayName,
      runtimeKind: profile.manifest.runtimeKind,
      artifact: profile.artifact
    })),
    endpoints: snapshot.endpoints.map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      driverRef: endpoint.driverRef
    })),
    groups: snapshot.groups.map((group) => ({
      id: group.id,
      name: group.name,
      sidecarConfigMode: group.sidecarConfigMode,
      mappings: group.mappings.map((mapping) => ({
        endpointId: mapping.endpointId,
        modelId: mapping.modelId,
        tier: mapping.tier,
        weight: mapping.weight,
        sortOrder: mapping.sortOrder
      }))
    })),
    apiKeyBindingCount: snapshot.apiKeys.length
  }, null, 2);
}

function emptyMapping(kind: ModelKind): ModelGroupMapping {
  return { endpointId: 0, modelId: '', tier: 0, weight: 100, sortOrder: kind === 'image' ? 1 : 1 };
}

function analyticsRangeParams(selection: AnalyticsRangeSelection) {
  if (selection.kind === 'absolute') {
    return { from: selection.from, to: selection.to };
  }
  const range = analyticsRanges.find((item) => item.key === selection.key) ?? analyticsRanges[0];
  const to = new Date();
  const from = new Date(to.getTime() - range.minutes * 60_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function fromDateTimeLocalValue(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRangeDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function analyticsRangeLabel(selection: AnalyticsRangeSelection, t: (key: string) => string): string {
  if (selection.kind === 'preset') {
    const range = analyticsRanges.find((item) => item.key === selection.key) ?? analyticsRanges[0];
    return t(range.labelKey);
  }
  return `${formatRangeDateTime(selection.from)} → ${formatRangeDateTime(selection.to)}`;
}

function TimeRangePicker({
  value,
  onChange,
  t
}: {
  value: AnalyticsRangeSelection;
  onChange: (value: AnalyticsRangeSelection) => void;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [rangeError, setRangeError] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (value.kind === 'absolute') {
      setDraftFrom(toDateTimeLocalValue(new Date(value.from)));
      setDraftTo(toDateTimeLocalValue(new Date(value.to)));
    } else {
      const params = analyticsRangeParams(value);
      setDraftFrom(toDateTimeLocalValue(new Date(params.from)));
      setDraftTo(toDateTimeLocalValue(new Date(params.to)));
    }
    setRangeError('');
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open) return;

    function updateMenuPosition() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const preferred = 340;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const nextPlacement = spaceBelow < preferred && spaceAbove > spaceBelow ? 'up' : 'down';
      const maxHeight = Math.min(420, Math.max(260, nextPlacement === 'down' ? spaceBelow - 12 : spaceAbove - 12));
      const width = Math.min(520, Math.max(360, window.innerWidth - 24));
      const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
      setPlacement(nextPlacement);
      setMenuStyle({
        position: 'fixed',
        top: nextPlacement === 'down' ? rect.bottom + 4 : undefined,
        bottom: nextPlacement === 'up' ? window.innerHeight - rect.top + 4 : undefined,
        left,
        width,
        maxHeight
      });
    }

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function applyAbsoluteRange() {
    const from = fromDateTimeLocalValue(draftFrom);
    const to = fromDateTimeLocalValue(draftTo);
    if (!from || !to) {
      setRangeError(t('analytics.rangeInvalid'));
      return;
    }
    if (from.getTime() >= to.getTime()) {
      setRangeError(t('analytics.rangeOrder'));
      return;
    }
    onChange({ kind: 'absolute', from: from.toISOString(), to: to.toISOString() });
    setOpen(false);
  }

  function applyPreset(key: AnalyticsRangeKey) {
    onChange({ kind: 'preset', key });
    setOpen(false);
  }

  return (
    <div className={open ? `time-range-picker open placement-${placement}` : 'time-range-picker'} ref={rootRef}>
      <button
        type="button"
        className="time-range-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarClock size={14} aria-hidden="true" />
        <span className="time-range-value">{analyticsRangeLabel(value, t)}</span>
        <ChevronDown size={14} className="time-range-caret" aria-hidden="true" />
      </button>
      {open && createPortal(
        <div className="time-range-menu" role="dialog" aria-label={t('analytics.rangePicker')} ref={menuRef} style={menuStyle}>
          <div className="time-range-absolute">
            <strong>{t('analytics.rangeAbsolute')}</strong>
            <div className="field">
              <span>{t('analytics.rangeFrom')}</span>
              <input
                aria-label={t('analytics.rangeFrom')}
                type="datetime-local"
                step="1"
                value={draftFrom}
                onChange={(event) => {
                  setDraftFrom(event.target.value);
                  setRangeError('');
                }}
              />
            </div>
            <div className="field">
              <span>{t('analytics.rangeTo')}</span>
              <input
                aria-label={t('analytics.rangeTo')}
                type="datetime-local"
                step="1"
                value={draftTo}
                onChange={(event) => {
                  setDraftTo(event.target.value);
                  setRangeError('');
                }}
              />
            </div>
            {rangeError && <p className="time-range-error">{rangeError}</p>}
            <button type="button" className="btn primary time-range-apply" onClick={applyAbsoluteRange}>
              {t('analytics.rangeApply')}
            </button>
          </div>
          <div className="time-range-quick">
            <strong>{t('analytics.rangeQuick')}</strong>
            <div className="time-range-quick-list" role="listbox">
              {analyticsRanges.map((range) => {
                const active = value.kind === 'preset' && value.key === range.key;
                return (
                  <button
                    key={range.key}
                    type="button"
                    className={active ? 'time-range-option active' : 'time-range-option'}
                    role="option"
                    aria-selected={active}
                    onClick={() => applyPreset(range.key)}
                  >
                    <span>{t(range.labelKey)}</span>
                    {active && <Check size={14} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function errorMessage(error: unknown, t: (key: string) => string): string {
  if (error instanceof LegateAPIError) {
    if (error.status === 401) return t('auth.unauthorized');
    if (error.status === 403) return t('auth.forbidden');
    if (error.code === 'endpoint_driver_profile_in_use') return t('drivers.profileInUse');
    if (error.code === 'admin_oidc_not_configured') return t('auth.oidcMissing');
    if (error.status >= 500 || isGenericHttpStatusText(error.message)) return t('app.serverError');
    if (error.message?.trim()) return error.message;
    return t('app.error');
  }
  if (error instanceof TypeError) return t('app.backendUnavailable');
  if (error instanceof Error) {
    if (isNetworkErrorMessage(error.message) || isGenericHttpStatusText(error.message)) {
      return t('app.backendUnavailable');
    }
    if (error.message?.trim()) return error.message;
  }
  return t('app.error');
}

function isNetworkErrorMessage(message: string): boolean {
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|econnrefused|enotfound/i.test(message);
}

function isGenericHttpStatusText(message: string): boolean {
  return /^(internal server error|bad gateway|service unavailable|gateway timeout|error)$/i.test(message.trim());
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatCurrency(value: number | string | null, digits = 2): string {
  if (value === null) return '-';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `$${numeric.toFixed(digits)}` : '-';
}

function formatLatency(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

function formatOptionalInteger(value: number | null): string {
  return value === null ? '-' : formatInteger(value);
}

function formatDate(value: string | null | undefined, t: (key: string) => string): string {
  if (!value) return t('time.never');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('time.never');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatOptionalSidecarDate(value: string | null | undefined, t: (key: string) => string): string {
  return value ? formatDate(value, t) : t('sidecars.notReported');
}

function formatOptionalSidecarCount(value: number | null | undefined, saturated: boolean, t: (key: string) => string): string {
  if (value === null || value === undefined) return t('sidecars.notReported');
  const formatted = formatInteger(value);
  return saturated ? `${formatted} (${t('sidecars.counterSaturated')})` : formatted;
}

function sidecarViewForSearch(search: string): SidecarView {
  return new URLSearchParams(search).get('view') === 'tokens' ? 'tokens' : 'instances';
}

function pullResultLabel(success: boolean | null, t: (key: string) => string): string {
  if (success === true) return t('sidecars.pullSuccess');
  if (success === false) return t('sidecars.pullFailed');
  return t('sidecars.notReported');
}

function shortenID(value: string): string {
  return value.length > 28 ? `${value.slice(0, 25)}...` : value;
}

function trimNumber(value: number): string {
  return String(Number(value || 0));
}

function analyticsAvailability(summary: InvocationAnalyticsSummary): number {
  return summary.attempts.count > 0
    ? (summary.attempts.availableCount * 100) / summary.attempts.count
    : 0;
}
