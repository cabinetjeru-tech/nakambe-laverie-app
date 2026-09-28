/** Messages compréhensibles par l'enseignant. */
export function traduire(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail (pensez aux courriers indésirables).";
  if (m.includes("already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cette adresse : connectez-vous.";
  if (m.includes("password should be") || m.includes("weak")) return "Mot de passe trop faible : au moins 8 caractères, avec lettres et chiffres.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return "Trop de tentatives ou d'e-mails envoyés. Réessayez dans quelques minutes.";
  if (m.includes("same password") || m.includes("different from the old")) return "Choisissez un mot de passe différent de l'ancien.";
  if (m.includes("session") && m.includes("missing")) return "Lien expiré : recommencez la démarche « mot de passe oublié ».";
  return "Opération impossible pour le moment. Réessayez dans un instant.";
}
