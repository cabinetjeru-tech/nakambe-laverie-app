# DREAD ROYAL — Base de données (PostgreSQL 16 + Prisma 6)

Source de vérité : `apps/api/prisma/schema.prisma` ; migrations : `apps/api/prisma/migrations/`.
**Tous les montants sont des entiers en FCFA.** Les identifiants techniques sont des UUID ; les documents ont un numéro métier lisible et unique (`FAC-2026-000001`).

## 1. Schéma relationnel (vue d'ensemble)

```
Role 1─n User n─1? Staff ─────────────┐
User 1─n Session        User 1─n AuditLog
                                      │
Client 1─n Appointment n─1 Staff      │
Appointment 1─n AppointmentItem n─1 Service n─1 ServiceCategory
Client 1─n Sale 1─n SaleItem ─┬─ n─1 Service
                              ├─ n─1 Product
                              ├─ n─1 LoyaltyPackage
                              ├─ n─1 Staff (coiffeur)
                              └─ 1─1 Commission n─1 CommissionPayout n─1 Staff
Sale 1─n Payment n─1 CashSession 1─n CashMovement
Sale n─1 Appointment (facultatif)
ExpenseCategory 1─n Expense n─1 Supplier ; Expense 1─n SupplierPayment
OtherIncome (autres recettes)
Supplier 1─n Product n─1 ProductCategory ; Product 1─n StockMovement
Supplier 1─n Purchase 1─n PurchaseLine n─1 Product ; Purchase 1─n SupplierPayment
Inventory 1─n InventoryLine
Client 1─n LoyaltyTransaction ; Client 1─n ClientSubscription n─1 LoyaltyPackage ; 1─n SubscriptionUsage
SyncOperation (file hors ligne) ; Setting (paramètres clé/valeur) ; Counter (numérotation)
```

## 2. Tables

### Sécurité
| Table | Rôle | Champs clés |
|---|---|---|
| `Role` | Profil et permissions | `code` unique, `permissions text[]`, `isSystem` |
| `User` | Compte de connexion | `username` unique, `passwordHash` (bcrypt), `roleId`, `staffId` (lien fiche personnel), `active`, `mustChangePassword`, `failedLogins`, `lockedUntil` |
| `Session` | Jetons de rafraîchissement | `tokenHash` (SHA-256), `expiresAt`, `revokedAt` (rotation à chaque usage) |
| `AuditLog` | Journal des opérations | `userId`, `action`, `entity`, `entityId`, `before/after` (JSON), `ip` |
| `Setting` | Paramètres (salon, fidélité, trésorerie initiale) | `key`, `value` JSON |
| `Counter` | Compteurs de numérotation par type et année | incrément atomique `UPSERT … RETURNING` |

### Métier
| Table | Rôle | Points importants |
|---|---|---|
| `Client` | Fiche client | `code` CL-000001 auto, `gender` (homme/femme/garçon/fille), `preferences`, `loyaltyPoints`, `active` (désactivation, jamais suppression) |
| `Staff` | Personnel | fonction, contrat (CDI/CDD/STAGE/PRESTATAIRE/JOURNALIER), salaire, `commissionMode` (SERVICE_DEFAULT/PERCENT/FIXED/NONE), `isStylist` |
| `ServiceCategory` / `Service` | Catalogue de prestations | prix, `priceMax` facultatif, durée, commission (PERCENT/FIXED/NONE), `active` |
| `Appointment` / `AppointmentItem` | Rendez-vous | statut (PENDING, CONFIRMED, IN_PROGRESS, DONE, CANCELLED, NO_SHOW). **Anti double réservation** : contrôle de chevauchement `[startAt, endAt)` par coiffeur dans une transaction sérialisable |
| `Sale` | Facture | `number` unique, `subtotal`, `discount` (+ motif), `loyaltyDiscount`, `total`, `paidAmount`, `refundedAmount`, `balance`, `paymentStatus`, `status` (VALIDATED/CANCELLED + motif/auteur/date), `clientOpId` unique (anti-doublon hors ligne) |
| `SaleItem` | Ligne | type SERVICE/PRODUCT/PACKAGE, coiffeur, `unitCost` figé (coût des ventes) |
| `Payment` | Encaissement / acompte / remboursement | `number` REC-…, `method` (CASH, ORANGE_MONEY, MOOV_MONEY, BANK_TRANSFER, OTHER), `reference`, lien session de caisse |
| `CashSession` / `CashMovement` | Caisse espèces | ouverture, mouvements typés (vente, remboursement, dépense, autre recette, fournisseur, commission, manuel), clôture : théorique, réel, écart, justification (obligatoire si écart ≠ 0) |
| `ExpenseCategory` / `Expense` | Charges | compte SYSCOHADA indicatif, statut payé/partiel/impayé (dette), annulation tracée |
| `OtherIncome` | Autres recettes | location de poste, formation, divers |
| `Commission` | Commission par ligne de prestation | PENDING tant que la vente n'est pas soldée → DUE → PAID ; CANCELLED si la vente est annulée |
| `CommissionPayout` | Règlement | génère automatiquement une dépense « Commissions » |
| `Supplier`, `ProductCategory`, `Product` | Stock | prix d'achat/vente, quantité, seuil, `sellable` (vente) ou fourniture interne |
| `StockMovement` | Historique | type, quantité signée, quantités avant/après, coût, motif |
| `Purchase` / `PurchaseLine` / `SupplierPayment` | Achats fournisseurs | entrée en stock + dette fournisseur jusqu'au règlement |
| `Inventory` / `InventoryLine` | Inventaires | écarts appliqués en mouvements INVENTORY |
| `LoyaltyTransaction` | Points | gain/utilisation/ajustement/annulation, signé |
| `LoyaltyPackage` / `ClientSubscription` / `SubscriptionUsage` | Forfaits mensuels | passages inclus, consommation tracée |
| `SyncOperation` | Opérations hors ligne reçues | `opId` = clé primaire → idempotence ; statut APPLIED/CONFLICT/REJECTED |

## 3. Règles d'intégrité

- Toute opération financière (vente, paiement, remboursement, annulation, dépense, achat, règlement de commission, mouvement de caisse) et tout mouvement de stock s'exécutent dans **une seule transaction**.
- Le stock est décrémenté par `UPDATE … SET quantity = quantity - n WHERE id = … AND quantity >= n` : jamais de stock négatif, même en concurrence.
- Les numéros de documents proviennent de `Counter` (incrément atomique) → uniques et sans trou visible en usage normal.
- Aucune route `DELETE` sur les données financières.
