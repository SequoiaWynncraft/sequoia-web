declare global {
  namespace App {
    interface Error {
      requestId?: string;
    }

    interface Locals {
      requestId: string;
    }
  }
}

export {};
