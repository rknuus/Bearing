let clockFn: () => Date = () => new Date();

export function getNow(): Date {
  return clockFn();
}

export function setClockForTesting(fn: () => Date): void {
  clockFn = fn;
}

export function resetClock(): void {
  clockFn = () => new Date();
}
