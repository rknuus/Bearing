<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { initMockBindings, isWailsRuntime } from './lib/wails-mock';
  import CalendarView from './views/CalendarView.svelte';
  import EisenKanView from './views/EisenKanView.svelte';
  import OKRView from './views/OKRView.svelte';
  import Breadcrumb from './lib/components/Breadcrumb.svelte';
  import BearingLogo from './lib/components/BearingLogo.svelte';
  import { getIdType } from './lib/utils/id-parser';
  import { getBindings } from './lib/utils/bindings';
  import { initLocale } from './lib/utils/date-format';
  import { handleWindowShortcut } from './lib/utils/window-commands';
  import { UNTAGGED_SENTINEL } from './lib/constants/filters';
  import { formatDateLong } from './lib/utils/date-format';
  import Toast from './lib/components/Toast.svelte';

  // View types
  type ViewType = 'calendar' | 'eisenkan' | 'okr';

  // Current view state using Svelte 5 runes
  let currentView = $state<ViewType>('okr');
  let currentItemId = $state<string>('');
  let filterThemeIds = $state<string[]>([]);
  let filterTagIds = $state<string[]>([]);
  let todayFocusActive = $state(true);
  let todayFocusThemeIds = $state<string[]>([]);
  let tagFocusActive = $state(true);
  let todayFocusTags = $state<string[]>([]);

  // Advisor session state — lives here so it survives view switches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed inside AdvisorChat
  let advisorMessages = $state<any[]>([]);
  let advisorPanelOpen = $state(false);

  // Centralized current date (updates at midnight)
  let currentDate = $state(new Date().toISOString().split('T')[0]);
  let toastMessage = $state<string | null>(null);
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleMidnightUpdate() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    midnightTimer = setTimeout(() => {
      handleDayChange();
      scheduleMidnightUpdate();
    }, msUntilMidnight);
  }

  async function handleDayChange() {
    currentDate = new Date().toISOString().split('T')[0];

    // Re-resolve Today's Focus for the new day
    const focus = await resolveTodayFocus(getBindings());
    todayFocusThemeIds = focus.themeIds;
    todayFocusTags = focus.tags;

    if (todayFocusThemeIds.length > 0) {
      todayFocusActive = true;
      filterThemeIds = [...todayFocusThemeIds];
    } else {
      todayFocusActive = false;
      filterThemeIds = [];
    }

    if (todayFocusTags.length > 0) {
      tagFocusActive = true;
      filterTagIds = [...todayFocusTags];
    } else {
      tagFocusActive = false;
      filterTagIds = [];
    }

    // Show notification
    toastMessage = `Good morning — it's ${formatDateLong(currentDate)}`;

    saveNavigationContext();
  }

  // Derived single-theme ID for backward compat with child components (ThemeFilterBar, EisenKanView)
  let todayFocusThemeId = $derived(todayFocusThemeIds.length > 0 ? todayFocusThemeIds[0] : null);

  // Build breadcrumb path including view context
  let breadcrumbPath = $derived.by(() => {
    const parts: { id: string; label: string }[] = [];

    // Add view-level breadcrumb
    switch (currentView) {
      case 'okr':
        parts.push({ id: 'VIEW:okr', label: 'Long-term' });
        break;
      case 'calendar':
        parts.push({ id: 'VIEW:calendar', label: 'Mid-term' });
        break;
      case 'eisenkan':
        parts.push({ id: 'VIEW:eisenkan', label: 'Short-term' });
        break;
    }

    // Add filter context if present
    if (todayFocusActive && todayFocusThemeIds.length > 0) {
      parts.push({ id: 'FILTER:todayfocus', label: `Today's Focus: ${todayFocusThemeIds.join(', ')}` });
    } else if (filterThemeIds.length === 1) {
      parts.push({ id: `FILTER:theme:${filterThemeIds[0]}`, label: `Theme: ${filterThemeIds[0]}` });
    } else if (filterThemeIds.length > 1) {
      parts.push({ id: 'FILTER:themes', label: `Themes: ${filterThemeIds.join(', ')}` });
    }
    if (tagFocusActive && todayFocusTags.length > 0) {
      parts.push({ id: 'FILTER:tagfocus', label: `Today's Tags: ${todayFocusTags.join(', ')}` });
    } else if (filterTagIds.length > 0) {
      const displayTags = filterTagIds.map(t => t === UNTAGGED_SENTINEL ? 'Untagged' : t);
      parts.push({ id: 'FILTER:tags', label: `Tags: ${displayTags.join(', ')}` });
    }

    return parts;
  });

  // Navigation functions
  function navigateTo(view: ViewType, options?: { itemId?: string; themeId?: string; date?: string }) {
    currentView = view;
    currentItemId = options?.itemId ?? '';
    if (options?.themeId !== undefined) {
      filterThemeIds = options.themeId ? [options.themeId] : [];
    }

    // Save navigation context
    saveNavigationContext();
  }

  function navigateToCalendar(options?: { themeId?: string; date?: string }) {
    navigateTo('calendar', { themeId: options?.themeId, date: options?.date });
  }

  function navigateToOKR(options?: { itemId?: string }) {
    navigateTo('okr', options);
  }

  async function navigateToEisenKan(options?: { themeId?: string; date?: string }) {
    // Re-resolve today's focus in case the user just set it in Calendar
    const focus = await resolveTodayFocus(getBindings());
    todayFocusThemeIds = focus.themeIds;
    todayFocusTags = focus.tags;
    if (todayFocusThemeIds.length > 0 && options?.themeId === undefined) {
      todayFocusActive = true;
      filterThemeIds = [...todayFocusThemeIds];
    }
    if (todayFocusTags.length > 0) {
      tagFocusActive = true;
      filterTagIds = [...todayFocusTags];
    }
    navigateTo('eisenkan', options);
  }

  // Handle breadcrumb navigation
  function handleBreadcrumbNavigate(segmentId: string) {
    // Handle view-level navigation
    if (segmentId.startsWith('VIEW:')) {
      const view = segmentId.replace('VIEW:', '') as ViewType;
      navigateTo(view);
      return;
    }

    // Handle filter clearing
    if (segmentId.startsWith('FILTER:')) {
      // Clicking a filter clears subsequent filters but keeps the view
      return;
    }

    // Handle hierarchical ID navigation
    const type = getIdType(segmentId);
    if (type === 'theme' || type === 'okr' || type === 'kr') {
      navigateToOKR({ itemId: segmentId });
    } else if (type === 'task') {
      navigateToEisenKan();
    }
  }

  // Cross-view navigation handlers (exposed for child components)
  function handleNavigateToTheme(themeId: string) {
    navigateToOKR({ itemId: themeId });
  }

  // Theme filter handlers for ThemeFilterBar
  function handleFilterThemeToggle(themeId: string) {
    todayFocusActive = false;
    if (filterThemeIds.includes(themeId)) {
      filterThemeIds = filterThemeIds.filter(id => id !== themeId);
    } else {
      filterThemeIds = [...filterThemeIds, themeId];
    }
    saveNavigationContext();
  }

  function handleFilterThemeClear() {
    todayFocusActive = true;
    filterThemeIds = todayFocusThemeIds.length > 0 ? [...todayFocusThemeIds] : [];
    saveNavigationContext();
  }

  function handleTodayFocusToggle() {
    todayFocusActive = !todayFocusActive;
    if (todayFocusActive && todayFocusThemeIds.length > 0) {
      filterThemeIds = [...todayFocusThemeIds];
    } else {
      filterThemeIds = [];
    }
    saveNavigationContext();
  }

  // Tag filter handlers for TagFilterBar
  function handleFilterTagToggle(tag: string) {
    tagFocusActive = false;
    if (filterTagIds.includes(tag)) {
      filterTagIds = filterTagIds.filter(t => t !== tag);
    } else {
      filterTagIds = [...filterTagIds, tag];
    }
    saveNavigationContext();
  }

  function handleFilterTagClear() {
    tagFocusActive = true;
    filterTagIds = todayFocusTags.length > 0 ? [...todayFocusTags] : [];
    saveNavigationContext();
  }

  function handleTagFocusToggle() {
    tagFocusActive = !tagFocusActive;
    if (tagFocusActive && todayFocusTags.length > 0) {
      filterTagIds = [...todayFocusTags];
    } else {
      filterTagIds = [];
    }
    saveNavigationContext();
  }

  function handleNavigateToDay(date?: string, themeId?: string) {
    navigateToCalendar({ date, themeId });
  }

  function handleNavigateToTasks(options?: { themeId?: string; date?: string }) {
    navigateToEisenKan(options);
  }

  // Keyboard shortcuts handler
  function handleKeyDown(event: KeyboardEvent) {
    // Window management shortcuts (snap, maximize, fullscreen, center)
    if (handleWindowShortcut(event)) return;

    // Check for Ctrl (Windows/Linux) or Cmd (Mac) modifier
    const modKey = event.ctrlKey || event.metaKey;

    if (modKey) {
      switch (event.key) {
        case '1':
          event.preventDefault();
          navigateToOKR();
          break;
        case '2':
          event.preventDefault();
          navigateToCalendar();
          break;
        case '3':
          event.preventDefault();
          navigateToEisenKan();
          break;
      }
    }

  }

  // Save navigation context to backend
  async function saveNavigationContext() {
    try {
      const bindings = getBindings();
      if (bindings?.SaveNavigationContext) {
        const existing = await bindings.LoadNavigationContext?.() ?? {};
        await bindings.SaveNavigationContext({
          ...existing,
          currentView,
          currentItem: currentItemId,
          filterThemeId: filterThemeIds.length === 1 ? filterThemeIds[0] : '',
          filterThemeIds: filterThemeIds.length > 0 ? filterThemeIds : undefined,
          filterTagIds: filterTagIds.length > 0 ? filterTagIds : undefined,
          todayFocusActive: todayFocusActive || undefined,
          tagFocusActive: tagFocusActive || undefined,
          lastAccessed: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error('[App] Failed to save navigation context:', e);
    }
  }

  // Load navigation context from backend
  async function loadNavigationContext() {
    try {
      const bindings = getBindings();
      if (bindings?.LoadNavigationContext) {
        const ctx = await bindings.LoadNavigationContext();
        if (ctx && ctx.currentView) {
          const validViews: ViewType[] = ['calendar', 'eisenkan', 'okr'];
          currentView = validViews.includes(ctx.currentView as ViewType)
            ? (ctx.currentView as ViewType)
            : 'okr';
          currentItemId = ctx.currentItem ?? '';

          // Resolve today's focus (theme + tags)
          const focus = await resolveTodayFocus(bindings);
          todayFocusThemeIds = focus.themeIds;
          todayFocusTags = focus.tags;

          // Determine Today's Focus state (theme)
          if (ctx.todayFocusActive === false) {
            todayFocusActive = false;
            if (ctx.filterThemeIds && ctx.filterThemeIds.length > 0) {
              filterThemeIds = ctx.filterThemeIds;
            } else if (ctx.filterThemeId) {
              filterThemeIds = [ctx.filterThemeId];
            } else {
              filterThemeIds = [];
            }
          } else {
            todayFocusActive = true;
            filterThemeIds = todayFocusThemeIds.length > 0 ? [...todayFocusThemeIds] : [];
          }

          // Determine Today's Focus state (tags)
          if (ctx.tagFocusActive === false) {
            tagFocusActive = false;
            if (ctx.filterTagIds && ctx.filterTagIds.length > 0) {
              filterTagIds = ctx.filterTagIds;
            } else {
              filterTagIds = [];
            }
          } else {
            tagFocusActive = true;
            filterTagIds = todayFocusTags.length > 0 ? [...todayFocusTags] : [];
          }
        }
      }
    } catch (e) {
      console.error('[App] Failed to load navigation context:', e);
    }
  }

  // Resolve today's DayFocus from the calendar (theme IDs + tags)
  async function resolveTodayFocus(bindings: ReturnType<typeof getBindings>): Promise<{ themeIds: string[]; tags: string[] }> {
    try {
      if (!bindings?.GetYearFocus) return { themeIds: [], tags: [] };
      const today = new Date();
      const yearFocus = await bindings.GetYearFocus(today.getFullYear());
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const todayFocus = yearFocus.find((d: { date: string }) => d.date === todayStr);
      return {
        themeIds: todayFocus?.themeIds ?? [],
        tags: todayFocus?.tags ?? [],
      };
    } catch {
      // Non-critical: fall through to defaults
    }
    return { themeIds: [], tags: [] };
  }

  // Initialize locale from OS detection
  async function initializeLocale() {
    try {
      const locale = await getBindings().GetLocale();
      initLocale(locale);
    } catch {
      initLocale('en-US');
    }
  }

  // Install global error handlers to forward uncaught errors to the backend log
  function installGlobalErrorHandlers() {
    window.onerror = (message, source, lineno, colno) => {
      const loc = `${source}:${lineno}:${colno}`;
      console.error(`[error] ${String(message)} (${loc})`);
      getBindings().LogFrontend('error', String(message), loc);
    };
    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
      console.error(`[error] ${String(event.reason)} (unhandledrejection)`);
      getBindings().LogFrontend('error', String(event.reason), 'unhandledrejection');
    };
  }

  // Initialize mock bindings for browser-based testing
  onMount(() => {
    if (!isWailsRuntime()) {
      initMockBindings();
      console.log('[App] Running in browser mode with mock Wails bindings');
    }

    // Install global error handlers (fire-and-forget, no await)
    installGlobalErrorHandlers();

    // Initialize locale before views render
    initializeLocale();

    // Load saved navigation context
    loadNavigationContext();

    // Add keyboard shortcut listener
    window.addEventListener('keydown', handleKeyDown);

    // Start midnight day-change timer
    scheduleMidnightUpdate();
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
    clearTimeout(midnightTimer);
  });
</script>

<div class="app-container">
  <!-- Navigation Shell -->
  <nav class="navigation">
    <div class="nav-brand">Bearing</div>
    <div class="nav-links">
      <button
        class="nav-link"
        class:active={currentView === 'okr'}
        onclick={() => navigateToOKR()}
        title="Long-term (Ctrl+1 / Cmd+1)"
      >
        Long-term
      </button>
      <button
        class="nav-link"
        class:active={currentView === 'calendar'}
        onclick={() => navigateToCalendar()}
        title="Mid-term (Ctrl+2 / Cmd+2)"
      >
        Mid-term
      </button>
      <button
        class="nav-link"
        class:active={currentView === 'eisenkan'}
        onclick={() => navigateToEisenKan()}
        title="Short-term (Ctrl+3 / Cmd+3)"
      >
        Short-term
      </button>
    </div>
    <div class="nav-logo">
      <BearingLogo size={28} />
    </div>
  </nav>

  <!-- Breadcrumb Bar -->
  {#if breadcrumbPath.length > 0}
    <div class="breadcrumb-bar">
      <Breadcrumb
        itemId={currentItemId || ''}
        onNavigate={handleBreadcrumbNavigate}
      />
    </div>
  {/if}

  <!-- Main Content Area -->
  <main class="content">
    {#if currentView === 'calendar'}
      <CalendarView
        onNavigateToTheme={handleNavigateToTheme}
        onNavigateToTasks={handleNavigateToTasks}
        {filterThemeIds}
        {currentDate}
      />
    {:else if currentView === 'okr'}
      <div class="scrollable-view">
        <OKRView
          onNavigateToCalendar={handleNavigateToDay}
          onNavigateToTasks={handleNavigateToTasks}
          highlightItemId={currentItemId}
          bind:advisorMessages
          bind:advisorPanelOpen
        />
      </div>
    {:else if currentView === 'eisenkan'}
      <EisenKanView
        onNavigateToTheme={handleNavigateToTheme}
        {filterThemeIds}
        onFilterThemeToggle={handleFilterThemeToggle}
        onFilterThemeClear={handleFilterThemeClear}
        {filterTagIds}
        onFilterTagToggle={handleFilterTagToggle}
        onFilterTagClear={handleFilterTagClear}
        {todayFocusThemeId}
        {todayFocusActive}
        onTodayFocusToggle={handleTodayFocusToggle}
        {todayFocusTags}
        {tagFocusActive}
        onTagFocusToggle={handleTagFocusToggle}
        {currentDate}
      />
    {/if}
  </main>
</div>

{#if toastMessage}
  <Toast message={toastMessage} onDismiss={() => { toastMessage = null; }} />
{/if}

<style>
  .app-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .navigation {
    display: flex;
    align-items: center;
    padding: 0 1rem;
    height: 48px;
    background-color: var(--color-primary-600);
    color: white;
  }

  .nav-brand {
    font-size: 1.25rem;
    font-weight: 600;
    margin-right: 2rem;
  }

  .nav-links {
    display: flex;
    gap: 0.5rem;
  }

  .nav-logo {
    margin-left: auto;
    display: flex;
    align-items: center;
  }

  .nav-link {
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.9rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.2s, color 0.2s;
  }

  .nav-link:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .nav-link.active {
    background-color: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .scrollable-view {
    flex: 1;
    overflow-y: auto;
  }

  /* Breadcrumb bar */
  .breadcrumb-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    background-color: var(--color-gray-50);
    border-bottom: 1px solid var(--color-gray-200);
    min-height: 36px;
  }

</style>
