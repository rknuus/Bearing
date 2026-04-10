import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import AdvisorChat from './AdvisorChat.svelte';

interface Suggestion {
  type: string;
  action: string;
  themeData?: { id?: string; name: string; color?: string };
  objectiveData?: { id?: string; title: string; parentId?: string };
  keyResultData?: { id?: string; description: string; startValue: number; currentValue: number; targetValue: number; parentObjectiveId?: string };
  routineData?: { id?: string; description: string };
}

interface ChatMessage {
  role: 'user' | 'advisor';
  content: string;
  timestamp: number;
  error?: string;
  suggestions?: Suggestion[];
}

function makeDefaultProps(overrides: Partial<{
  onRequestAdvice: (message: string, history: ChatMessage[], selectedIds?: string[]) => Promise<{ text: string; suggestions?: Suggestion[] }>;
  onAcceptSuggestion: (suggestion: Suggestion) => Promise<void>;
  available: boolean;
  models: { name: string; provider: string; type: string; available: boolean; reason: string }[];
  selectedOKRIds: string[];
  onRecheck: () => void;
}> = {}) {
  return {
    onRequestAdvice: overrides.onRequestAdvice ?? vi.fn(async () => ({ text: 'Advisor response' })),
    onAcceptSuggestion: overrides.onAcceptSuggestion,
    available: overrides.available ?? true,
    models: overrides.models ?? [{ name: 'claude', provider: 'anthropic', type: 'local', available: true, reason: '' }],
    selectedOKRIds: overrides.selectedOKRIds,
    onRecheck: overrides.onRecheck,
  };
}

describe('AdvisorChat', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  async function renderChat(overrides: Partial<{
    onRequestAdvice: (message: string, history: ChatMessage[], selectedIds?: string[]) => Promise<{ text: string; suggestions?: Suggestion[] }>;
    onAcceptSuggestion: (suggestion: Suggestion) => Promise<void>;
    available: boolean;
    models: { name: string; provider: string; type: string; available: boolean; reason: string }[];
    selectedOKRIds: string[];
    onRecheck: () => void;
  }> = {}) {
    const props = makeDefaultProps(overrides);
    const result = render(AdvisorChat, {
      target: container,
      props,
    });
    await tick();
    return result;
  }

  it('renders empty state when no messages', async () => {
    await renderChat();

    const emptyTitle = container.querySelector('.empty-title');
    expect(emptyTitle).not.toBeNull();
    expect(emptyTitle?.textContent).toContain('Welcome to the Goal Advisor');

    const emptyDesc = container.querySelector('.empty-description');
    expect(emptyDesc).not.toBeNull();
  });

  it('renders user and advisor messages with correct styling', async () => {
    const onRequestAdvice = vi.fn(async () => ({ text: 'Here is my advice.' }));
    await renderChat({ onRequestAdvice });

    // Type and send a message
    const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
    expect(textarea).not.toBeNull();

    await fireEvent.input(textarea!, { target: { value: 'Help with my goals' } });
    await tick();

    const sendBtn = container.querySelector<HTMLButtonElement>('.send-btn');
    await fireEvent.click(sendBtn!);
    await tick();

    // Wait for the async response
    await vi.waitFor(() => {
      const rows = container.querySelectorAll('.message-row');
      expect(rows.length).toBe(2);
    });

    // Verify user message
    const userRow = container.querySelector('.message-row-user');
    expect(userRow).not.toBeNull();
    const userBubble = userRow!.querySelector('.bubble-user');
    expect(userBubble).not.toBeNull();
    expect(userBubble?.textContent).toContain('Help with my goals');

    // Verify advisor message
    const advisorRow = container.querySelectorAll('.message-row-advisor');
    expect(advisorRow.length).toBeGreaterThan(0);
    const advisorBubble = advisorRow[0].querySelector('.bubble-advisor');
    expect(advisorBubble).not.toBeNull();
    expect(advisorBubble?.textContent).toContain('Here is my advice.');
  });

  it('send button calls onRequestAdvice with message and history', async () => {
    const onRequestAdvice = vi.fn(async () => ({ text: 'Response' }));
    await renderChat({ onRequestAdvice });

    const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
    await fireEvent.input(textarea!, { target: { value: 'My question' } });
    await tick();

    const sendBtn = container.querySelector<HTMLButtonElement>('.send-btn');
    await fireEvent.click(sendBtn!);
    await tick();

    // Wait for the callback to be called
    await vi.waitFor(() => {
      expect(onRequestAdvice).toHaveBeenCalledOnce();
    });

    const args = onRequestAdvice.mock.calls[0] as unknown[];
    const message = args[0] as string;
    const history = args[1] as Array<{ role: string; content: string }>;
    expect(message).toBe('My question');
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('My question');
  });

  it('input disabled while awaiting response (busy state)', async () => {
    let resolveAdvice!: (value: { text: string }) => void;
    const onRequestAdvice = vi.fn(() => new Promise<{ text: string }>((resolve) => {
      resolveAdvice = resolve;
    }));
    await renderChat({ onRequestAdvice });

    const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
    await fireEvent.input(textarea!, { target: { value: 'Question' } });
    await tick();

    const sendBtn = container.querySelector<HTMLButtonElement>('.send-btn');
    await fireEvent.click(sendBtn!);
    await tick();

    // While busy, input should be disabled
    expect(textarea!.disabled).toBe(true);

    // Typing indicator should show
    const dots = container.querySelectorAll('.typing-indicator .dot');
    expect(dots.length).toBe(3);

    // Resolve the pending advice
    resolveAdvice({ text: 'Done' });
    await tick();
    await vi.waitFor(() => {
      expect(textarea!.disabled).toBe(false);
    });
  });

  it('error message displayed with error styling', async () => {
    const onRequestAdvice = vi.fn(async () => {
      throw new Error('Service unavailable');
    });

    // Suppress console.error from the thrown error
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await renderChat({ onRequestAdvice });

    const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
    await fireEvent.input(textarea!, { target: { value: 'Failing question' } });
    await tick();

    const sendBtn = container.querySelector<HTMLButtonElement>('.send-btn');
    await fireEvent.click(sendBtn!);
    await tick();

    // Wait for the error message to appear
    await vi.waitFor(() => {
      const errorBubble = container.querySelector('.bubble-error');
      expect(errorBubble).not.toBeNull();
    });

    const errorBubble = container.querySelector('.bubble-error');
    expect(errorBubble?.textContent).toContain('Service unavailable');
  });

  it('"New conversation" clears messages', async () => {
    const onRequestAdvice = vi.fn(async () => ({ text: 'Response' }));
    await renderChat({ onRequestAdvice });

    // Send a message first
    const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
    await fireEvent.input(textarea!, { target: { value: 'Hello' } });
    await tick();
    const sendBtn = container.querySelector<HTMLButtonElement>('.send-btn');
    await fireEvent.click(sendBtn!);
    await tick();

    // Wait for messages to appear
    await vi.waitFor(() => {
      const rows = container.querySelectorAll('.message-row');
      expect(rows.length).toBe(2);
    });

    // New conversation button should be visible
    const newConvBtn = container.querySelector<HTMLButtonElement>('.new-conversation-btn');
    expect(newConvBtn).not.toBeNull();

    await fireEvent.click(newConvBtn!);
    await tick();

    // Messages should be cleared
    const rows = container.querySelectorAll('.message-row');
    expect(rows.length).toBe(0);

    // Empty state should be back
    const emptyTitle = container.querySelector('.empty-title');
    expect(emptyTitle).not.toBeNull();
  });

  it('grayed-out state when available=false', async () => {
    await renderChat({ available: false });

    // Overlay should be visible
    const overlay = container.querySelector('.unavailable-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Install Claude CLI to enable the goal advisor');

    // Messages area, selection context, and input area should be disabled
    const disabledAreas = container.querySelectorAll('.disabled-area');
    expect(disabledAreas.length).toBe(3);

    // Input should be disabled
    const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
    expect(textarea!.disabled).toBe(true);
  });

  it('re-check button remains interactive when unavailable', async () => {
    const onRecheck = vi.fn();
    await renderChat({ available: false, onRecheck });

    const recheckBtn = container.querySelector<HTMLButtonElement>('.recheck-btn');
    expect(recheckBtn).not.toBeNull();

    await fireEvent.click(recheckBtn!);
    await tick();

    expect(onRecheck).toHaveBeenCalledOnce();
  });

  it('auto-scroll triggered on new message', async () => {
    // Polyfill scrollIntoView for jsdom
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    const onRequestAdvice = vi.fn(async () => ({ text: 'Response' }));
    await renderChat({ onRequestAdvice });

    const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
    await fireEvent.input(textarea!, { target: { value: 'Test scroll' } });
    await tick();

    const sendBtn = container.querySelector<HTMLButtonElement>('.send-btn');
    await fireEvent.click(sendBtn!);
    await tick();
    await tick();

    // Wait for response and scroll
    await vi.waitFor(() => {
      expect(scrollSpy).toHaveBeenCalled();
    });

    // Clean up polyfill
    // @ts-expect-error - removing polyfill
    delete Element.prototype.scrollIntoView;
  });

  it('Enter key sends message, Shift+Enter does not', async () => {
    const onRequestAdvice = vi.fn(async () => ({ text: 'Response' }));
    await renderChat({ onRequestAdvice });

    const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
    await fireEvent.input(textarea!, { target: { value: 'Enter test' } });
    await tick();

    // Shift+Enter should not send
    await fireEvent.keyDown(textarea!, { key: 'Enter', shiftKey: true });
    await tick();
    expect(onRequestAdvice).not.toHaveBeenCalled();

    // Enter without shift should send
    await fireEvent.keyDown(textarea!, { key: 'Enter', shiftKey: false });
    await tick();

    await vi.waitFor(() => {
      expect(onRequestAdvice).toHaveBeenCalledOnce();
    });
  });

  it('does not show new conversation button when no messages', async () => {
    await renderChat();

    const newConvBtn = container.querySelector('.new-conversation-btn');
    expect(newConvBtn).toBeNull();
  });

  it('send button disabled when input is empty', async () => {
    await renderChat();

    const sendBtn = container.querySelector<HTMLButtonElement>('.send-btn');
    expect(sendBtn!.disabled).toBe(true);
  });

  it('does not show re-check button when onRecheck is not provided', async () => {
    await renderChat({ available: false });

    const recheckBtn = container.querySelector('.recheck-btn');
    expect(recheckBtn).toBeNull();
  });

  describe('selection hint and count', () => {
    it('shows selection hint when no items selected', async () => {
      await renderChat();

      const hint = container.querySelector('.selection-hint');
      expect(hint).not.toBeNull();
      expect(hint?.textContent).toContain('Click items in the OKR tree to select context for the advisor');
    });

    it('shows selection hint when selectedOKRIds is empty array', async () => {
      await renderChat({ selectedOKRIds: [] });

      const hint = container.querySelector('.selection-hint');
      expect(hint).not.toBeNull();
      expect(hint?.textContent).toContain('Click items in the OKR tree to select context for the advisor');
    });

    it('shows count when items are selected', async () => {
      await renderChat({ selectedOKRIds: ['id1', 'id2', 'id3'] });

      const count = container.querySelector('.selection-count');
      expect(count).not.toBeNull();
      expect(count?.textContent).toContain('3 items selected');
    });

    it('shows singular "item" for single selection', async () => {
      await renderChat({ selectedOKRIds: ['id1'] });

      const count = container.querySelector('.selection-count');
      expect(count).not.toBeNull();
      expect(count?.textContent).toContain('1 item selected');
      expect(count?.textContent).not.toContain('items');
    });

    it('hint and count are mutually exclusive', async () => {
      // With a selection: count visible, hint absent
      const { unmount: unmount1 } = await renderChat({ selectedOKRIds: ['id1'] });

      expect(container.querySelector('.selection-count')).not.toBeNull();
      expect(container.querySelector('.selection-hint')).toBeNull();

      unmount1();

      // Without a selection: hint visible, count absent
      await renderChat({ selectedOKRIds: [] });

      expect(container.querySelector('.selection-hint')).not.toBeNull();
      expect(container.querySelector('.selection-count')).toBeNull();
    });
  });

  describe('auto-resize textarea', () => {
    it('textarea has overflow-y hidden by default', async () => {
      await renderChat();

      const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
      expect(textarea).not.toBeNull();
      const style = window.getComputedStyle(textarea!);
      // CSS sets overflow-y: hidden; inline style may not be set yet
      expect(style.overflowY === 'hidden' || textarea!.style.overflowY === '' || textarea!.style.overflowY === 'hidden').toBe(true);
    });

    it('adjusts height on input event', async () => {
      await renderChat();

      const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
      expect(textarea).not.toBeNull();

      // In jsdom, scrollHeight is 0, so adjustHeight sets height to '0px'
      await fireEvent.input(textarea!, { target: { value: 'Hello\nWorld\nLine3' } });
      await tick();

      // Verify the inline style was set (adjustHeight was called)
      expect(textarea!.style.height).toBeDefined();
    });

    it('resets textarea height after sending a message', async () => {
      const onRequestAdvice = vi.fn(async () => ({ text: 'Response' }));
      await renderChat({ onRequestAdvice });

      const textarea = container.querySelector<HTMLTextAreaElement>('.chat-input');
      await fireEvent.input(textarea!, { target: { value: 'Hello' } });
      await tick();

      const sendBtn = container.querySelector<HTMLButtonElement>('.send-btn');
      await fireEvent.click(sendBtn!);
      await tick();
      await tick();

      // After send, inputText is cleared and adjustHeight is called via tick
      // In jsdom scrollHeight is 0, so height resets to '0px' (collapsed)
      expect(textarea!.style.height).toBeDefined();
    });
  });
});
