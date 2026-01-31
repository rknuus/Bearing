<script lang="ts">
  import { onMount } from 'svelte';
  import { initMockBindings, isWailsRuntime } from './lib/wails-mock';

  // Current view state using Svelte 5 runes
  let currentView = $state<'home' | 'plans'>('home');

  // Initialize mock bindings for browser-based testing
  onMount(() => {
    if (!isWailsRuntime()) {
      initMockBindings();
      console.log('[App] Running in browser mode with mock Wails bindings');
    }
  });

  function navigateToPlans() {
    currentView = 'plans';
  }

  function navigateToHome() {
    currentView = 'home';
  }
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
      >
        Home
      </button>
      <button
        class="nav-link"
        class:active={currentView === 'plans'}
        onclick={navigateToPlans}
      >
        Plans
      </button>
    </div>
  </nav>

  <!-- Main Content Area -->
  <main class="content">
    {#if currentView === 'home'}
      <div class="placeholder-view">
        <h1>Welcome to Bearing</h1>
        <p>Your personal planning system for interlinked long-, medium, and short-term planning.</p>
      </div>
    {:else if currentView === 'plans'}
      <div class="placeholder-view">
        <h1>Plans</h1>
        <p>Plan management coming soon...</p>
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
</style>
