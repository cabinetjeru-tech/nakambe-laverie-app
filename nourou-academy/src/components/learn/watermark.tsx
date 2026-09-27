/** Filigrane discret (nom de l'apprenant) sur les supports consultés en ligne : dissuade la copie et la diffusion. */
export function Watermark({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden>
      <div className="absolute -inset-1/2 flex rotate-[-24deg] flex-wrap content-start gap-x-24 gap-y-20 opacity-[0.08]">
        {Array.from({ length: 60 }, (_, i) => (
          <span key={i} className="whitespace-nowrap text-sm font-semibold text-navy">{text}</span>
        ))}
      </div>
    </div>
  );
}
