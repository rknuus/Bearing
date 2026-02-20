<script lang="ts">
  /**
   * EditTaskDialog Component
   *
   * A modal dialog for editing task properties: title, theme, description,
   * tags, due date, and promotion date. Uses shared TaskFormFields component.
   */

  import type { Task, LifeTheme } from '../lib/wails-mock';
  import TaskFormFields from './TaskFormFields.svelte';
  import { Dialog, Button, ErrorBanner } from '../lib/components';

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
  let editTags = $state('');
  let editDueDate = $state('');
  let editPromotionDate = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state('');

  // Populate form when task changes
  $effect(() => {
    if (task) {
      editTitle = task.title;
      editThemeId = task.themeId;
      editDescription = task.description ?? '';
      editTags = (task.tags ?? []).join(', ');
      editDueDate = task.dueDate ?? '';
      editPromotionDate = task.promotionDate ?? '';
      errorMessage = '';
    }
  });

  function parseTags(input: string): string[] {
    return input
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }

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
        tags: parseTags(editTags),
        dueDate: editDueDate || undefined,
        promotionDate: editPromotionDate || undefined,
      };
      await onSave(updatedTask);
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : 'Failed to save task';
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
      bind:tags={editTags}
      bind:dueDate={editDueDate}
      bind:promotionDate={editPromotionDate}
      {themes}
      {availableTags}
      idPrefix="edit-task"
    />

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

