import { FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, File, Presentation } from "lucide-react";
import type { FileKind } from "@/lib/file-kinds";

const icons = { image: FileImage, video: FileVideo, audio: FileAudio, pdf: FileText, presentation: Presentation, document: FileText, spreadsheet: FileSpreadsheet, text: FileText, archive: FileArchive, other: File };
const colors: Record<FileKind, string> = {
  image: "text-emerald-600", video: "text-sky", audio: "text-violet-600", pdf: "text-red-600", presentation: "text-orange-600",
  document: "text-blue-700", spreadsheet: "text-green-700", text: "text-slate-600", archive: "text-amber-700", other: "text-slate-500",
};

export function FileKindIcon({ kind, className = "h-5 w-5" }: { kind: FileKind; className?: string }) {
  const Icon = icons[kind];
  return <Icon className={`${className} shrink-0 ${colors[kind]}`} aria-hidden />;
}
