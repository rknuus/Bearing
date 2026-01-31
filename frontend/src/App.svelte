<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { initMockBindings, isWailsRuntime, mockAppBindings } from './lib/wails-mock';
  import ComponentDemo from './lib/components/ComponentDemo.svelte';
  import CalendarView from './views/CalendarView.svelte';
  import EisenKanView from './views/EisenKanView.svelte';
  import OKRView from './views/OKRView.svelte';
  import Breadcrumb from './lib/components/Breadcrumb.svelte';
  import { getIdType } from './lib/utils/id-parser';

  // View types
  type ViewType = 'home' | 'calendar' | 'eisenkan' | 'okr' | 'components';

  // Navigation context for cross-view linking
  interface NavigationContext {
    currentView: ViewType;
    currentItemId: string;
    filterThemeId?: string;
    filterDate?: string;
  }

  // Current view state using Svelte 5 runes
  let currentView = $state<ViewType>('home');
  let currentItemId = $state<string>('');
  let filterThemeId = $state<string | undefined>(undefined);
  let filterDate = $state<string | undefined>(undefined);

  // For breadcrumb display
  let breadcrumbId = $derived.by(() => {
    if (currentItemId) return currentItemId;
    // Generate a synthetic breadcrumb based on current view
    switch (currentView) {
      case 'okr': return 'OKRs';
      case 'calendar': return 'Calendar';
      case 'eisenkan': return 'Tasks';
      default: return '';
    }
  });

  // Build breadcrumb path including view context
  let breadcrumbPath = $derived.by(() => {
    const parts: { id: string; label: string }[] = [];

    // Add view-level breadcrumb
    switch (currentView) {
      case 'okr':
        parts.push({ id: 'VIEW:okr', label: 'OKRs' });
        break;
      case 'calendar':
        parts.push({ id: 'VIEW:calendar', label: 'Calendar' });
        break;
      case 'eisenkan':
        parts.push({ id: 'VIEW:eisenkan', label: 'Tasks' });
        break;
    }

    // Add filter context if present
    if (filterThemeId) {
      parts.push({ id: `FILTER:theme:${filterThemeId}`, label: `Theme: ${filterThemeId}` });
    }
    if (filterDate) {
      parts.push({ id: `FILTER:date:${filterDate}`, label: filterDate });
    }

    return parts;
  });

  // Navigation functions
  function navigateTo(view: ViewType, options?: { itemId?: string; themeId?: string; date?: string }) {
    currentView = view;
    currentItemId = options?.itemId ?? '';
    filterThemeId = options?.themeId;
    filterDate = options?.date;

    // Save navigation context
    saveNavigationContext();
  }

  function navigateToHome() {
    navigateTo('home');
  }

  function navigateToCalendar(options?: { themeId?: string; date?: string }) {
    navigateTo('calendar', { themeId: options?.themeId, date: options?.date });
  }

  function navigateToOKR(options?: { itemId?: string }) {
    navigateTo('okr', options);
  }

  function navigateToEisenKan(options?: { themeId?: string; date?: string }) {
    navigateTo('eisenkan', options);
  }

  function navigateToComponents() {
    navigateTo('components');
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

  function handleNavigateToDay(date?: string, themeId?: string) {
    navigateToCalendar({ date, themeId });
  }

  function handleNavigateToTasks(options?: { themeId?: string; date?: string }) {
    navigateToEisenKan(options);
  }

  // Navigate up one breadcrumb level
  function navigateUp() {
    if (filterDate) {
      filterDate = undefined;
      saveNavigationContext();
      return;
    }
    if (filterThemeId) {
      filterThemeId = undefined;
      saveNavigationContext();
      return;
    }
    if (currentItemId) {
      currentItemId = '';
      saveNavigationContext();
      return;
    }
    // Navigate to home if at top level
    navigateToHome();
  }

  // Keyboard shortcuts handler
  function handleKeyDown(event: KeyboardEvent) {
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

    // Backspace to navigate up (when not in an input field)
    if (event.key === 'Backspace') {
      const target = event.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' ||
                          target.tagName === 'TEXTAREA' ||
                          target.isContentEditable;
      if (!isInputField) {
        event.preventDefault();
        navigateUp();
      }
    }
  }

  // Save navigation context to backend
  async function saveNavigationContext() {
    try {
      const bindings = getBindings();
      if (bindings?.SaveNavigationContext) {
        await bindings.SaveNavigationContext({
          currentView,
          currentItem: currentItemId,
          filterThemeId: filterThemeId ?? '',
          filterDate: filterDate ?? '',
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
          currentView = ctx.currentView as ViewType;
          currentItemId = ctx.currentItem ?? '';
          filterThemeId = ctx.filterThemeId || undefined;
          filterDate = ctx.filterDate || undefined;
        }
      }
    } catch (e) {
      console.error('[App] Failed to load navigation context:', e);
    }
  }

  // Get Wails bindings
  function getBindings() {
    return (window as any).go?.main?.App ?? mockAppBindings;
  }

  // Initialize mock bindings for browser-based testing
  onMount(() => {
    if (!isWailsRuntime()) {
      initMockBindings();
      console.log('[App] Running in browser mode with mock Wails bindings');
    }

    // Load saved navigation context
    loadNavigationContext();

    // Add keyboard shortcut listener
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
</script>

<div class="app-container">
  <!-- Navigation Shell -->
  <nav class="navigation">
    <div class="nav-brand">Bearing</div>
    <div class="nav-links">
      <button
        class="nav-link"
        class:active={currentView === 'home'}
        onclick={navigateToHome}
        title="Home"
      >
        Home
      </button>
      <button
        class="nav-link"
        class:active={currentView === 'okr'}
        onclick={() => navigateToOKR()}
        title="OKRs (Ctrl+1 / Cmd+1)"
      >
        OKRs
      </button>
      <button
        class="nav-link"
        class:active={currentView === 'calendar'}
        onclick={() => navigateToCalendar()}
        title="Calendar (Ctrl+2 / Cmd+2)"
      >
        Calendar
      </button>
      <button
        class="nav-link"
        class:active={currentView === 'eisenkan'}
        onclick={() => navigateToEisenKan()}
        title="Tasks (Ctrl+3 / Cmd+3)"
      >
        Tasks
      </button>
      <button
        class="nav-link"
        class:active={currentView === 'components'}
        onclick={navigateToComponents}
        title="Components"
      >
        Components
      </button>
    </div>
  </nav>

  <!-- Breadcrumb Bar -->
  {#if currentView !== 'home' && breadcrumbPath.length > 0}
    <div class="breadcrumb-bar">
      <Breadcrumb
        itemId={currentItemId || ''}
        onNavigate={handleBreadcrumbNavigate}
      />
      {#if filterThemeId || filterDate || currentItemId}
        <button class="clear-filters-btn" onclick={navigateUp} title="Clear filters (Backspace)">
          Clear
        </button>
      {/if}
    </div>
  {/if}

  <!-- Main Content Area -->
  <main class="content">
    {#if currentView === 'home'}
      <div class="placeholder-view">
        <h1>Welcome to Bearing</h1>
        <p>Your personal planning system for interlinked long-, medium, and short-term planning.</p>
        <div class="quick-nav">
          <button class="quick-nav-btn" onclick={() => navigateToOKR()}>
            <span class="quick-nav-icon">OKR</span>
            <span class="quick-nav-label">OKRs & Themes</span>
            <span class="quick-nav-shortcut">Ctrl+1</span>
          </button>
          <button class="quick-nav-btn" onclick={() => navigateToCalendar()}>
            <span class="quick-nav-icon">CAL</span>
            <span class="quick-nav-label">Calendar</span>
            <span class="quick-nav-shortcut">Ctrl+2</span>
          </button>
          <button class="quick-nav-btn" onclick={() => navigateToEisenKan()}>
            <span class="quick-nav-icon">TSK</span>
            <span class="quick-nav-label">Tasks</span>
            <span class="quick-nav-shortcut">Ctrl+3</span>
          </button>
        </div>
      </div>
    {:else if currentView === 'calendar'}
      <CalendarView
        onNavigateToTheme={handleNavigateToTheme}
        onNavigateToTasks={handleNavigateToTasks}
        {filterThemeId}
      />
    {:else if currentView === 'okr'}
      <div class="scrollable-view">
        <OKRView
          onNavigateToCalendar={handleNavigateToDay}
          onNavigateToTasks={handleNavigateToTasks}
          highlightItemId={currentItemId}
        />
      </div>
    {:else if currentView === 'eisenkan'}
      <EisenKanView
        onNavigateToTheme={handleNavigateToTheme}
        onNavigateToDay={handleNavigateToDay}
        {filterThemeId}
        {filterDate}
      />
    {:else if currentView === 'components'}
      <div class="scrollable-view">
        <ComponentDemo />
      </div>
    {/if}
  </main>
</div>

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
    background-color: #2563eb;
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

  .placeholder-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2rem;
  }

  .placeholder-view h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
    color: #1f2937;
  }

  .placeholder-view p {
    font-size: 1.1rem;
    color: #6b7280;
    max-width: 500px;
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
    background-color: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    min-height: 36px;
  }

  .clear-filters-btn {
    padding: 0.25rem 0.75rem;
    background-color: #e5e7eb;
    border: none;
    border-radius: 4px;
    font-size: 0.75rem;
    color: #6b7280;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .clear-filters-btn:hover {
    background-color: #d1d5db;
  }

  /* Quick navigation on home page */
  .quick-nav {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
  }

  .quick-nav-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem 2rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 140px;
  }

  .quick-nav-btn:hover {
    border-color: #2563eb;
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.15);
    transform: translateY(-2px);
  }

  .quick-nav-icon {
    font-size: 1.5rem;
    font-weight: 700;
    color: #2563eb;
    margin-bottom: 0.5rem;
  }

  .quick-nav-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.25rem;
  }

  .quick-nav-shortcut {
    font-size: 0.7rem;
    color: #9ca3af;
    font-family: monospace;
  }
</style>
