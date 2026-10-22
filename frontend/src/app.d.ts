declare global {
  namespace App {
    interface Error {
      requestId?: string;
    }

    interface Locals {
      requestId: string;
    }

    interface PageState {
      /** The Discord manager shows the open message instead of its list on compact screens. */
      discordDetail?: boolean;
    }
  }
}

export {};
