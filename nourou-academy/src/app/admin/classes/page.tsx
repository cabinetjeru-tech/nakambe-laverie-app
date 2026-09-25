import { redirect } from "next/navigation";
export default function AdminLives() {
  // La gestion des classes est commune avec l'espace formateur (droits étendus pour l'administration).
  redirect("/formateur/classes");
}
