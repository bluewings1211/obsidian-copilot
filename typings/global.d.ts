import { App } from "obsidian";

declare global {
  const app: App;
}

// Obsidian API declarations
declare module "obsidian" {
  interface App {
    // Add any additional app properties that might be missing
    [key: string]: unknown;
  }
}

// AG UI module declaration
declare module "@ag-ui/core" {
  export class Observable<T> {
    constructor(callback: (observer: Observer<T>) => void);
    subscribe(observer: Observer<T>): Subscription;
  }

  export interface Observer<T> {
    next(value: T): void;
    error(error: any): void;
    complete(): void;
  }

  export interface Subscription {
    unsubscribe(): void;
  }
}

export {};
