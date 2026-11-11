/** Server-side log. Internal details go here and never into a response. */
export interface Logger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}

export const consoleLogger: Logger = {
  info: (message) => console.info(message),
  error: (message, error) => console.error(message, error),
};
