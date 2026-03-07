<script lang="ts">
  /**
   * EditTaskDialog Component
   *
   * A modal dialog for editing task properties: title, theme, description,
   * tags, and promotion date. Uses shared TaskFormFields component.
   */

  import type { Task, LifeTheme } from '../lib/wails-mock';
  import TaskFormFields from './TaskFormFields.svelte';
  import { Dialog, Button, ErrorBanner, TagEditor } from '../lib/components';
  import { extractError } from '../lib/utils/bindings';

  interface Props {
    task: Task | null;
    themes: LifeTheme[];
    availableTags?: string[];
    onSave: (updatedTask: Task) => Promise<void>;
    onCancel: () => void;
  }

  let { task, themes, availableTags = [], onSave, onCancel }: Props = $props();

  // Form state
  let editTitle = $state('');
  let editThemeId = $state('');
  let editDescription = $state('');
  let editTags = $state<string[]>([]);
  let editPromotionDate = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state('');

  // Populate form when task changes
  $effect(() => {
    if (task) {
      editTitle = task.title;
      editThemeId = task.themeId;
      editDescription = task.description ?? '';
      editTags = [...(task.tags ?? [])];
      editPromotionDate = task.promotionDate ?? '';
      errorMessage = '';
    }
  });

  async function handleSave() {
    if (!task || !editTitle.trim()) return;

    isSubmitting = true;
    errorMessage = '';

    try {
      const updatedTask: Task = {
        ...task,
        title: editTitle.trim(),
        themeId: editThemeId,
        description: editDescription.trim() || undefined,
        priority: task.priority,
        tags: editTags,
        promotionDate: editPromotionDate || undefined,
      };
      await onSave(updatedTask);
    } catch (e) {
      errorMessage = extractError(e);
    } finally {
      isSubmitting = false;
    }
  }

</script>

{#if task}
  <Dialog title="Edit Task" id="edit-dialog-title" onclose={onCancel}>
    {#if errorMessage}
      <ErrorBanner message={errorMessage} dismissable={false} />
    {/if}

    <TaskFormFields
      bind:title={editTitle}
      bind:themeId={editThemeId}
      bind:description={editDescription}
      bind:promotionDate={editPromotionDate}
      {themes}
      idPrefix="edit-task"
    />
    <div class="form-group">
      <label for="edit-task-tags">Tags</label>
      <TagEditor
        tags={editTags}
        {availableTags}
        onTagsChange={(t) => { editTags = t; }}
      />
    </div>

    {#snippet actions()}
      <Button variant="secondary" onclick={onCancel}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onclick={handleSave}
        disabled={isSubmitting || !editTitle.trim()}
      >
        {isSubmitting ? 'Saving...' : 'Save'}
      </Button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
    margin-bottom: 0.375rem;
  }
</style>

