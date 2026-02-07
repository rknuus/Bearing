// Vitest setup file

// Polyfill for HTMLDialogElement since jsdom doesn't fully support it
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function(this: HTMLDialogElement): void {
    this.setAttribute('open', '');
    this.open = true;
  };

  HTMLDialogElement.prototype.close = function(this: HTMLDialogElement): void {
    this.removeAttribute('open');
    this.open = false;
  };
}
