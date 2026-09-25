import { getCurrentUser } from "@/lib/auth/session";
import { getBrand } from "@/lib/settings";
import { aiStatus } from "@/lib/ai/llm";
import { TutorPanel } from "./tutor-panel";

/** Bouton flottant « Parler à mon tuteur IA », présent sur toutes les pages. */
export async function TutorLauncher({ courseId, lessonId }: { courseId?: string; lessonId?: string }) {
  const [user, brand, status] = await Promise.all([getCurrentUser(), getBrand(), aiStatus()]);
  return (
    <TutorPanel
      loggedIn={!!user}
      tutorName={brand.tutorName}
      capabilities={{ chat: status.chat, voiceServer: status.voiceServer, vision: status.vision }}
      courseId={courseId}
      lessonId={lessonId}
    />
  );
}
