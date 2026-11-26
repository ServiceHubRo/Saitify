/** A rejected edit. The message is written for the person using the editor, so the UI can show it as is. */
export class EditorError extends Error {
  constructor(
    message: string,
    readonly code: 'not-found' | 'invalid' | 'limit' | 'forbidden' = 'invalid',
  ) {
    super(message);
    this.name = 'EditorError';
  }
}
