/**
 * Unit tests for task-move-positions helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  moveToTopOfZone,
  moveToBottomOfZone,
  moveToTopOfColumn,
  moveToBottomOfColumn,
  TaskMovePositionsError,
  type ColumnSection,
} from './task-move-positions';

describe('moveToTopOfZone', () => {
  it('moves a middle task to the front of a 5-element list', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const result = moveToTopOfZone(ids, 'c');
    expect(result).toEqual(['c', 'a', 'b', 'd', 'e']);
  });

  it('is idempotent when the task is already at the front', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveToTopOfZone(ids, 'a')).toEqual(['a', 'b', 'c']);
  });

  it('returns the same single element when the list has length 1', () => {
    expect(moveToTopOfZone(['only'], 'only')).toEqual(['only']);
  });

  it('does not mutate the input array', () => {
    const ids = ['a', 'b', 'c'];
    moveToTopOfZone(ids, 'c');
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('returns a copy when the task is not in the list', () => {
    const ids = ['a', 'b'];
    const result = moveToTopOfZone(ids, 'missing');
    expect(result).toEqual(['a', 'b']);
    expect(result).not.toBe(ids);
  });
});

describe('moveToBottomOfZone', () => {
  it('moves a middle task to the end of a 5-element list', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const result = moveToBottomOfZone(ids, 'c');
    expect(result).toEqual(['a', 'b', 'd', 'e', 'c']);
  });

  it('is idempotent when the task is already at the end', () => {
    const ids = ['a', 'b', 'c'];
    expect(moveToBottomOfZone(ids, 'c')).toEqual(['a', 'b', 'c']);
  });

  it('returns the same single element when the list has length 1', () => {
    expect(moveToBottomOfZone(['only'], 'only')).toEqual(['only']);
  });

  it('does not mutate the input array', () => {
    const ids = ['a', 'b', 'c'];
    moveToBottomOfZone(ids, 'a');
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});

describe('moveToTopOfColumn', () => {
  const sections: ColumnSection[] = [
    { name: 'Today', orderedIds: ['t1', 't2'] },
    { name: 'This Week', orderedIds: ['w1', 'w2', 'w3'] },
    { name: 'Later', orderedIds: ['l1', 'l2'] },
  ];

  it('removes the task from the middle section and prepends it to the top section', () => {
    const result = moveToTopOfColumn(sections, 'w2', 'This Week');
    expect(result).toEqual({
      'This Week': ['w1', 'w3'],
      Today: ['w2', 't1', 't2'],
    });
  });

  it('returns an empty record when the task is already at the top of the topmost section', () => {
    const result = moveToTopOfColumn(sections, 't1', 'Today');
    expect(result).toEqual({});
  });

  it('moves a task within the topmost section to its first slot', () => {
    const result = moveToTopOfColumn(sections, 't2', 'Today');
    expect(result).toEqual({ Today: ['t2', 't1'] });
  });

  it('throws TaskMovePositionsError with code TASK_NOT_FOUND for an unknown taskId', () => {
    expect(() => moveToTopOfColumn(sections, 'ghost', 'Today')).toThrow(
      TaskMovePositionsError,
    );
    try {
      moveToTopOfColumn(sections, 'ghost', 'Today');
    } catch (err) {
      expect(err).toBeInstanceOf(TaskMovePositionsError);
      expect((err as TaskMovePositionsError).code).toBe('TASK_NOT_FOUND');
    }
  });

  it('throws TaskMovePositionsError with code SECTION_NOT_FOUND for an unknown section name', () => {
    try {
      moveToTopOfColumn(sections, 't1', 'Nowhere');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TaskMovePositionsError);
      expect((err as TaskMovePositionsError).code).toBe('SECTION_NOT_FOUND');
    }
  });

  it('throws TaskMovePositionsError with code NO_SECTIONS when sections is empty', () => {
    try {
      moveToTopOfColumn([], 't1', 'Today');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TaskMovePositionsError);
      expect((err as TaskMovePositionsError).code).toBe('NO_SECTIONS');
    }
  });
});

describe('moveToBottomOfColumn', () => {
  const sections: ColumnSection[] = [
    { name: 'Today', orderedIds: ['t1', 't2'] },
    { name: 'This Week', orderedIds: ['w1', 'w2'] },
    { name: 'Later', orderedIds: ['l1', 'l2', 'l3'] },
  ];

  it('removes a task from the topmost section and appends it to the bottom section', () => {
    const result = moveToBottomOfColumn(sections, 't1', 'Today');
    expect(result).toEqual({
      Today: ['t2'],
      Later: ['l1', 'l2', 'l3', 't1'],
    });
  });

  it('returns an empty record when the task is already at the bottom of the bottommost section', () => {
    const result = moveToBottomOfColumn(sections, 'l3', 'Later');
    expect(result).toEqual({});
  });

  it('moves a task within the bottommost section to its last slot', () => {
    const result = moveToBottomOfColumn(sections, 'l1', 'Later');
    expect(result).toEqual({ Later: ['l2', 'l3', 'l1'] });
  });
});
