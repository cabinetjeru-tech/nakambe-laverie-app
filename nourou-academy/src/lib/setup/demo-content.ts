/**
 * Contenus pédagogiques de DÉMONSTRATION.
 * Ils servent à tester la plateforme (catalogue, lecteur, quiz, tuteur IA / RAG).
 * À remplacer par les vraies formations avant la mise en production
 * (Administration › Formations, ou suppression via `isDemo = true`).
 */

export type SeedLesson = {
  title: string;
  type: "TEXT" | "VIDEO" | "QUIZ" | "ASSIGNMENT";
  minutes: number;
  preview?: boolean;
  content?: string;
};
export type SeedQuestion = {
  type: "SINGLE" | "MULTIPLE" | "TRUE_FALSE" | "SHORT" | "OPEN";
  prompt: string;
  options?: string[];
  correct?: number[];
  expected?: string[];
  rubric?: string;
  explanation?: string;
  topic?: string;
  points?: number;
};
export type SeedCourse = {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  trainer: number;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  price: number;
  isFree?: boolean;
  featured?: boolean;
  description: string;
  objectives: string[];
  prerequisites: string[];
  audience: string[];
  modules: { title: string; lessons: SeedLesson[] }[];
  quiz?: { moduleIndex: number; title: string; final?: boolean; questions: SeedQuestion[] };
  assignment?: { moduleIndex: number; title: string; instructions: string; rubric: { criterion: string; points: number; description: string }[]; isProject?: boolean };
  certRequireProjects?: boolean;
};

export const categories = [
  { slug: "numerique-bureautique", name: "Numérique & bureautique", icon: "Laptop", description: "Outils informatiques, bureautique et intelligence artificielle au quotidien." },
  { slug: "entrepreneuriat-gestion", name: "Entrepreneuriat & gestion", icon: "Briefcase", description: "Créer, gérer et développer son activité." },
  { slug: "communication-marketing", name: "Communication & marketing digital", icon: "Megaphone", description: "Réseaux sociaux, vente en ligne et communication d'entreprise." },
  { slug: "graphisme-photographie", name: "Graphisme & photographie", icon: "Camera", description: "Création visuelle, design et prise de vue professionnelle." },
  { slug: "metiers-techniques", name: "Métiers techniques & artisanat", icon: "Wrench", description: "Compétences techniques et valorisation des savoir-faire." },
  { slug: "emploi-developpement", name: "Emploi & développement personnel", icon: "Target", description: "Recherche d'emploi, prise de parole et efficacité professionnelle." },
];

export const trainers = [
  {
    name: "Formateur Démo — Marketing",
    email: "formateur.marketing@demo.nourou-academy.local",
    headline: "Compte de démonstration — spécialité marketing digital",
    bio: "Profil fictif créé pour la démonstration de la plateforme. Remplacez-le par le profil réel d'un formateur.",
    expertise: ["Marketing digital", "Réseaux sociaux", "Vente en ligne"],
  },
  {
    name: "Formatrice Démo — Gestion",
    email: "formatrice.gestion@demo.nourou-academy.local",
    headline: "Compte de démonstration — spécialité gestion d'entreprise",
    bio: "Profil fictif créé pour la démonstration de la plateforme. Remplacez-le par le profil réel d'une formatrice.",
    expertise: ["Entrepreneuriat", "Comptabilité simplifiée", "Excel"],
  },
  {
    name: "Formateur Démo — Image",
    email: "formateur.image@demo.nourou-academy.local",
    headline: "Compte de démonstration — spécialité graphisme et photographie",
    bio: "Profil fictif créé pour la démonstration de la plateforme. Remplacez-le par le profil réel d'un formateur.",
    expertise: ["Photographie", "Design graphique", "Identité visuelle"],
  },
];

export const courses: SeedCourse[] = [
  {
    slug: "ia-generative-pour-les-professionnels",
    title: "L'IA générative au service de votre travail",
    subtitle: "Utiliser les assistants IA de façon efficace, critique et responsable",
    category: "numerique-bureautique",
    trainer: 1,
    level: "BEGINNER",
    price: 0,
    isFree: true,
    featured: true,
    description:
      "Une formation d'initiation gratuite pour comprendre ce qu'est l'intelligence artificielle générative, apprendre à rédiger de bonnes consignes (prompts) et l'utiliser pour gagner du temps : rédaction de courriers, préparation de devis, idées de publications, synthèse de documents. Vous apprendrez aussi à vérifier les réponses et à protéger vos données.",
    objectives: [
      "Expliquer simplement ce qu'est une IA générative et ses limites",
      "Rédiger des consignes claires pour obtenir des réponses utiles",
      "Utiliser l'IA pour des tâches professionnelles courantes",
      "Vérifier les réponses et protéger les informations sensibles",
    ],
    prerequisites: ["Savoir utiliser un smartphone ou un ordinateur", "Aucune connaissance technique requise"],
    audience: ["Entrepreneurs et commerçants", "Étudiants", "Salariés de bureau"],
    modules: [
      {
        title: "Comprendre l'IA générative",
        lessons: [
          {
            title: "Qu'est-ce qu'une IA générative ?",
            type: "TEXT",
            minutes: 10,
            preview: true,
            content: `## Une IA qui produit du contenu

Une **IA générative** est un programme informatique capable de produire du texte, des images ou du son à partir d'une simple demande écrite ou orale. Les assistants conversationnels en sont l'exemple le plus connu.

## Comment ça marche, en simple

L'IA a été entraînée sur une très grande quantité de textes. Elle a appris quels mots ont tendance à suivre d'autres mots. Quand vous lui posez une question, elle **prédit** la suite la plus probable, mot après mot.

> Conséquence importante : l'IA ne « sait » pas au sens humain. Elle peut formuler une réponse très convaincante… et fausse. On parle d'**hallucination**.

## Ce qu'elle fait bien

- Rédiger et reformuler (courrier, annonce, message WhatsApp professionnel)
- Résumer un long document
- Proposer des idées (noms de produits, slogans, plans de formation)
- Expliquer une notion de plusieurs façons

## Ses limites

- Elle peut se tromper sur des faits, des chiffres ou des lois
- Ses connaissances peuvent être datées
- Elle ne connaît pas votre contexte si vous ne le lui donnez pas

**À retenir :** l'IA est un assistant, pas un expert infaillible. Vous restez responsable de ce que vous publiez ou envoyez.`,
          },
          {
            title: "Les bons usages au travail",
            type: "TEXT",
            minutes: 12,
            content: `## Des exemples concrets

**Awa**, qui vend des pagnes au marché de Rood Woko à Ouagadougou, utilise un assistant IA pour rédiger chaque semaine trois publications Facebook présentant ses nouveaux modèles.

**Issouf**, gérant d'un atelier de soudure à Bobo-Dioulasso, lui demande de transformer ses notes en un **devis clair et poli** pour un client.

**Mariam**, étudiante, s'en sert pour **se faire expliquer** une notion de comptabilité avec des exemples simples, puis vérifie dans son cours.

## Règle des trois vérifications

1. **Les faits** : chiffres, dates, noms, textes de loi → toujours vérifier auprès d'une source fiable.
2. **Le ton** : adapté à votre client ou à votre administration ?
3. **La confidentialité** : ne jamais coller de mots de passe, numéros de carte, codes Mobile Money ou données personnelles de clients.

## Gain de temps réaliste

Utilisée correctement, l'IA fait gagner du temps sur les **premiers jets**. Le travail de relecture et d'adaptation reste indispensable.`,
          },
        ],
      },
      {
        title: "Rédiger de bonnes consignes (prompts)",
        lessons: [
          {
            title: "La méthode RÔLE – CONTEXTE – TÂCHE – FORMAT",
            type: "TEXT",
            minutes: 15,
            content: `## Pourquoi la consigne compte

Une consigne vague donne une réponse vague. Plus vous donnez de contexte, plus la réponse est utile.

## La méthode en 4 blocs

- **Rôle** : « Tu es un conseiller commercial expérimenté. »
- **Contexte** : « Je tiens une boutique de cosmétiques naturels à base de karité à Koudougou. Mes clientes ont entre 20 et 45 ans. »
- **Tâche** : « Propose 5 idées de publications pour la fête de Tabaski. »
- **Format** : « Chaque idée en 2 phrases maximum, avec un appel à l'action vers WhatsApp. »

## Exemple complet

> Tu es un conseiller commercial expérimenté. Je tiens une boutique de cosmétiques au karité à Koudougou, clientèle féminine de 20 à 45 ans. Propose 5 idées de publications Facebook pour la Tabaski. Chaque idée en 2 phrases maximum, avec un appel à l'action vers WhatsApp.

## Améliorer par itérations

Si la réponse ne convient pas, **précisez** : « plus court », « ton plus formel », « ajoute les prix en FCFA », « donne 3 variantes ». Le dialogue fait partie de la méthode.`,
          },
          { title: "Quiz : bien utiliser l'IA", type: "QUIZ", minutes: 10 },
        ],
      },
    ],
    quiz: {
      moduleIndex: 1,
      title: "Quiz : bien utiliser l'IA",
      questions: [
        {
          type: "SINGLE",
          prompt: "Que signifie « hallucination » pour une IA générative ?",
          options: ["Un bug qui arrête le programme", "Une réponse convaincante mais fausse", "Une image générée par erreur", "Une coupure de connexion"],
          correct: [1],
          explanation: "L'IA peut produire une réponse très bien formulée mais inexacte : c'est une hallucination.",
          topic: "Limites de l'IA générative",
        },
        {
          type: "MULTIPLE",
          prompt: "Quelles informations ne faut-il JAMAIS coller dans un assistant IA ?",
          options: ["Un code secret Mobile Money", "Le nom de votre boutique", "Les données personnelles d'un client", "Un mot de passe"],
          correct: [0, 2, 3],
          explanation: "Codes, mots de passe et données personnelles de clients doivent rester confidentiels.",
          topic: "Confidentialité",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Une réponse d'IA peut être publiée sans relecture si elle est bien rédigée.",
          options: ["Vrai", "Faux"],
          correct: [1],
          explanation: "Vous restez responsable : vérifiez les faits, le ton et la confidentialité.",
          topic: "Vérification des réponses",
        },
        {
          type: "OPEN",
          prompt: "Rédigez une consigne complète (rôle, contexte, tâche, format) pour obtenir un message de relance polie d'un client qui n'a pas payé une facture.",
          rubric: "4 points : 1 pt par bloc présent et pertinent (rôle, contexte précis, tâche claire, format demandé). Pénaliser une consigne vague.",
          expected: ["rôle défini", "contexte de l'entreprise et du client", "tâche : message de relance", "format : longueur, ton, canal"],
          topic: "Méthode Rôle-Contexte-Tâche-Format",
          points: 4,
        },
      ],
    },
  },
  {
    slug: "marketing-digital-pme-africaines",
    title: "Marketing digital pour PME et commerçants",
    subtitle: "Vendre plus grâce à Facebook, WhatsApp Business et Instagram",
    category: "communication-marketing",
    trainer: 0,
    level: "BEGINNER",
    price: 25000,
    featured: true,
    description:
      "Apprenez à attirer des clients et à vendre en ligne avec les outils que vos clients utilisent déjà : WhatsApp Business, Facebook et Instagram. Une formation pratique, pensée pour les réalités des commerçants et PME d'Afrique de l'Ouest : petits budgets, paiement Mobile Money, livraison, confiance du client.",
    objectives: [
      "Définir sa cible et son message",
      "Configurer un compte WhatsApp Business professionnel",
      "Construire un calendrier de publications",
      "Mesurer ses résultats et ajuster",
    ],
    prerequisites: ["Avoir un smartphone Android", "Avoir une activité ou un projet d'activité"],
    audience: ["Commerçants", "Entrepreneurs", "Community managers débutants"],
    modules: [
      {
        title: "Les bases : cible, offre, message",
        lessons: [
          {
            title: "Connaître son client idéal",
            type: "VIDEO",
            minutes: 12,
            preview: true,
            content: `## Pourquoi définir une cible ?

Vouloir vendre « à tout le monde » revient souvent à ne convaincre personne. Le **client idéal** (ou *persona*) est une description précise de la personne à qui vous vous adressez.

## Les questions à se poser

- Qui est-il ? (âge, ville, activité, revenus approximatifs)
- Quel **problème** cherche-t-il à résoudre ?
- Où passe-t-il du temps en ligne ? (groupes Facebook, statuts WhatsApp, TikTok…)
- Comment paie-t-il ? (espèces à la livraison, Orange Money, Moov Money…)
- Qu'est-ce qui le fait **hésiter** à acheter ? (peur de l'arnaque, délai de livraison, prix)

## Exemple

**Boutique de jus locaux (bissap, gingembre, tamarin) à Ouagadougou** :
- Cible : employés de bureau de 25-40 ans, quartiers Ouaga 2000 et Zone du Bois.
- Problème : envie de boissons saines livrées au bureau à midi.
- Canal : statuts WhatsApp et groupes Facebook de quartier.
- Frein : régularité de la livraison → promesse « livré avant 12 h 30 ».

**À retenir :** un message qui parle d'un problème précis à une personne précise vend mieux.`,
          },
          {
            title: "Construire une offre claire",
            type: "TEXT",
            minutes: 10,
            content: `## La formule d'une offre claire

**Pour** [client] **qui veut** [résultat], **nous proposons** [produit/service] **qui** [bénéfice principal], **contrairement à** [alternative].

## Exemple

Pour les mamans actives de Ouagadougou qui veulent nourrir sainement leurs enfants, nous proposons des farines infantiles enrichies livrées à domicile, préparées avec des céréales locales, contrairement aux produits importés plus chers.

## Les éléments qui rassurent

- Prix affiché en **FCFA**, frais de livraison annoncés
- Moyens de paiement acceptés (Mobile Money, espèces)
- Témoignages **réels** de clients (avec leur accord)
- Numéro joignable et délai de réponse

Un client qui a toutes les informations pose moins de questions et achète plus vite.`,
          },
        ],
      },
      {
        title: "WhatsApp Business et réseaux sociaux",
        lessons: [
          {
            title: "Configurer WhatsApp Business comme un pro",
            type: "TEXT",
            minutes: 15,
            content: `## Les réglages indispensables

1. **Profil professionnel** : logo, description claire, adresse, horaires, lien vers catalogue.
2. **Catalogue** : chaque produit avec photo nette, prix en FCFA et description courte.
3. **Message d'accueil** automatique : « Bonjour et bienvenue chez … ! Comment pouvons-nous vous aider ? »
4. **Message d'absence** en dehors des horaires.
5. **Réponses rapides** pour les questions fréquentes (prix de livraison, modes de paiement).
6. **Étiquettes** : nouveau client, commande en cours, payé, livré.

## Les statuts : votre vitrine quotidienne

Publiez 3 à 5 statuts par jour : nouveautés, coulisses, avis clients, promotions limitées dans le temps. Vos contacts les voient sans effort.

## Attention

N'ajoutez pas des personnes à des groupes sans leur accord : c'est mal perçu et peut entraîner le blocage de votre compte.`,
          },
          {
            title: "Calendrier éditorial et types de publications",
            type: "TEXT",
            minutes: 12,
            content: `## La règle des 4 types de contenus

- **Informer** : conseils utiles liés à votre produit (ex. comment conserver le beurre de karité).
- **Prouver** : avis clients, avant/après, chiffres réels.
- **Divertir / créer du lien** : coulisses, équipe, questions à la communauté.
- **Vendre** : offres, nouveautés, promotions.

Visez environ **3 contenus utiles pour 1 contenu de vente**.

## Un calendrier simple sur une semaine

| Jour | Type | Exemple |
|---|---|---|
| Lundi | Informer | Astuce d'utilisation |
| Mercredi | Prouver | Avis d'une cliente |
| Vendredi | Vendre | Offre du week-end |
| Samedi | Lien | Coulisses de la boutique |

Adaptez aux temps forts locaux : rentrée scolaire, Ramadan, Tabaski, Noël, fêtes de fin d'année, SIAO, FESPACO.`,
          },
          { title: "Quiz final : marketing digital", type: "QUIZ", minutes: 15 },
          { title: "Projet : votre plan de communication", type: "ASSIGNMENT", minutes: 60 },
        ],
      },
    ],
    quiz: {
      moduleIndex: 1,
      title: "Quiz final : marketing digital",
      final: true,
      questions: [
        {
          type: "SINGLE",
          prompt: "Quelle est la meilleure définition d'un client idéal (persona) ?",
          options: ["Tous les habitants de la ville", "Une description précise de la personne à qui l'on s'adresse", "Le client qui dépense le plus", "Un influenceur"],
          correct: [1],
          topic: "Persona / client idéal",
          explanation: "Le persona décrit précisément la cible : profil, problème, canaux, freins.",
        },
        {
          type: "MULTIPLE",
          prompt: "Quels éléments rassurent un client qui achète en ligne ?",
          options: ["Prix affiché en FCFA", "Témoignages réels", "Absence de numéro de contact", "Moyens de paiement annoncés"],
          correct: [0, 1, 3],
          topic: "Offre claire et confiance",
        },
        {
          type: "SHORT",
          prompt: "Quel outil de WhatsApp Business permet de présenter ses produits avec photos et prix ?",
          expected: ["catalogue", "le catalogue"],
          topic: "WhatsApp Business",
        },
        {
          type: "OPEN",
          prompt: "Proposez 3 publications (une par type : informer, prouver, vendre) pour une boutique de votre choix.",
          rubric: "6 points : 2 pts par publication pertinente et correctement classée ; bonus de qualité si le contexte local est pris en compte.",
          topic: "Calendrier éditorial",
          points: 6,
        },
      ],
    },
    assignment: {
      moduleIndex: 1,
      title: "Projet : votre plan de communication",
      instructions:
        "Pour votre activité (réelle ou en projet), rédigez un mini-plan de communication : 1) votre client idéal, 2) votre offre en une phrase, 3) un calendrier de publications sur 2 semaines, 4) deux indicateurs à suivre. Vous pouvez joindre des visuels.",
      rubric: [
        { criterion: "Client idéal précis", points: 5, description: "Profil, problème, canaux, freins" },
        { criterion: "Offre claire", points: 5, description: "Formule complète et bénéfice explicite" },
        { criterion: "Calendrier réaliste", points: 6, description: "Variété des types de contenus, adapté au contexte" },
        { criterion: "Indicateurs de suivi", points: 4, description: "Indicateurs mesurables et pertinents" },
      ],
      isProject: true,
    },
    certRequireProjects: true,
  },
  {
    slug: "creer-gerer-micro-entreprise",
    title: "Créer et gérer sa micro-entreprise",
    subtitle: "De l'idée au premier bénéfice : plan d'affaires, prix, trésorerie",
    category: "entrepreneuriat-gestion",
    trainer: 1,
    level: "BEGINNER",
    price: 30000,
    featured: true,
    description:
      "Transformez votre idée en activité rentable. Vous apprendrez à tester votre idée, calculer vos coûts et fixer vos prix, suivre votre trésorerie au quotidien et séparer l'argent de l'entreprise de l'argent personnel. Les démarches administratives sont présentées de façon générale : renseignez-vous toujours auprès des guichets officiels de votre pays.",
    objectives: [
      "Tester une idée d'activité avant d'investir",
      "Calculer un coût de revient et fixer un prix de vente",
      "Tenir un cahier de caisse simple",
      "Préparer un plan d'affaires d'une page",
    ],
    prerequisites: ["Savoir lire et faire des calculs simples"],
    audience: ["Porteurs de projet", "Artisans", "Commerçants", "Jeunes diplômés"],
    modules: [
      {
        title: "De l'idée au projet",
        lessons: [
          {
            title: "Tester son idée à petit budget",
            type: "TEXT",
            minutes: 12,
            preview: true,
            content: `## Ne pas tout investir d'un coup

Avant d'acheter un stock important ou de louer un local, **testez** votre idée à petite échelle.

## 3 façons de tester

1. **Pré-vente** : présentez le produit (photo, prix) à votre entourage et sur WhatsApp, et prenez des commandes avec acompte.
2. **Petite série** : produisez 20 unités et observez à quelle vitesse elles se vendent.
3. **Interviews** : discutez avec 10 clients potentiels. Demandez comment ils résolvent le problème aujourd'hui et combien ils paient.

## Exemple

Salif veut lancer des **savons artisanaux au karité**. Plutôt que d'acheter 200 000 FCFA de matériel, il fabrique 30 savons avec le matériel de base, les vend en 2 semaines à des collègues et note les remarques : parfum apprécié, emballage à améliorer. Il sait maintenant quoi corriger avant d'investir.`,
          },
          {
            title: "Calculer son coût de revient et son prix",
            type: "TEXT",
            minutes: 18,
            content: `## Le coût de revient

C'est ce que coûte réellement un produit **avant** de gagner quoi que ce soit.

**Coût de revient = matières premières + main-d'œuvre + part des charges fixes**

## Exemple : un savon au karité

| Élément | Coût par savon |
|---|---|
| Beurre de karité, huile, soude, parfum | 250 FCFA |
| Emballage et étiquette | 75 FCFA |
| Part des charges (transport, électricité…) | 50 FCFA |
| **Coût de revient** | **375 FCFA** |

## Fixer le prix de vente

- **Méthode du coefficient** : coût de revient × coefficient (souvent entre 1,5 et 3 selon le secteur). 375 × 2 = 750 FCFA.
- **Vérifier le marché** : combien coûtent les produits concurrents ? Votre qualité justifie-t-elle un prix plus élevé ?

## La marge

**Marge unitaire = prix de vente − coût de revient** → 750 − 375 = **375 FCFA** par savon.

Si vos charges fixes mensuelles sont de 45 000 FCFA, il faut vendre 45 000 ÷ 375 = **120 savons** par mois pour les couvrir : c'est le **seuil de rentabilité**.`,
          },
        ],
      },
      {
        title: "Gérer au quotidien",
        lessons: [
          {
            title: "Tenir un cahier de caisse",
            type: "TEXT",
            minutes: 12,
            content: `## Pourquoi c'est vital

Beaucoup de petites entreprises ferment non pas faute de clients, mais faute de **trésorerie** : l'argent manque au mauvais moment.

## Le cahier de caisse

Chaque jour, notez **toutes** les entrées et sorties :

| Date | Libellé | Entrée | Sortie | Solde |
|---|---|---|---|---|
| 02/03 | Solde de départ | | | 50 000 |
| 02/03 | Vente 10 savons | 7 500 | | 57 500 |
| 03/03 | Achat karité | | 12 000 | 45 500 |

Incluez les paiements **Orange Money / Moov Money** : notez-les comme des encaissements, avec la référence de transaction.

## Règle d'or : séparer les caisses

L'argent de l'entreprise n'est pas l'argent de la famille. Versez-vous un **salaire fixe** plutôt que de prélever au fil des besoins.`,
          },
          { title: "Quiz : gestion et prix", type: "QUIZ", minutes: 10 },
        ],
      },
    ],
    quiz: {
      moduleIndex: 1,
      title: "Quiz : gestion et prix",
      final: true,
      questions: [
        {
          type: "SINGLE",
          prompt: "Un produit a un coût de revient de 400 FCFA et est vendu 1 000 FCFA. Quelle est la marge unitaire ?",
          options: ["400 FCFA", "600 FCFA", "1 000 FCFA", "1 400 FCFA"],
          correct: [1],
          explanation: "Marge = prix de vente − coût de revient = 1 000 − 400 = 600 FCFA.",
          topic: "Marge unitaire",
        },
        {
          type: "SINGLE",
          prompt: "Charges fixes : 60 000 FCFA/mois, marge unitaire : 300 FCFA. Combien d'unités vendre pour atteindre le seuil de rentabilité ?",
          options: ["100", "180", "200", "300"],
          correct: [2],
          explanation: "60 000 ÷ 300 = 200 unités.",
          topic: "Seuil de rentabilité",
        },
        {
          type: "TRUE_FALSE",
          prompt: "Il est recommandé de mélanger l'argent de l'entreprise et l'argent personnel pour plus de souplesse.",
          options: ["Vrai", "Faux"],
          correct: [1],
          topic: "Séparation des caisses",
        },
        {
          type: "OPEN",
          prompt: "Expliquez avec vos mots pourquoi une entreprise qui a des clients peut quand même manquer d'argent.",
          rubric: "4 points : notion de trésorerie (2), exemple de décalage entrées/sorties ou de prélèvements personnels (2).",
          topic: "Trésorerie",
          points: 4,
        },
      ],
    },
  },
  {
    slug: "photographie-produit-smartphone",
    title: "Photographie produit avec un smartphone",
    subtitle: "Des photos qui font vendre, sans matériel coûteux",
    category: "graphisme-photographie",
    trainer: 2,
    level: "INTERMEDIATE",
    price: 20000,
    description:
      "Maîtrisez la lumière, le cadrage et la retouche légère pour réaliser des photos de produits professionnelles avec votre téléphone. Idéal pour les commerçants, créateurs, photographes débutants et community managers. Les travaux pratiques sont analysés par votre formateur (et par le tuteur IA lorsque l'analyse d'image est activée).",
    objectives: ["Utiliser la lumière naturelle", "Composer une image avec la règle des tiers", "Créer un fond neutre à petit prix", "Retoucher sans dénaturer le produit"],
    prerequisites: ["Smartphone avec appareil photo", "Avoir des produits à photographier"],
    audience: ["Commerçants", "Photographes débutants", "Community managers", "Artisans"],
    modules: [
      {
        title: "Lumière et composition",
        lessons: [
          {
            title: "Maîtriser la lumière naturelle",
            type: "TEXT",
            minutes: 12,
            preview: true,
            content: `## La lumière fait 80 % de la photo

La meilleure lumière pour photographier un produit est souvent **gratuite** : celle d'une fenêtre ou d'une ombre en extérieur.

## Les règles

- Évitez le **soleil direct de midi** : ombres dures et reflets. Préférez le matin (7 h – 9 h) ou la fin d'après-midi (16 h – 17 h 30).
- Placez le produit **près d'une fenêtre**, lumière sur le côté.
- Utilisez un **réflecteur** : un carton blanc ou une feuille d'aluminium pour déboucher les ombres.
- Coupez le **flash** du téléphone.

## Astuce locale

Sous un hangar ou une paillote, vous obtenez une lumière douce et homogène, idéale pour les tissus, la maroquinerie ou les bijoux.`,
          },
          {
            title: "Cadrage et règle des tiers",
            type: "TEXT",
            minutes: 10,
            content: `## La règle des tiers

Activez la **grille** dans l'appareil photo. Placez le produit ou son point fort sur l'une des intersections : l'image est plus dynamique.

## Les angles utiles

- **Face** : pour les emballages et étiquettes.
- **Trois-quarts** : montre le volume (chaussures, sacs).
- **Plongée (vue du dessus)** : plats, bijoux, compositions.
- **Détail (gros plan)** : texture du tissu, finition du cuir.

## Le fond

Un drap blanc tendu, un carton coloré ou une planche de bois : **un fond simple** met le produit en valeur. Évitez les arrière-plans encombrés.`,
          },
        ],
      },
      {
        title: "Mise en pratique",
        lessons: [{ title: "TP : série de 3 photos produit", type: "ASSIGNMENT", minutes: 90 }],
      },
    ],
    assignment: {
      moduleIndex: 1,
      title: "TP : série de 3 photos produit",
      instructions: "Photographiez un même produit selon 3 angles différents (face, trois-quarts, détail) en lumière naturelle, et déposez les 3 images. Expliquez en quelques lignes vos choix de lumière et de fond.",
      rubric: [
        { criterion: "Qualité de la lumière", points: 6, description: "Lumière douce, pas de reflets gênants, ombres maîtrisées" },
        { criterion: "Cadrage et composition", points: 6, description: "Règle des tiers, angles variés et pertinents" },
        { criterion: "Fond et mise en valeur", points: 4, description: "Fond simple, produit lisible" },
        { criterion: "Explication des choix", points: 4, description: "Justification claire" },
      ],
      isProject: true,
    },
    certRequireProjects: true,
  },
  {
    slug: "excel-gestion-quotidienne",
    title: "Excel pour la gestion quotidienne",
    subtitle: "Tableaux, formules et suivi des ventes pas à pas",
    category: "numerique-bureautique",
    trainer: 1,
    level: "INTERMEDIATE",
    price: 15000,
    description:
      "Apprenez à utiliser un tableur (Excel, LibreOffice Calc ou Google Sheets) pour suivre vos ventes, vos stocks et vos dépenses. Formules essentielles, mise en forme, tableaux et graphiques simples, avec des exemples de petites entreprises.",
    objectives: ["Structurer un tableau de suivi", "Utiliser SOMME, MOYENNE, SI et RECHERCHEX", "Créer un graphique simple", "Construire un suivi de stock"],
    prerequisites: ["Avoir accès à un ordinateur ou une tablette"],
    audience: ["Assistants de gestion", "Commerçants", "Étudiants", "Demandeurs d'emploi"],
    modules: [
      {
        title: "Les fondamentaux",
        lessons: [
          {
            title: "Structurer un bon tableau",
            type: "TEXT",
            minutes: 12,
            preview: true,
            content: `## Une ligne = un enregistrement

Dans un tableau de ventes, chaque **ligne** correspond à une vente et chaque **colonne** à une information : date, client, produit, quantité, prix unitaire, montant, mode de paiement.

## Les bonnes pratiques

- Une seule ligne d'en-têtes, sans cellules fusionnées.
- Pas de lignes vides au milieu des données.
- Des formats cohérents : dates en format date, montants en nombre (sans écrire « FCFA » dans la cellule — utilisez le format de nombre).
- Transformez la plage en **Tableau** (Ctrl + T) : les formules et filtres s'étendent automatiquement.`,
          },
          {
            title: "Les formules essentielles",
            type: "TEXT",
            minutes: 20,
            content: `## Calculer un montant

Dans la colonne Montant : \`=D2*E2\` (quantité × prix unitaire).

## Les fonctions de base

- \`=SOMME(F2:F200)\` : total des ventes.
- \`=MOYENNE(F2:F200)\` : panier moyen.
- \`=NB.SI(G2:G200;"Orange Money")\` : nombre de ventes payées par Orange Money.
- \`=SOMME.SI(G2:G200;"Espèces";F2:F200)\` : total encaissé en espèces.

## La condition SI

\`=SI(H2<10;"Réapprovisionner";"OK")\` : alerte quand le stock passe sous 10 unités.

## Rechercher une information

\`=RECHERCHEX(C2;Produits[Nom];Produits[Prix])\` : retrouve automatiquement le prix d'un produit dans une table de référence (dans les versions plus anciennes : RECHERCHEV).`,
          },
          { title: "Quiz : formules Excel", type: "QUIZ", minutes: 10 },
        ],
      },
    ],
    quiz: {
      moduleIndex: 0,
      title: "Quiz : formules Excel",
      questions: [
        {
          type: "SINGLE",
          prompt: "Quelle formule calcule le total des cellules F2 à F50 ?",
          options: ["=TOTAL(F2:F50)", "=SOMME(F2:F50)", "=ADD(F2;F50)", "=F2+F50"],
          correct: [1],
          topic: "Fonction SOMME",
        },
        {
          type: "SINGLE",
          prompt: "Que renvoie =SI(H2<10;\"Réapprovisionner\";\"OK\") si H2 vaut 4 ?",
          options: ["OK", "Réapprovisionner", "4", "Une erreur"],
          correct: [1],
          topic: "Fonction SI",
        },
        {
          type: "SHORT",
          prompt: "Quelle fonction permet de compter les cellules qui respectent une condition ?",
          expected: ["NB.SI", "NBSI", "COUNTIF"],
          topic: "Fonction NB.SI",
        },
      ],
    },
  },
];

export const faqs = [
  { category: "Général", question: "Les formations sont-elles accessibles sur téléphone ?", answer: "Oui. La plateforme est conçue d'abord pour les smartphones Android et fonctionne aussi sur ordinateur et tablette. Vous pouvez l'installer comme une application depuis votre navigateur." },
  { category: "Général", question: "Que se passe-t-il si ma connexion est faible ?", answer: "Activez le mode « faible consommation de données » dans votre profil : les vidéos ne se chargent qu'à votre demande et les images décoratives sont masquées. Votre progression est enregistrée sur votre téléphone en cas de coupure puis synchronisée automatiquement." },
  { category: "Tuteur IA", question: "Le tuteur IA remplace-t-il le formateur ?", answer: "Non. Le tuteur IA vous accompagne 24h/24 pour expliquer, reformuler et vous entraîner, en s'appuyant sur les supports de vos formations. Les formateurs conçoivent les cours, corrigent les travaux importants et valident les certificats." },
  { category: "Tuteur IA", question: "Le tuteur IA fonctionne-t-il sans Internet ?", answer: "Non. Le tuteur IA nécessite une connexion Internet. En revanche, les supports que vous avez téléchargés restent consultables hors ligne." },
  { category: "Paiement", question: "Quels moyens de paiement sont acceptés ?", answer: "Selon les prestataires activés par l'académie : Mobile Money (Orange Money, Moov Money…), Wave là où il est disponible, et carte bancaire. Les moyens exacts s'affichent au moment du paiement." },
  { category: "Paiement", question: "Quand ai-je accès à ma formation après paiement ?", answer: "Dès que le prestataire de paiement confirme la transaction à nos serveurs, en général en quelques secondes. Si le paiement reste « en attente », patientez quelques minutes ou contactez l'assistance avec votre référence de commande." },
  { category: "Certificats", question: "Les certificats sont-ils des diplômes officiels ?", answer: "Non. Nos certificats attestent que vous avez suivi et validé une formation selon les critères fixés par le formateur. Ils ne sont pas des diplômes d'État. Chaque certificat possède un identifiant unique et un QR code vérifiable en ligne." },
  { category: "Compte", question: "Comment supprimer mon compte et mes données ?", answer: "Depuis votre profil, rubrique « Mes données », vous pouvez télécharger vos données et demander la suppression de votre compte. Certaines données de facturation sont conservées le temps exigé par la loi." },
];
