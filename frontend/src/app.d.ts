declare global {
  namespace App {
    interface Error {
      requestId?: string;
    }

    interface Locals {
      requestId: string;
    }

    interface PageState {
      discordDetail?: boolean;
    }
  }
}

export {};
