"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { markLessonAction } from "@/app/actions/learning";
import { buttonClass } from "../ui";

export function CompleteButton({ lessonId, completed }: { lessonId: string; completed: boolean }) {
  const [done, setDone] = useState(completed);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const next = !done;
          const res = await markLessonAction(lessonId, next);
          if (res.ok) {
            setDone(next);
            router.refresh();
          }
        })
      }
      className={buttonClass(done ? "outline" : "secondary", "md")}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4" />}
      {done ? "Leçon terminée" : "Marquer comme terminée"}
    </button>
  );
}
