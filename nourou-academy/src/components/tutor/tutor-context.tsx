"use client";
import { useEffect } from "react";

type Ctx = { courseId?: string; lessonId?: string };
declare global {
  interface Window {
    __ngaTutorContext?: Ctx;
  }
}

/** Indique au bouton flottant du tuteur la formation / leçon consultée. */
export function TutorContext({ courseId, lessonId }: Ctx) {
  useEffect(() => {
    window.__ngaTutorContext = { courseId, lessonId };
    window.dispatchEvent(new Event("nga-tutor-context"));
    return () => {
      window.__ngaTutorContext = undefined;
      window.dispatchEvent(new Event("nga-tutor-context"));
    };
  }, [courseId, lessonId]);
  return null;
}
