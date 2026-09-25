"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/validation";
import { Alert } from "../ui";

/**
 * Formulaire relié à une Server Action : affiche erreurs et confirmations,
 * réinitialise éventuellement le formulaire et rafraîchit la page.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  redirectTo,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  redirectTo?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      if (resetOnSuccess) ref.current?.reset();
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    }
  }, [state, resetOnSuccess, redirectTo, router]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {state.error && <Alert tone="error" className="mb-4">{state.error}</Alert>}
      {state.ok && state.message && <Alert tone="success" className="mb-4">{state.message}</Alert>}
      {children}
    </form>
  );
}
