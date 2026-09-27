/** Lien YouTube / Vimeo → URL de lecteur intégrable (null si c'est un fichier vidéo direct). */
export function videoEmbedUrl(url: string, autoplay = false): string | null {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0${autoplay ? "&autoplay=1" : ""}`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}${autoplay ? "?autoplay=1" : ""}`;
  return null;
}
