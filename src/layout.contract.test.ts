import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';
import apiSource from './api.ts?raw';
import authGatewaySource from './AuthGateway.tsx?raw';
import loginPageSource from './LoginPage.tsx?raw';
import mainSource from './main.tsx?raw';
import workspaceMembersSource from './WorkspaceMembersPanel.tsx?raw';
import selectControlSource from './SelectControl.tsx?raw';
import adminUsersSource from './AdminUsersPage.tsx?raw';
import endpointEditorSource from './EndpointEditor.tsx?raw';
import endpointsPageSource from './EndpointsPage.tsx?raw';
import { buttonLabelKeys, dictionaryFor } from './i18n';

const stylesSource = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const endpointsStylesSource = readFileSync(new URL('./EndpointsPage.css', import.meta.url), 'utf8');
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesSource.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match?.[1] ?? '';
}

function endpointCssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = endpointsStylesSource.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match?.[1] ?? '';
}

describe('layout contracts', () => {
  it('keeps endpoint editor focus rings visible and endpoint type labels centered', () => {
    const actionsRule = endpointCssRule('.endpoint-editor-actions');

    expect(endpointCssRule('.endpoint-editor-modal .modal-body')).toContain('padding-right: 0');
    expect(endpointCssRule('.endpoint-editor-scroll')).toContain('padding: 6px 20px 24px 6px');
    expect(endpointCssRule('.endpoint-editor-scroll')).toContain('scrollbar-gutter: stable');
    expect(actionsRule).toContain('margin: 0 0 0 -14px');
    expect(actionsRule).toContain('padding: 14px');
    expect(endpointCssRule('.endpoint-editor-switch')).toContain('align-items: flex-start');
    expect(endpointCssRule('.endpoint-editor-switch')).toContain('flex-direction: column');
    expect(endpointCssRule('.endpoint-editor-switch')).toContain('gap: 8px');
    expect(endpointCssRule('.endpoint-type-option')).toContain('display: flex');
    expect(endpointCssRule('.endpoint-type-option')).toContain('align-items: center');
    expect(endpointCssRule('.endpoint-type-option')).toContain('line-height: 1');
    expect(endpointCssRule('.endpoint-type-select .select-value,\n.endpoint-type-select-option > span:first-child')).toContain('align-items: center');
  });

  it('renders endpoint pricing as one aligned input surface without a segmented unit box', () => {
    const groupRule = endpointCssRule('.endpoint-model-price-input');
    const inputRule = endpointCssRule('.endpoint-model-price-input input');
    const unitRule = endpointCssRule('.endpoint-model-price-input > span');

    expect(groupRule).toContain('min-height: 32px');
    expect(groupRule).toContain('border: 1px solid var(--border)');
    expect(groupRule).toContain('background: var(--panel)');
    expect(inputRule).toContain('border: 0 !important');
    expect(inputRule).toContain('box-shadow: none !important');
    expect(unitRule).not.toContain('border:');
    expect(unitRule).not.toContain('background:');
  });

  it('explains endpoint model incompatibility in both supported languages', () => {
    expect(dictionaryFor('zh')['groups.incompatible.driver_kind']).toBe('驱动类型不匹配');
    expect(dictionaryFor('en')['groups.incompatible.driver_kind']).toBe('Driver kind does not match');
  });

  it('uses token terminology for sidecar credentials', () => {
    const zh = dictionaryFor('zh');
    const en = dictionaryFor('en');

    expect(zh['actions.addSidecar']).toBe('添加 Sidecar 令牌');
    expect(zh['sidecars.tokens']).toBe('令牌');
    expect(zh['sidecars.token']).toBe('令牌');
    expect(en['actions.addSidecar']).toBe('Add Sidecar Token');
    expect(en['sidecars.tokens']).toBe('Tokens');
    expect(en['sidecars.token']).toBe('Token');
  });

  it('removes the old Arco UI dependency and runtime imports', () => {
    expect(packageSource).not.toContain('@arco-design/web-react');
    expect(appSource).not.toContain('@arco-design/web-react');
    expect(mainSource).not.toContain('@arco-design/web-react');
    expect(stylesSource).not.toContain('arco-');
  });

  it('boots the protected application through the authentication gateway', () => {
    expect(mainSource).toContain('<AuthGateway>');
    expect(mainSource).toContain('<App');
    expect(authGatewaySource).toContain('setUnauthorizedHandler');
    expect(loginPageSource).toContain('legate-transparent.png');
    expect(stylesSource).toContain('.login-shell');
  });

  it('keeps theme and language switches inside the avatar settings menu', () => {
    expect(appSource).toContain('className="avatar-button"');
    expect(appSource).toContain('data-testid="settings-menu"');
    expect(appSource).toContain('testId="theme-toggle"');
    expect(appSource).toContain('testId="locale-toggle"');
    expect(appSource).toContain('setTheme(value as ThemeName)');
    expect(appSource).toContain('setLocale(value as Locale)');
  });

  it('defines coordinated dark and light theme tokens', () => {
    expect(stylesSource).toContain(":root[data-theme='dark']");
    expect(cssRule(':root')).toContain('--primary:');
    expect(cssRule(":root[data-theme='dark']")).toContain('--primary:');
    expect(cssRule(':root')).toContain('--green:');
    expect(cssRule(":root[data-theme='dark']")).toContain('--red:');
  });

  it('keeps text buttons rectangular instead of pill shaped', () => {
    const buttonRule = cssRule('.btn');
    const smallRule = cssRule('.btn.small');
    const segmentedRule = cssRule('.segmented button,\n.tabs button');

    expect(buttonRule).toContain('border-radius: 8px');
    expect(buttonRule).toContain('height: 32px');
    expect(buttonRule).not.toContain('999');
    expect(smallRule).toContain('border-radius: 6px');
    expect(segmentedRule).toContain('border-radius: 6px');
    expect(cssRule('.page-actions')).toContain('align-items: center');
    expect(cssRule('.page-actions')).toContain('min-height: 32px');
    expect(cssRule('.segmented,\n.tabs')).toContain('min-height: 32px');
  });

  it('uses blue primary action tokens aligned with the design system', () => {
    const primaryButton = cssRule('.btn.primary');
    const segmentedActive = cssRule('.segmented button.active,\n.tabs button.active');
    const navActive = cssRule('.nav-item.active');
    const iconButton = cssRule('.icon-button,\n.avatar-button,\n.row-actions button');

    expect(cssRule(':root')).toContain('--button-primary-bg: #2563eb');
    expect(cssRule(":root[data-theme='dark']")).toContain('--button-primary-bg: #3b82f6');
    expect(primaryButton).toContain('background: var(--button-primary-bg)');
    expect(primaryButton).not.toContain('var(--primary)');
    expect(segmentedActive).toContain('background: var(--button-active-bg)');
    expect(navActive).toContain('background: var(--nav-active-bg)');
    expect(navActive).not.toContain('box-shadow');
    expect(iconButton).toContain('background: var(--button-secondary-bg)');
  });

  it('uses dense dashboard layout primitives from the redesign', () => {
    expect(cssRule('.app-shell')).toContain('grid-template-columns: 248px minmax(0, 1fr)');
    expect(cssRule('.metrics-grid')).toContain('repeat(4, minmax(0, 1fr))');
    expect(cssRule('.data-table th,\n.data-table td')).toContain('text-align: left');
    expect(cssRule('.panel')).toContain('border: 1px solid var(--border)');
    expect(cssRule(':root')).toContain('font-size: 13px');
  });

  it('lays out sidecar runtime statistics as equal full-width thirds', () => {
    const summaryRule = cssRule('.sidecar-summary');
    const numberRule = cssRule('.sidecar-summary .stat-pill strong');

    expect(summaryRule).toContain('display: grid');
    expect(summaryRule).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(numberRule).toContain('font-size: 28px');
    expect(stylesSource).toMatch(/@media \(max-width: 640px\)[\s\S]*\.sidecar-summary\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it('keeps the topbar as actions only without duplicate page titles', () => {
    expect(appSource).not.toContain('activePageTitle');
    expect(appSource).not.toContain('pageHeading(');
    expect(appSource).toContain('<header className="topbar">');
    expect(appSource).toContain('<div className="top-actions">');
    expect(appSource).not.toContain('className="global-search"');
    expect(appSource).not.toContain("t('top.search')");
    expect(stylesSource).not.toContain('.topbar > div:first-child p');
    expect(stylesSource).not.toContain('.global-search');
    expect(cssRule('.topbar')).toContain('justify-content: flex-end');
    expect(cssRule('.topbar')).toContain('min-height: 48px');
  });

  it('places workspace switching in the bottom-left switcher', () => {
    expect(appSource).toContain('data-testid="workspace-switcher"');
    expect(appSource).toContain('data-testid="workspace-menu"');
    expect(appSource).toContain('listMyWorkspaces');
    expect(appSource).toContain('switchWorkspace');
    expect(appSource).toContain('className="sidebar-footer"');
    expect(appSource).toContain("workspaceMenuOpen ? 'workspace-menu-open' : ''");
    expect(stylesSource).toContain('.workspace-switcher');
    // cssRule() matches the first selector substring; assert the dedicated rules directly.
    expect(stylesSource).toMatch(/\.sidebar-footer\s*\{[^}]*overflow:\s*visible/m);
    expect(cssRule('.sidebar.workspace-menu-open')).toContain('overflow: visible');
    expect(cssRule('.sidebar.workspace-menu-open')).toContain('z-index: 50');
    expect(stylesSource).toMatch(/\n\.workspace-switcher\s*\{[^}]*height: 44px;[^}]*padding: 4px 6px;/);
    expect(cssRule('.workspace-switcher-copy')).toContain('line-height: 1.3');
  });

  it('exposes tiered routing controls in the model group modal', () => {
    expect(appSource).toContain("label={t('groups.endpoint')}");
    expect(appSource).toContain("label={t('groups.model')}");
    expect(appSource).toContain('className="mapping-tier-input"');
    expect(appSource).toContain('className="mapping-weight-input"');
    expect(appSource).toContain('className="icon-button danger mapping-delete-button"');
    expect(appSource).toContain("t('groups.tier')");
    expect(appSource).toContain("t('groups.weight')");
    expect(appSource).toContain("label={t('groups.sidecarConfigMode')}");
    expect(appSource).toContain("value: 'full', label: t('groups.sidecarConfigFull')");
    expect(appSource).toContain("value: 'reference', label: t('groups.sidecarConfigReference')");
    expect(cssRule('.mapping-delete-button')).toContain('margin-top: 22px');
  });

  it('keeps list mappings as the default and exposes the visual routing editor', () => {
    expect(appSource).toContain("useState<GroupMappingView>('list')");
    expect(appSource).toContain("setGroupMappingView('list')");
    expect(appSource).toContain("value: 'visual', label: t('groups.visualView'), icon: Workflow");
    expect(appSource).toContain('<ModelGroupMappingVisualizer');
    expect(stylesSource).toContain('.mapping-visualizer');
    expect(stylesSource).toContain('.mapping-model-node.selected');
    expect(stylesSource).toContain('.mapping-inspector');
  });

  it('supports collapsible sidebar without a side search box', () => {
    expect(appSource).toContain('data-testid="sidebar-toggle"');
    expect(appSource).toContain('data-testid="sidebar-collapse"');
    expect(appSource).toContain('sidebarCollapsed');
    expect(appSource).toContain('className="brand-toggle"');
    expect(appSource).toContain('brand-expand-icon');
    expect(appSource).not.toContain('className="side-search"');
    expect(stylesSource).not.toContain('.side-search');
    expect(stylesSource).toContain('.sidebar-toggle');
    expect(stylesSource).toContain('.brand-toggle');
    expect(stylesSource).toContain('.app-shell.sidebar-collapsed');
    expect(cssRule('.app-shell.sidebar-collapsed')).toContain('grid-template-columns: 60px minmax(0, 1fr)');
    expect(stylesSource).toMatch(
      /@media \(max-width: 1120px\) \{[\s\S]*?\.app-shell,\s*\.app-shell\.sidebar-collapsed\s*\{[^}]*grid-template-columns: 60px minmax\(0, 1fr\)/
    );
    expect(cssRule('.sidebar.collapsed .brand')).toContain('justify-content: flex-start');
    expect(cssRule('.sidebar.collapsed .brand')).toContain('flex-wrap: nowrap');
    expect(cssRule('.sidebar.collapsed .brand')).toContain('padding: 12px 0 8px');
    expect(cssRule('.sidebar.collapsed .brand-toggle')).toContain('width: 36px');
    expect(cssRule('.sidebar.collapsed .brand-toggle')).toContain('margin-left: 12px');
    expect(cssRule('.sidebar.collapsed .brand-toggle')).not.toContain('margin-inline: auto');
    expect(cssRule('.sidebar.collapsed .brand-logo')).toContain('width: 22px');
    expect(cssRule('.sidebar.collapsed .brand-logo')).toContain('transform: translateX(2px)');
    expect(cssRule('.sidebar.collapsed .nav-item')).toContain('width: 36px');
    expect(cssRule('.sidebar.collapsed .nav-item')).toContain('justify-self: start');
    expect(cssRule('.sidebar.collapsed .nav-item')).toContain('margin-left: 12px');
    expect(cssRule('.sidebar.collapsed .nav-item')).not.toContain('margin-inline: auto');
    expect(cssRule('.sidebar.collapsed .side-nav')).toContain('padding-inline: 0');
    expect(cssRule('.sidebar.collapsed .sidebar-footer')).toContain('justify-content: flex-start');
    expect(cssRule('.sidebar.collapsed .workspace-switcher')).toContain('width: 44px');
    expect(cssRule('.sidebar.collapsed .workspace-switcher')).toContain('margin-left: 8px');
    expect(cssRule('.sidebar.collapsed .workspace-switcher')).not.toContain('margin-inline: auto');
    expect(cssRule('.brand-mark,\n.brand-toggle')).toContain('width: 28px');
    expect(cssRule('.brand-logo')).toContain('width: 22px');
    expect(cssRule('.sidebar-toggle')).toContain('width: 28px');
    expect(cssRule('.brand-toggle:hover .brand-logo,\n.brand-toggle:focus-visible .brand-logo')).toContain('opacity: 0');
    expect(cssRule('.brand-toggle:hover .brand-expand-icon,\n.brand-toggle:focus-visible .brand-expand-icon')).toContain('opacity: 1');
    expect(cssRule('.nav-item')).toContain('min-height: 36px');
    expect(cssRule('.side-nav')).toContain('gap: 4px');
    expect(cssRule('.sidebar')).toContain('overflow: hidden');
    expect(cssRule('.side-nav')).toContain('overflow-x: hidden');
    expect(cssRule('.side-nav')).not.toContain('scrollbar-gutter: stable');
    expect(cssRule('.nav-item span')).toContain('white-space: nowrap');
    expect(appSource).toContain('nav-section-divider');
    expect(cssRule('.nav-section-divider')).toContain('height: 1px');
    expect(cssRule('.nav-section-divider')).toContain('justify-self: start');
    expect(cssRule('.nav-section-divider')).toContain('margin: 16px 0 17px 21px');
    expect(cssRule('.nav-section-label')).toContain('min-height: 22px');
    expect(appSource).toContain('strokeWidth: 1.25');
    expect(appSource).toContain('absoluteStrokeWidth: true');
    expect(cssRule('.nav-item svg')).toContain('shape-rendering: geometricPrecision');
    expect(appSource).not.toContain("t('app.subtitle')");
  });

  it('aligns the expanded brand with the navigation icon and label columns', () => {
    const brandRule = cssRule('.brand');

    expect(brandRule).toContain('padding: 16px 12px 12px 16px');
    expect(brandRule).toContain('gap: 5px');
    expect(cssRule('.brand-mark .brand-logo')).toContain('transform: translateX(2px)');
  });

  it('uses the transparent Legate logo without a forced white plate', () => {
    expect(appSource).toContain("import legateLogo from './assets/legate-transparent.png'");
    expect(appSource).toContain('className="brand-logo"');
    expect(appSource).toContain('src={legateLogo}');
    expect(appSource).toContain('alt="Legate"');
    expect(appSource).not.toContain("import legateLogoWhite from './assets/legate-white.png'");
    expect(appSource).not.toContain('<ShieldCheck size={20}');
    expect(cssRule('.brand-mark,\n.brand-toggle')).toContain('background: transparent');
    expect(cssRule('.brand-mark,\n.brand-toggle')).not.toContain('background: #ffffff');
    expect(cssRule('.brand-mark,\n.brand-toggle')).toContain('overflow: hidden');
    expect(cssRule('.brand-logo')).toContain('object-fit: contain');
  });

  it('publishes Legate browser and touch icons', () => {
    expect(indexSource).toContain('href="/favicon-32-transparent.png"');
    expect(indexSource).toContain('href="/icon-192-transparent.png"');
    expect(indexSource).toContain('href="/icon-512-transparent.png"');
    expect(indexSource).toContain('href="/apple-touch-icon-transparent.png"');
    expect(indexSource).toContain('name="theme-color" content="#ffffff"');
  });

  it('uses standard capitalization for the browser tab title', () => {
    expect(indexSource).toContain('<title>Legate Console</title>');
  });

  it('keeps all known English button labels in English', () => {
    const en = dictionaryFor('en');
    const chinesePattern = /[㐀-鿿]/;
    for (const key of buttonLabelKeys) {
      expect(en[key], key).toBeTruthy();
      expect(en[key], key).not.toMatch(chinesePattern);
    }
  });

  it('has first-class pages for sidecars, workspaces, analytics, and OIDC-ready settings', () => {
    expect(appSource).toContain("type PageKey = 'overview' | 'endpoints' | 'drivers' | 'groups' | 'keys' | 'sidecars' | 'analytics' | 'workspaces'");
    expect(appSource).toContain('getSidecarSnapshot');
    expect(appSource).toContain('listWorkspaces');
    expect(appSource).toContain('listMyWorkspaces');
    expect(apiSource).toContain('setAdminTokenProvider');
    expect(apiSource).toContain('setUnauthorizedHandler');
    expect(apiSource).toContain('getPublicAuthConfig');
    expect(apiSource).toContain('getCurrentAdmin');
    expect(apiSource).toContain('logoutAdmin');
    expect(appSource).not.toContain('settings.token');
    expect(appSource).toContain('saveWorkspaceSlug');
    expect(apiSource).not.toContain('ADMIN_LOGIN_URL');
    expect(apiSource).not.toContain('ADMIN_LOGOUT_URL');
  });

  it('loads real built-in and WASM driver sources', () => {
    const zh = dictionaryFor('zh');
    const en = dictionaryFor('en');
    const driverSource = `${appSource}\n${JSON.stringify(zh)}\n${JSON.stringify(en)}`.toLowerCase();
    const driverViewSource = appSource.slice(appSource.indexOf('function renderDrivers'), appSource.indexOf('function renderGroups'));

    expect(zh['nav.drivers']).toBe('驱动');
    expect(en['nav.drivers']).toBe('Drivers');
    expect(apiSource).toContain('listDrivers');
    expect(apiSource).toContain('listDriverProfiles');
    expect(apiSource).toContain('uploadDriverProfile');
    expect(apiSource).toContain('deleteDriverProfile');
    expect(driverViewSource).toContain("item.source === 'builtin'");
    expect(driverViewSource).toContain('filteredDriverProfiles.map');
    expect(driverViewSource).toContain("item.manifest.kind === driverKindFilter");
    expect(driverViewSource).toContain("profile.manifest.kind === driverKindFilter");
    expect(driverViewSource).toContain("t('drivers.upload')");
    expect(driverViewSource).toContain('<Segmented');
    expect(appSource).toContain('className={`file-dropzone${dragActive');
    expect(cssRule('.file-picker-input')).toContain('opacity: 0');
    expect(cssRule('.file-dropzone')).toContain('border: 1px dashed var(--border-strong)');
    expect(cssRule('.file-dropzone')).toContain('min-height: 108px');
    expect(appSource).toContain('<dl className="driver-detail-grid driver-profile-detail-grid">');
    expect(cssRule('.driver-detail-grid')).toContain('min-width: 0');
    expect(cssRule('.driver-profile-detail-grid')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(cssRule('.driver-profile-detail-grid')).toContain('gap: 18px');
    expect(cssRule('.driver-profile-detail-grid dt')).toContain('font-size: 12px');
    expect(cssRule('.driver-profile-detail-grid dt')).toContain('font-weight: 650');
    expect(cssRule('.driver-detail-grid dd')).toContain('overflow-wrap: anywhere');
    expect(cssRule('.driver-detail-grid code')).toContain('white-space: normal');
    expect(cssRule('.driver-schema-preview')).toContain('overflow-x: hidden');
    expect(cssRule('.driver-profile-modal .modal-body')).toContain('overflow-x: hidden');
    expect(driverSource).not.toContain('o' + 'ci');
    expect(driverSource).not.toContain('r' + 'pc');
    expect(stylesSource).toMatch(/@media \(max-width: 640px\)[\s\S]*\.driver-upload-grid,[\s\S]*grid-template-columns:\s*1fr/);
  });

  it('keeps endpoint details top-aligned with relaxed spacing', () => {
    expect(appSource).toContain('className="endpoint-detail-modal"');
    expect(endpointEditorSource).toContain('className="endpoint-detail-grid"');
    expect(endpointCssRule('.endpoint-detail-grid')).toContain('gap: 24px 36px');
    expect(endpointCssRule('.endpoint-detail-field')).toContain('gap: 8px');
  });

  it('keeps all primary navigation items in the mobile grid', () => {
    expect(cssRule('.side-nav > div')).toContain('display: grid');
    expect(stylesSource).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.side-nav\s*>\s*div\s*\{[^}]*display:\s*contents/
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.side-nav\s+\.nav-section-divider\s*\{[^}]*display:\s*none/
    );
  });

  it('contains the driver table overflow and keeps both driver view buttons visible on mobile', () => {
    const driverViewSource = appSource.slice(appSource.indexOf('function renderDrivers'), appSource.indexOf('function renderGroups'));

    expect(driverViewSource).toContain('className="driver-tabs"');
    expect(driverViewSource).toContain('className="driver-kind-tabs"');
    expect(driverViewSource).toContain('className="driver-filter-bar"');
    expect(driverViewSource).toContain('className="driver-filter-controls"');
    expect(driverViewSource).toContain('className="driver-filter-divider"');
    expect(driverViewSource.indexOf('className="driver-tabs"')).toBeLessThan(
      driverViewSource.indexOf('className="btn primary driver-upload-action"')
    );
    expect(cssRule('.driver-page-intro')).toContain('align-items: flex-start');
    expect(cssRule('.driver-filter-bar')).toContain('justify-content: space-between');
    expect(cssRule('.driver-filter-controls')).toContain('align-items: center');
    expect(cssRule('.driver-filter-divider')).toContain('background: var(--border)');
    expect(driverViewSource).toContain('<col className="driver-profile-name-col" />');
    expect(driverViewSource).toContain('<col className="driver-profile-actions-col" />');
    expect(driverViewSource).toContain('<col className="driver-profile-uploader-col" />');
    expect(driverViewSource).toContain('className="driver-profile-ref-cell"');
    expect(driverViewSource).toContain('className="driver-invocation-tags"');
    expect(cssRule('.driver-profile-table')).toContain('table-layout: fixed');
    expect(cssRule('.driver-profile-actions-col')).toContain('width: 56px');
    expect(cssRule('.driver-profile-ref-cell code')).toContain('text-overflow: ellipsis');
    expect(cssRule('.driver-profile-uploader-cell')).toContain('text-overflow: ellipsis');
    expect(cssRule('.driver-profile-table .driver-invocation-tags')).toContain('flex-wrap: wrap');
    expect(cssRule('.driver-profile-table .driver-name-with-alias')).toContain('display: inline');
    expect(stylesSource).not.toMatch(/(?:^|\n)body\s*\{[^}]*overflow-x:\s*hidden/);
    expect(stylesSource).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.workspace,\s*\.workspace-page,\s*\.page-intro,\s*\.page-actions\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%/
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.driver-table-panel,\s*\.driver-table-panel\s+\.table-scroll\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*min-width:\s*0/
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.driver-table-panel\s+\.table-scroll\s*\{[^}]*overflow-x:\s*auto/
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.driver-tabs,\s*\.driver-tabs\s+\.segmented,\s*\.driver-kind-tabs,\s*\.driver-kind-tabs\s+\.segmented\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0/
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.driver-tabs\s+\.segmented\s+button,\s*\.driver-kind-tabs\s+\.segmented\s+button\s*\{[^}]*flex:\s*1\s+1\s+0;[^}]*min-width:\s*0;[^}]*justify-content:\s*center/
    );
  });

  it('exposes workspace member management driven by workspace_members capabilities', () => {
    expect(appSource).toContain('<WorkspaceMembersPanel');
    expect(appSource).toContain('methods={authConfig.methods}');
    expect(appSource).not.toContain('locale={locale}');
    expect(appSource).toContain('openMembersModal');
    expect(appSource).toContain('canManageWorkspaceMembers');
    expect(appSource).toContain("modal === 'members'");
    expect(workspaceMembersSource).toContain('listWorkspaceMembers');
    expect(workspaceMembersSource).toContain('resolveWorkspaceMember');
    expect(workspaceMembersSource).toContain("{ userId: resolved.userId, role: existingRole }");
    expect(workspaceMembersSource).toContain("{ email, providerId: inviteProviderID, role: inviteRole }");
    expect(workspaceMembersSource).toContain('deleteWorkspaceMember(workspace.id, member.userId)');
    expect(workspaceMembersSource).not.toContain('className="panel');
    expect(apiSource).toContain('export type AddWorkspaceMemberPayload');
    expect(apiSource).toContain('email?: never; providerId?: never');
    expect(apiSource).toContain('userId?: never; email: string; providerId: string');
    expect(cssRule('.workspace-members-panel')).toContain('min-width: 0');
    expect(cssRule('.member-table-scroll')).toContain('overflow-x: auto');
    expect(cssRule('.member-table')).toContain('table-layout: fixed');
    expect(stylesSource).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.member-form-grid,[\s\S]*?\.member-form-grid\.invite\s*\{[^}]*grid-template-columns:\s*1fr/
    );
  });

  it('uses a schedule switch in the endpoint editor', () => {
    expect(endpointEditorSource).toContain('role="switch"');
    expect(endpointEditorSource).toContain('aria-checked={draft.scheduleEnabled}');
    expect(endpointEditorSource).toContain("className={draft.scheduleEnabled ? 'switch on' : 'switch'}");
  });

  it('keeps platform user administration compact, unframed, and overflow-safe', () => {
    expect(adminUsersSource).toContain('className="admin-users-page"');
    expect(adminUsersSource).toContain('className="admin-user-table-scroll"');
    expect(adminUsersSource).toContain('className="admin-user-dialog"');
    expect(adminUsersSource).not.toContain('className="card');
    expect(cssRule('.admin-users-page')).toContain('min-width: 0');
    expect(cssRule('.admin-user-table-scroll')).toContain('overflow-x: auto');
    expect(cssRule('.admin-user-table')).toContain('table-layout: fixed');
    expect(cssRule('.admin-user-dialog')).toContain('overflow: hidden');
  });

  it('keeps endpoint status and kind backend-owned while editing', () => {
    expect(endpointEditorSource).toContain('if (editing) return;');
    expect(endpointEditorSource).toContain('<ReadOnlyField label={labels.kind}');
    expect(cssRule('.switch')).toContain('transition: background-color');
    expect(cssRule('.switch span')).toContain('transition: transform');
    expect(cssRule('.switch.on span')).toContain('transform: translateX(16px)');
    expect(endpointEditorSource).toContain('rows={2}');
  });

  it('manages endpoint models as a responsive structured list', () => {
    expect(endpointEditorSource).toContain('className="endpoint-model-list"');
    expect(endpointEditorSource).toContain('addEndpointModel');
    expect(endpointEditorSource).toContain('removeEndpointModel');
    expect(endpointCssRule('.endpoint-model-list')).toContain('display: grid');
    expect(endpointsStylesSource).toMatch(/@media \(max-width: 640px\)[\s\S]*\.endpoint-editor-grid,[\s\S]*?\{[^}]*grid-template-columns:\s*1fr/);
  });

  it('uses grouped endpoints and strict kind-to-driver coupling', () => {
    expect(appSource).toContain('<EndpointsPage');
    expect(endpointsPageSource).toContain('onCreateEndpoint(group.id)');
    expect(endpointEditorSource).toContain('filterDriversByKind([...drivers], draft.kind)');
    expect(endpointEditorSource).toContain('changeEndpointDraftKind(current, kind)');
    expect(endpointEditorSource).toContain('disabled={!editing}');
    expect(appSource).not.toContain('EndpointInterfaceType');
    expect(appSource).not.toContain('interfaceChatCompletions');
    expect(appSource).toContain('renderIncompatibleModels');
  });

  it('uses themed custom selects instead of native system menus', () => {
    expect(selectControlSource).toContain('function SelectControl');
    expect(selectControlSource).toContain('createPortal');
    expect(selectControlSource).toContain('document.body');
    expect(selectControlSource).toContain('nearestScrollBoundary');
    expect(selectControlSource).toContain("visibility = 'hidden'");
    expect(appSource).not.toContain('<select');
    expect(workspaceMembersSource).not.toContain('<select');
    expect(stylesSource).toContain('.select-trigger');
    expect(stylesSource).toContain('.select-menu');
    expect(cssRule('.select-trigger')).toContain('padding: 0 10px 0 12px');
    expect(cssRule('.select-menu')).toContain('background: var(--panel-solid)');
    expect(cssRule('.select-menu')).toContain('z-index: 200');
    expect(cssRule('.modal')).toContain('display: flex');
    expect(cssRule('.modal')).toContain('overflow: hidden');
    expect(cssRule('.modal-body')).toContain('overflow-y: auto');
    expect(cssRule('.modal-actions')).toContain('position: sticky');
    expect(cssRule('.modal-actions')).toContain('bottom: -14px');
    expect(cssRule('.modal-actions')).toContain('z-index: 100');
    expect(cssRule('.group-editor-modal .group-invocation-field')).toContain('margin-top: 10px');
    expect(cssRule('.mapping-editor .section-title')).toContain('align-items: flex-start');
    expect(cssRule('.mapping-editor .section-title')).toContain('margin-top: 0');
  });
});
