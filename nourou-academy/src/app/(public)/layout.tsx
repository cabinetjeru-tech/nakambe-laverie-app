import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { TutorLauncher } from "@/components/tutor/tutor-launcher";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Aller au contenu
      </a>
      <PublicHeader />
      <main id="contenu">{children}</main>
      <PublicFooter />
      <TutorLauncher />
    </>
  );
}
