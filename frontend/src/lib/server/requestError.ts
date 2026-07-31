import { error } from "@sveltejs/kit";

/** Throws an expected route error that can be correlated with the server response log. */
export function requestError(locals: App.Locals, status: number, message: string): never {
  error(status, { message, requestId: locals.requestId });
}
