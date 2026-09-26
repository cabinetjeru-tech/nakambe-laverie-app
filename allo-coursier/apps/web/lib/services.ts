import { FileText, PackageCheck, ShoppingBasket, ShoppingCart, type LucideIcon } from 'lucide-react';

export interface ServiceInfo {
  code: 'PARCEL' | 'PICKUP_DROP' | 'ERRAND' | 'PURCHASE';
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
}

export const SERVICES: ServiceInfo[] = [
  { code: 'PARCEL', title: 'Colis & documents', description: 'Envoyez un pli, un colis ou des papiers partout en ville.', icon: FileText, color: 'bg-blue-50 text-brand-light' },
  { code: 'PICKUP_DROP', title: 'Retrait & dépôt', description: 'Un livreur récupère ou dépose un objet pour vous.', icon: PackageCheck, color: 'bg-indigo-50 text-indigo-600' },
  { code: 'ERRAND', title: 'Petites courses', description: 'Donnez votre liste, le livreur fait les courses au marché.', icon: ShoppingBasket, color: 'bg-green-50 text-brand-greenDark' },
  { code: 'PURCHASE', title: 'Achat pour vous', description: 'Le livreur achète un article précis et vous l’apporte.', icon: ShoppingCart, color: 'bg-amber-50 text-amber-600' },
];

export const isPurchaseService = (code: string) => code === 'ERRAND' || code === 'PURCHASE';
