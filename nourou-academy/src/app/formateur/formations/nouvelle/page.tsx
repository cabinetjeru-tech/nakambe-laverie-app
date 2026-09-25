import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { createCourseAction } from "@/app/actions/trainer";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { CourseFields } from "@/components/course/course-form";
import { Card, CardBody, PageHeader } from "@/components/ui";

export const metadata = { title: "Nouvelle formation" };

export default async function NewCourse() {
  await requirePermission("trainer.access");
  const categories = await prisma.category.findMany({ orderBy: { position: "asc" } });
  return (
    <>
      <PageHeader title="Nouvelle formation" subtitle="Elle sera créée en brouillon : vous ajouterez ensuite le programme, puis la soumettrez à validation." />
      <Card><CardBody>
        <ActionForm action={createCourseAction} className="space-y-6">
          <CourseFields categories={categories} />
          <SubmitButton size="lg">Créer la formation</SubmitButton>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
