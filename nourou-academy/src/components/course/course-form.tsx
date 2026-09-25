import type { Category, Course } from "@prisma/client";
import { Checkbox, Field, Input, Select, Textarea } from "../ui";

/** Champs communs de création / modification d'une formation. */
export function CourseFields({ course, categories }: { course?: Course; categories: Category[] }) {
  return (
    <div className="space-y-4">
      <Field label="Titre de la formation"><Input name="title" defaultValue={course?.title} required minLength={5} maxLength={150} /></Field>
      <Field label="Sous-titre (accroche)"><Input name="subtitle" defaultValue={course?.subtitle ?? ""} maxLength={250} /></Field>
      <Field label="Description détaillée"><Textarea name="description" defaultValue={course?.description} rows={6} required minLength={30} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Catégorie">
          <Select name="categoryId" defaultValue={course?.categoryId ?? ""}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Niveau">
          <Select name="level" defaultValue={course?.level ?? "BEGINNER"}>
            <option value="BEGINNER">Débutant</option>
            <option value="INTERMEDIATE">Intermédiaire</option>
            <option value="ADVANCED">Avancé</option>
          </Select>
        </Field>
        <Field label="Prix (FCFA)"><Input name="priceXof" type="number" min={0} step={500} defaultValue={course?.priceXof ?? 0} /></Field>
      </div>
      <div className="flex flex-wrap gap-6">
        <Checkbox name="isFree" defaultChecked={course?.isFree} label="Formation gratuite" />
        <Checkbox name="includedInSubscription" defaultChecked={course?.includedInSubscription ?? true} label="Incluse dans l'abonnement" />
      </div>
      <Field label="Modalités"><Input name="modality" defaultValue={course?.modality ?? "100 % en ligne, à votre rythme"} /></Field>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Objectifs pédagogiques" hint="Un objectif par ligne"><Textarea name="objectives" rows={5} defaultValue={course?.objectives.join("\n")} /></Field>
        <Field label="Prérequis" hint="Un par ligne"><Textarea name="prerequisites" rows={5} defaultValue={course?.prerequisites.join("\n")} /></Field>
        <Field label="Public visé" hint="Un par ligne"><Textarea name="targetAudience" rows={5} defaultValue={course?.targetAudience.join("\n")} /></Field>
      </div>
    </div>
  );
}
