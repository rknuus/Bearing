<script lang="ts">
  /**
   * SuggestionCard Component
   *
   * Renders a single structured suggestion from the advisor with Accept/Decline
   * actions. Tracks its own lifecycle state (default, accepting, applied, declined, error).
   */

  import MarkdownContent from '../lib/components/MarkdownContent.svelte';

  interface ThemeData {
    id?: string;
    name: string;
    color?: string;
  }

  interface ObjectiveData {
    id?: string;
    title: string;
    parentId?: string;
  }

  interface KeyResultData {
    id?: string;
    description: string;
    startValue: number;
    currentValue: number;
    targetValue: number;
    parentObjectiveId?: string;
  }

  interface RoutineData {
    id?: string;
    description: string;
    targetValue: number;
    targetType: string;
    unit?: string;
    themeId?: string;
  }

  export interface Suggestion {
    type: string;
    action: string;
    themeData?: ThemeData;
    objectiveData?: ObjectiveData;
    keyResultData?: KeyResultData;
    routineData?: RoutineData;
  }

  type CardStatus = 'default' | 'accepting' | 'applied' | 'declined' | 'error';

  interface Props {
    suggestion: Suggestion;
    onAccept: (suggestion: Suggestion) => Promise<void>;
    onDecline: (suggestion: Suggestion) => void;
    selectedOKRIds?: string[];
  }

  let { suggestion, onAccept, onDecline, selectedOKRIds }: Props = $props();

  let status: CardStatus = $state('default');
  let errorText = $state('');
  let parentIdInput = $state('');

  const typeLabels: Record<string, string> = {
    theme: 'Theme',
    objective: 'Objective',
    key_result: 'Key Result',
    routine: 'Routine',
  };

  const typeColors: Record<string, string> = {
    theme: 'var(--color-primary-600)',
    objective: 'var(--color-primary-500)',
    key_result: 'var(--color-gray-600)',
    routine: 'var(--color-gray-500)',
  };

  let typeLabel = $derived(typeLabels[suggestion.type] ?? suggestion.type);
  let typeColor = $derived(typeColors[suggestion.type] ?? 'var(--color-gray-500)');
  let actionLabel = $derived(suggestion.action === 'create' ? 'New' : 'Edit');

  /** Whether the suggestion requires a parent that is not yet provided. */
  let needsParent = $derived.by(() => {
    if (suggestion.action === 'edit') return false;

    if (suggestion.type === 'objective') {
      return !suggestion.objectiveData?.parentId;
    }
    if (suggestion.type === 'key_result') {
      return !suggestion.keyResultData?.parentObjectiveId;
    }
    if (suggestion.type === 'routine') {
      return !suggestion.routineData?.themeId;
    }
    return false;
  });

  /** Resolved parent ID: from suggestion data, selectedOKRIds, or manual input. */
  let resolvedParentId = $derived.by(() => {
    if (!needsParent) return '';

    // Use first selected OKR ID if available
    if (selectedOKRIds && selectedOKRIds.length > 0) {
      return selectedOKRIds[0];
    }

    return parentIdInput.trim();
  });

  /** Whether Accept is currently allowed. */
  let canAccept = $derived(
    status === 'default' && (!needsParent || resolvedParentId !== '')
  );

  /** Build an enriched suggestion with resolved parent before accepting. */
  function buildEnrichedSuggestion(): Suggestion {
    if (!needsParent || !resolvedParentId) return suggestion;

    const enriched = { ...suggestion };
    if (suggestion.type === 'objective' && suggestion.objectiveData) {
      enriched.objectiveData = { ...suggestion.objectiveData, parentId: resolvedParentId };
    } else if (suggestion.type === 'key_result' && suggestion.keyResultData) {
      enriched.keyResultData = { ...suggestion.keyResultData, parentObjectiveId: resolvedParentId };
    } else if (suggestion.type === 'routine' && suggestion.routineData) {
      enriched.routineData = { ...suggestion.routineData, themeId: resolvedParentId };
    }
    return enriched;
  }

  async function handleAccept() {
    if (!canAccept) return;
    status = 'accepting';
    errorText = '';

    try {
      const enriched = buildEnrichedSuggestion();
      await onAccept(enriched);
      status = 'applied';
    } catch (e) {
      errorText = e instanceof Error ? e.message : String(e);
      status = 'error';
    }
  }

  function handleDecline() {
    status = 'declined';
    onDecline(suggestion);
  }

  function handleRetry() {
    status = 'default';
    errorText = '';
  }

  function formatTargetType(tt: string): string {
    if (tt === 'at-or-above' || tt === 'at_least') return 'at least';
    if (tt === 'at-or-below' || tt === 'at_most') return 'at most';
    return tt;
  }
</script>

<div
  class="suggestion-card"
  class:card-applied={status === 'applied'}
  class:card-declined={status === 'declined'}
  class:card-error={status === 'error'}
>
  <div class="card-badges">
    <span class="badge type-badge" style="background-color: {typeColor}">{typeLabel}</span>
    <span class="badge action-badge" class:action-new={suggestion.action === 'create'} class:action-edit={suggestion.action === 'edit'}>
      {actionLabel}
    </span>
    {#if status === 'applied'}
      <span class="status-label applied-label">Applied</span>
    {:else if status === 'declined'}
      <span class="status-label declined-label">Declined</span>
    {/if}
  </div>

  <div class="card-content" class:content-declined={status === 'declined'}>
    {#if suggestion.type === 'theme' && suggestion.themeData}
      <div class="content-row">
        {#if suggestion.themeData.color}
          <span class="color-swatch" style="background-color: {suggestion.themeData.color}"></span>
        {/if}
        <MarkdownContent content={suggestion.themeData.name} restricted={true} />
      </div>
    {:else if suggestion.type === 'objective' && suggestion.objectiveData}
      <MarkdownContent content={suggestion.objectiveData.title} restricted={true} />
    {:else if suggestion.type === 'key_result' && suggestion.keyResultData}
      <MarkdownContent content={suggestion.keyResultData.description} restricted={true} />
      <div class="kr-values">
        {suggestion.keyResultData.startValue} &rarr; {suggestion.keyResultData.targetValue}
      </div>
    {:else if suggestion.type === 'routine' && suggestion.routineData}
      <MarkdownContent content={suggestion.routineData.description} restricted={true} />
      <div class="routine-values">
        {formatTargetType(suggestion.routineData.targetType)} {suggestion.routineData.targetValue}{#if suggestion.routineData.unit}&nbsp;{suggestion.routineData.unit}{/if}
      </div>
    {/if}
  </div>

  {#if needsParent && !resolvedParentId && status === 'default'}
    <div class="parent-picker">
      <label class="parent-label">
        Parent ID:
        <input
          type="text"
          class="parent-input"
          placeholder="e.g. H or H-O1"
          bind:value={parentIdInput}
        />
      </label>
    </div>
  {/if}

  {#if status === 'error'}
    <div class="error-row">{errorText}</div>
  {/if}

  {#if status === 'default' || status === 'error'}
    <div class="card-actions">
      {#if status === 'error'}
        <button type="button" class="btn btn-accept" onclick={handleRetry}>Retry</button>
      {:else}
        <button type="button" class="btn btn-accept" onclick={handleAccept} disabled={!canAccept}>Accept</button>
      {/if}
      <button type="button" class="btn btn-decline" onclick={handleDecline}>Decline</button>
    </div>
  {:else if status === 'accepting'}
    <div class="card-actions">
      <span class="spinner"></span>
      <button type="button" class="btn btn-accept" disabled>Accepting...</button>
      <button type="button" class="btn btn-decline" disabled>Decline</button>
    </div>
  {/if}
</div>

<style>
  .suggestion-card {
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-md);
    background-color: var(--color-gray-100);
    padding: var(--space-3);
    margin-top: var(--space-2);
  }

  .card-applied {
    background-color: var(--color-primary-50);
    border-color: var(--color-primary-200);
  }

  .card-declined {
    opacity: 0.5;
  }

  .card-error {
    background-color: var(--color-error-50);
    border-color: var(--color-error-200);
  }

  .card-badges {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .badge {
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    color: white;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .type-badge {
    line-height: 1.3;
  }

  .action-new {
    background-color: var(--color-primary-400);
  }

  .action-edit {
    background-color: var(--color-gray-400);
  }

  .status-label {
    font-size: 0.6875rem;
    font-weight: 600;
    margin-left: auto;
  }

  .applied-label {
    color: var(--color-primary-600);
  }

  .declined-label {
    color: var(--color-gray-400);
  }

  .card-content {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--color-gray-700);
  }

  .content-declined {
    text-decoration: line-through;
  }

  .content-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .color-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .kr-values,
  .routine-values {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    margin-top: var(--space-1);
  }

  .parent-picker {
    margin-top: var(--space-2);
  }

  .parent-label {
    font-size: 0.75rem;
    color: var(--color-gray-500);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .parent-input {
    font-size: 0.75rem;
    padding: 2px 6px;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-sm);
    font-family: inherit;
    width: 100px;
  }

  .parent-input:focus {
    border-color: var(--color-primary-500);
    outline: none;
  }

  .error-row {
    font-size: 0.75rem;
    color: var(--color-error-600);
    margin-top: var(--space-2);
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .btn {
    font-size: 0.75rem;
    font-weight: 500;
    font-family: inherit;
    padding: 3px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    border: 1px solid transparent;
    transition: background-color 0.15s, color 0.15s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-accept {
    background-color: var(--color-primary-600);
    color: white;
  }

  .btn-accept:hover:not(:disabled) {
    background-color: var(--color-primary-700);
  }

  .btn-decline {
    background-color: transparent;
    color: var(--color-gray-500);
    border-color: var(--color-gray-300);
  }

  .btn-decline:hover:not(:disabled) {
    background-color: var(--color-gray-100);
    color: var(--color-gray-700);
  }

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-gray-300);
    border-top-color: var(--color-primary-600);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
