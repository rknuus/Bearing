<script lang="ts">
  /**
   * Component Demo Page
   *
   * Demonstrates the Breadcrumb, ThemeBadge, and color propagation components.
   */

  import Breadcrumb from './Breadcrumb.svelte';
  import ThemeBadge from './ThemeBadge.svelte';
  import ThemedContainer from './ThemedContainer.svelte';

  // Demo theme colors
  const themes = [
    { id: 'HF', name: 'Health & Fitness', color: '#10b981' },
    { id: 'CG', name: 'Career Growth', color: '#3b82f6' },
    { id: 'PF', name: 'Personal Finance', color: '#f59e0b' },
    { id: 'L', name: 'Learning', color: '#8b5cf6' },
  ];

  // Demo items using theme-scoped IDs
  const demoItems = [
    { id: 'HF', label: 'Theme only' },
    { id: 'HF-O1', label: 'Objective' },
    { id: 'HF-KR1', label: 'Key Result' },
    { id: 'HF-T1', label: 'Task' },
  ];

  let selectedItem = $state('HF-KR1');
  let navigationLog = $state<string[]>([]);

  function handleNavigate(segmentId: string) {
    navigationLog = [...navigationLog, `Navigated to: ${segmentId}`];
    selectedItem = segmentId;
  }

  function clearLog() {
    navigationLog = [];
  }
</script>

<div class="demo-container">
  <h1>Linking Components Demo</h1>
  <p class="demo-description">
    Interactive demonstration of the Breadcrumb, ThemeBadge, and color propagation components.
  </p>

  <!-- ThemeBadge Section -->
  <section class="demo-section">
    <h2>ThemeBadge Component</h2>
    <p>Displays a colored circle representing a theme's color.</p>

    <div class="demo-card">
      <h3>Size Variants</h3>
      <div class="badge-row">
        <div class="badge-item">
          <ThemeBadge color="#3b82f6" size="sm" />
          <span>Small (12px)</span>
        </div>
        <div class="badge-item">
          <ThemeBadge color="#3b82f6" size="md" />
          <span>Medium (16px)</span>
        </div>
        <div class="badge-item">
          <ThemeBadge color="#3b82f6" size="lg" />
          <span>Large (24px)</span>
        </div>
      </div>
    </div>

    <div class="demo-card">
      <h3>Theme Colors</h3>
      <div class="badge-row">
        {#each themes as theme (theme.id)}
          <div class="badge-item">
            <ThemeBadge color={theme.color} size="lg" label={theme.name} />
            <span>{theme.name}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Breadcrumb Section -->
  <section class="demo-section">
    <h2>Breadcrumb Component</h2>
    <p>Renders a navigable path based on hierarchical IDs.</p>

    <div class="demo-card">
      <h3>Different Hierarchy Depths</h3>
      {#each demoItems as item (item.id)}
        <div class="breadcrumb-demo-row">
          <span class="breadcrumb-label">{item.label}:</span>
          <Breadcrumb itemId={item.id} onNavigate={handleNavigate} />
        </div>
      {/each}
    </div>

    <div class="demo-card">
      <h3>Interactive Navigation</h3>
      <p class="hint">Click on breadcrumb segments to navigate. The current segment is not clickable.</p>
      <div class="interactive-breadcrumb">
        <Breadcrumb itemId={selectedItem} onNavigate={handleNavigate} />
      </div>

      <div class="input-group">
        <label for="item-id">Current Item ID:</label>
        <input
          id="item-id"
          type="text"
          bind:value={selectedItem}
          placeholder="e.g., HF-KR3"
        />
      </div>

      {#if navigationLog.length > 0}
        <div class="navigation-log">
          <div class="log-header">
            <h4>Navigation Log</h4>
            <button type="button" onclick={clearLog}>Clear</button>
          </div>
          <ul>
            {#each navigationLog as entry, i (i)}
              <li>{entry}</li>
            {/each}
          </ul>
        </div>
      {/if}
    </div>
  </section>

  <!-- Color Propagation Section -->
  <section class="demo-section">
    <h2>Color Propagation</h2>
    <p>ThemedContainer sets --theme-color, which propagates to child components.</p>

    <div class="demo-card">
      <h3>Themed Cards</h3>
      <div class="themed-cards-grid">
        {#each themes as theme (theme.id)}
          <ThemedContainer color={theme.color}>
            <div class="task-card">
              <div class="task-header">
                <ThemeBadge color={theme.color} size="sm" />
                <span class="task-title">{theme.name}</span>
              </div>
              <p class="task-description">
                This card's left border uses var(--theme-color) set by the container.
              </p>
              <div class="progress-bar">
                <div class="progress-bar-fill" style="width: {Math.random() * 100}%;"></div>
              </div>
            </div>
          </ThemedContainer>
        {/each}
      </div>
    </div>

    <div class="demo-card">
      <h3>Day Cells</h3>
      <p class="hint">Hover over cells to see the theme color intensify.</p>
      <div class="day-cells-demo">
        {#each themes as theme (theme.id)}
          <ThemedContainer color={theme.color}>
            <div class="day-cells-row">
              <span class="theme-name">{theme.name}:</span>
              <div class="day-cell">Mon</div>
              <div class="day-cell">Tue</div>
              <div class="day-cell">Wed</div>
              <div class="day-cell">Thu</div>
              <div class="day-cell">Fri</div>
            </div>
          </ThemedContainer>
        {/each}
      </div>
    </div>
  </section>
</div>

<style>
  .demo-container {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
    color: #1f2937;
  }

  h2 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
    color: #374151;
  }

  h3 {
    font-size: 1.1rem;
    margin-bottom: 1rem;
    color: #4b5563;
  }

  .demo-description {
    color: #6b7280;
    margin-bottom: 2rem;
  }

  .demo-section {
    margin-bottom: 3rem;
  }

  .demo-section > p {
    color: #6b7280;
    margin-bottom: 1rem;
  }

  .demo-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .hint {
    font-size: 0.875rem;
    color: #9ca3af;
    margin-bottom: 1rem;
  }

  /* ThemeBadge demo styles */
  .badge-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
  }

  .badge-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .badge-item span {
    font-size: 0.875rem;
    color: #6b7280;
  }

  /* Breadcrumb demo styles */
  .breadcrumb-demo-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid #f3f4f6;
  }

  .breadcrumb-demo-row:last-child {
    border-bottom: none;
  }

  .breadcrumb-label {
    font-size: 0.875rem;
    color: #9ca3af;
    min-width: 140px;
  }

  .interactive-breadcrumb {
    padding: 1rem;
    background: #f9fafb;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .input-group label {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .input-group input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: monospace;
  }

  .input-group input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  .navigation-log {
    background: #f9fafb;
    border-radius: 4px;
    padding: 1rem;
    font-size: 0.875rem;
  }

  .log-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .log-header h4 {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  .log-header button {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: #e5e7eb;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .log-header button:hover {
    background: #d1d5db;
  }

  .navigation-log ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .navigation-log li {
    padding: 0.25rem 0;
    color: #4b5563;
    font-family: monospace;
  }

  /* Color propagation demo styles */
  .themed-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .task-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .task-title {
    font-weight: 500;
    color: #374151;
  }

  .task-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 0.75rem;
  }

  .day-cells-demo {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .day-cells-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .theme-name {
    font-size: 0.875rem;
    color: #6b7280;
    min-width: 120px;
  }
</style>
