import Link from "next/link";
import { Award, Clock, Users } from "lucide-react";
import { formatDuration, formatXof, levelLabels } from "@/lib/format";
import { Badge, Stars } from "../ui";
import type { CourseCardData } from "@/lib/catalog";

const gradients = [
  "from-[#0b2447] to-[#2f80ed]",
  "from-[#123a6b] to-[#4aa3ff]",
  "from-[#0b2447] to-[#1c6fd1]",
  "from-[#16325c] to-[#e3a33b]",
];

export function CourseCover({ title, image, category, className = "aspect-[16/9]" }: { title: string; image: string | null; category?: string | null; className?: string }) {
  const g = gradients[title.length % gradients.length];
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${g} ${className}`}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" decoding="async" className="decorative absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="hero-grid absolute inset-0 flex items-end p-4">
          <span className="line-clamp-2 text-lg font-bold leading-snug text-white/95">{title}</span>
        </div>
      )}
      {category && (
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-navy">{category}</span>
      )}
    </div>
  );
}

export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <Link
      href={`/formations/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-soft transition hover:-translate-y-0.5 hover:border-sky-200"
    >
      <CourseCover title={course.title} image={course.image} category={course.category?.name} />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 font-semibold leading-snug text-navy group-hover:text-sky">{course.title}</h3>
        {course.subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted">{course.subtitle}</p>}
        <div className="mt-2 text-xs text-muted">{course.trainer.name}</div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          {course.rating ? (
            <>
              <span className="font-semibold text-navy">{course.rating.avg.toFixed(1)}</span>
              <Stars value={course.rating.avg} size={12} />
              <span className="text-muted">({course.rating.count})</span>
            </>
          ) : (
            <span className="text-muted">Nouvelle formation</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden />{formatDuration(course.durationMinutes)}</span>
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{course._count.enrollments} inscrit{course._count.enrollments > 1 ? "s" : ""}</span>
          {course.hasCertificate && <span className="inline-flex items-center gap-1"><Award className="h-3.5 w-3.5" aria-hidden />Certificat</span>}
        </div>
        <div className="mt-auto flex items-center justify-between pt-4">
          <Badge tone="gray">{levelLabels[course.level]}</Badge>
          <span className="text-base font-bold text-navy">{course.isFree || course.priceXof === 0 ? "Gratuit" : formatXof(course.priceXof)}</span>
        </div>
      </div>
    </Link>
  );
}
