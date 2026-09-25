"use client";
import { useActionState } from "react";
import { submitAssignmentAction, type SubmissionResult } from "@/app/actions/assessments";
import { Alert, Field, Textarea } from "../ui";
import { SubmitButton } from "../forms/submit-button";

export function AssignmentForm({ assignmentId, allowFiles }: { assignmentId: string; allowFiles: boolean }) {
  const [state, action] = useActionState<SubmissionResult | null, FormData>(submitAssignmentAction, null);
  return (
    <form action={action} className="space-y-3">
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.message}</Alert>}
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Field label="Votre travail (texte)"><Textarea name="text" rows={8} maxLength={20000} placeholder="Rédigez ici votre réponse, ou expliquez vos fichiers joints…" /></Field>
      {allowFiles && (
        <Field label="Fichiers (images, PDF, documents — 6 max)" hint="Pour les travaux de graphisme ou photographie, déposez vos images : elles peuvent être analysées visuellement. Total conseillé : moins de 4 Mo (compressez vos photos).">
          <input type="file" name="files" multiple accept="image/*,application/pdf,.docx,.pptx,.xlsx,.txt,.zip" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy" />
        </Field>
      )}
      <SubmitButton pendingText="Envoi et analyse…">Rendre mon travail</SubmitButton>
    </form>
  );
}
