import { error } from "@sveltejs/kit";

export function requestError(locals: App.Locals, status: number, message: string): never {
  error(status, message, { requestId: locals.requestId });
}
