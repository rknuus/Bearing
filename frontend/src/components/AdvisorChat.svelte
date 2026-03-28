<script lang="ts">
  /**
   * AdvisorChat Component
   *
   * A standalone chat UI for the goal advisor. Manages its own conversation
   * state and is designed to be hosted by OKR View.
   *
   * Receives a callback for requesting advice — does NOT call Wails bindings directly.
   * Frontend owns conversation history: passes full history array to onRequestAdvice.
   */

  import { tick, untrack } from 'svelte';
  import MarkdownContent from '../lib/components/MarkdownContent.svelte';
  import SuggestionCard from './SuggestionCard.svelte';
  import type { Suggestion } from './SuggestionCard.svelte';

  interface ChatMessage {
    role: 'user' | 'advisor';
    content: string;
    timestamp: number;
    error?: string;
    suggestions?: Suggestion[];
  }

  interface ModelInfo {
    name: string;
    provider: string;
    type: string;
    available: boolean;
    reason: string;
  }

  interface AdviceResponse {
    text: string;
    suggestions?: Suggestion[];
  }

  interface Props {
    onRequestAdvice: (message: string, history: ChatMessage[], selectedIds?: string[]) => Promise<AdviceResponse>;
    /** Fire-and-forget send — parent owns the async lifecycle. When set, onRequestAdvice is unused. */
    onSendMessage?: (message: string, selectedIds?: string[]) => void;
    onAcceptSuggestion?: (suggestion: Suggestion) => Promise<void>;
    available: boolean;
    models: ModelInfo[];
    selectedOKRIds?: string[];
    onRecheck?: () => void;
    messages?: ChatMessage[];
    busy?: boolean;
  }

  let { onRequestAdvice, onSendMessage, onAcceptSuggestion, available, models: _models, selectedOKRIds, onRecheck, messages = $bindable([]), busy = $bindable(false) }: Props = $props();
  let inputText = $state('');
  let messagesEndEl: HTMLDivElement | undefined = $state(undefined);

  function scrollToBottom() {
    tick().then(() => {
      if (messagesEndEl && typeof messagesEndEl.scrollIntoView === 'function') {
        messagesEndEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  async function handleSend() {
    const text = inputText.trim();
    if (!text || busy) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    messages = [...messages, userMessage];
    inputText = '';
    busy = true;
    scrollToBottom();

    if (onSendMessage) {
      // Fire-and-forget — parent manages async lifecycle, so the request
      // survives this component being unmounted on view switch.
      onSendMessage(text, selectedOKRIds);
      return;
    }

    // Fallback: manage async locally (used by tests without onSendMessage)
    try {
      const currentHistory = untrack(() => [...messages]);
      const response = await onRequestAdvice(text, currentHistory, selectedOKRIds);

      const advisorMessage: ChatMessage = {
        role: 'advisor',
        content: response.text,
        timestamp: Date.now(),
        suggestions: response.suggestions,
      };
      messages = [...untrack(() => messages), advisorMessage];
    } catch (e) {
      const errorMessage: ChatMessage = {
        role: 'advisor',
        content: '',
        timestamp: Date.now(),
        error: e instanceof Error ? e.message : String(e),
      };
      messages = [...untrack(() => messages), errorMessage];
    } finally {
      busy = false;
      scrollToBottom();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  function handleNewConversation() {
    messages = [];
    inputText = '';
    busy = false;
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function handleAcceptSuggestion(suggestion: Suggestion): Promise<void> {
    if (onAcceptSuggestion) {
      await onAcceptSuggestion(suggestion);
    }
  }

  function handleDeclineSuggestion(_suggestion: Suggestion): void {
    // Decline is handled locally by SuggestionCard state; no backend call needed.
  }


</script>

<div class="advisor-chat">
  <div class="chat-header">
    <span class="chat-title">Goal Advisor</span>
    <div class="header-actions">
      {#if messages.length > 0}
        <button
          type="button"
          class="new-conversation-btn"
          onclick={handleNewConversation}
          disabled={busy}
        >
          New conversation
        </button>
      {/if}
    </div>
  </div>

  {#if !available}
    <div class="unavailable-overlay">
      <div class="unavailable-content">
        <p class="unavailable-message">Install Claude CLI to enable the goal advisor</p>
        {#if onRecheck}
          <button type="button" class="recheck-btn" onclick={onRecheck}>
            Re-check
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="messages-area" class:disabled-area={!available}>
    {#if messages.length === 0 && !busy}
      <div class="empty-state">
        <p class="empty-title">Welcome to the Goal Advisor</p>
        <p class="empty-description">
          Ask questions about your goals, get suggestions for key results,
          or request feedback on your OKR strategy.
        </p>
      </div>
    {/if}

    {#each messages as message, i (i)}
      <div class="message-row message-row-{message.role}">
        <div
          class="message-bubble {message.role === 'user' ? 'bubble-user' : 'bubble-advisor'}"
          class:bubble-error={!!message.error}
        >
          <span class="message-content">
            {#if message.error}
              {message.error}
            {:else if message.role === 'advisor'}
              <MarkdownContent content={message.content} restricted={true} />
            {:else}
              {message.content}
            {/if}
          </span>
          <span class="message-time">{formatTime(message.timestamp)}</span>
        </div>
        {#if message.suggestions && message.suggestions.length > 0}
          <div class="suggestions-container">
            {#each message.suggestions as suggestion, si (si)}
              <SuggestionCard
                {suggestion}
                onAccept={handleAcceptSuggestion}
                onDecline={handleDeclineSuggestion}
                {selectedOKRIds}
              />
            {/each}
          </div>
        {/if}
      </div>
    {/each}

    {#if busy}
      <div class="message-row message-row-advisor">
        <div class="message-bubble bubble-advisor">
          <span class="typing-indicator">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </span>
        </div>
      </div>
    {/if}

    <div bind:this={messagesEndEl}></div>
  </div>

  <div class="input-area" class:disabled-area={!available}>
    <textarea
      class="chat-input"
      placeholder="Ask the advisor..."
      bind:value={inputText}
      onkeydown={handleKeydown}
      disabled={busy || !available}
      rows={1}
    ></textarea>
    <button
      type="button"
      class="send-btn"
      onclick={handleSend}
      disabled={busy || !inputText.trim() || !available}
      aria-label="Send message"
    >
      Send
    </button>
  </div>
</div>

<style>
  .advisor-chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background-color: white;
    border: 1px solid var(--color-gray-200);
    border-radius: var(--radius-lg);
    overflow: hidden;
    position: relative;
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-gray-200);
    background-color: var(--color-gray-50);
    flex-shrink: 0;
  }

  .chat-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-gray-700);
  }

  .header-actions {
    display: flex;
    gap: var(--space-2);
  }

  .new-conversation-btn {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--color-gray-500);
    background: none;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s;
    font-family: inherit;
  }

  .new-conversation-btn:hover:not(:disabled) {
    background-color: var(--color-gray-100);
    color: var(--color-gray-700);
  }

  .new-conversation-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .unavailable-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.7);
  }

  .unavailable-content {
    text-align: center;
    padding: var(--space-6);
  }

  .unavailable-message {
    font-size: 0.875rem;
    color: var(--color-gray-500);
    margin-bottom: var(--space-3);
  }

  .recheck-btn {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--color-primary-600);
    background: none;
    border: 1px solid var(--color-primary-500);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    transition: background-color 0.15s;
    font-family: inherit;
  }

  .recheck-btn:hover {
    background-color: var(--color-primary-50);
  }

  .messages-area {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .disabled-area {
    opacity: 0.4;
    pointer-events: none;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-6);
  }

  .empty-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-gray-600);
    margin-bottom: var(--space-2);
  }

  .empty-description {
    font-size: 0.8125rem;
    color: var(--color-gray-400);
    line-height: 1.5;
    max-width: 280px;
  }

  .message-row {
    display: flex;
  }

  .message-row-user {
    justify-content: flex-end;
  }

  .message-row-advisor {
    justify-content: flex-start;
  }

  .message-bubble {
    max-width: 80%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    word-break: break-word;
  }

  .bubble-user {
    background-color: var(--color-primary-50);
    color: var(--color-gray-800);
    border-bottom-right-radius: var(--radius-sm);
  }

  .bubble-advisor {
    background-color: var(--color-gray-100);
    color: var(--color-gray-800);
    border-bottom-left-radius: var(--radius-sm);
  }

  .bubble-error {
    background-color: var(--color-error-50);
    border: 1px solid var(--color-error-200);
  }

  .bubble-error .message-content {
    color: var(--color-error-600);
  }

  .message-content {
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .bubble-user .message-content {
    white-space: pre-wrap;
  }

  .message-time {
    display: block;
    font-size: 0.625rem;
    color: var(--color-gray-400);
    margin-top: var(--space-1);
    text-align: right;
  }

  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: var(--space-1) 0;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: var(--color-gray-400);
    animation: pulse 1.4s ease-in-out infinite;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes pulse {
    0%, 80%, 100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  }

  .suggestions-container {
    max-width: 80%;
    margin-top: var(--space-1);
  }

  .input-area {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-gray-200);
    background-color: white;
    flex-shrink: 0;
  }

  .chat-input {
    flex: 1;
    min-height: 0;
    padding: var(--space-2) var(--space-3);
    font-size: 0.8125rem;
    font-family: inherit;
    border: 1px solid var(--color-gray-300);
    border-radius: var(--radius-md);
    resize: none;
    outline: none;
    transition: border-color 0.15s;
    line-height: 1.5;
  }

  .chat-input:focus {
    border-color: var(--color-primary-500);
  }

  .chat-input:disabled {
    background-color: var(--color-gray-50);
    cursor: not-allowed;
  }

  .send-btn {
    padding: var(--space-2) var(--space-3);
    font-size: 0.8125rem;
    font-weight: 500;
    font-family: inherit;
    color: white;
    background-color: var(--color-primary-600);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background-color 0.15s;
    align-self: flex-end;
  }

  .send-btn:hover:not(:disabled) {
    background-color: var(--color-primary-700);
  }

  .send-btn:disabled {
    background-color: var(--color-primary-300);
    cursor: not-allowed;
  }
</style>
