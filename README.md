# Titan Status Card

Cartes Lovelace pour Home Assistant : état d'une batterie de stockage (SOC, charge / décharge / veille,
puissance, courbe, compteurs), avec un module **Link** repliable. Deux styles : **blanc et doré** ou **noir et vert**.

> Projet communautaire, non affilié à un fabricant. Aucune marque n'est affichée par défaut :
> le texte en haut à droite se règle avec l'option `brand`.

## Installation

### Avec HACS (dépôt personnalisé)
1. HACS → menu ⋮ → **Dépôts personnalisés**.
2. Ajoute l'adresse de ce dépôt, type **Tableau de bord** (*Dashboard*).
3. Installe **Titan Status Card**, puis recharge la page en vidant le cache.

### À la main
1. Copie `titan-status-card.js` dans `/config/www/`.
2. Paramètres → Tableaux de bord → ⋮ → **Ressources** → ajoute `/local/titan-status-card.js` (type *Module JavaScript*).

## Exemple

```yaml
type: custom:titan-status-card
name: Titan
brand: MA MAISON            # facultatif, texte en haut à droite
palette: gold               # gold (blanc et doré) ou green (noir et vert)
soc_entity: sensor.ma_batterie_soc
power_entity: sensor.ma_batterie_puissance   # positif = charge
state_entity: sensor.ma_batterie_etat        # Charging / Discharging / Static
floor_entity: number.soc_minimum
mode_entity: sensor.ma_batterie_mode
days_entity: sensor.jours_depuis_charge_complete
show_temps: true
temps:
  - label: 🌡️
    entity: sensor.ma_batterie_temperature
footer:
  - {label: IN, entity: sensor.energie_chargee_jour}
  - {label: OUT, entity: sensor.energie_dechargee_jour}
  - {label: CYCLES, entity: sensor.cycles, decimals: 0}
link:                       # module repliable sous la carte (facultatif)
  name: Link
  floor_entity: number.soc_minimum
  soc_entity: sensor.link_soc
  temp_entity: sensor.link_temperature
  cycles_entity: sensor.link_cycles
```

Seul `soc_entity` est obligatoire.

## Options principales

| Option | Rôle |
|---|---|
| `name`, `brand` | Nom de la carte, texte en haut à droite (vide par défaut) |
| `palette` | `gold` (défaut) ou `green` |
| `gold` / `green` | Couleur d'accent de chaque style |
| `soc_entity` | SOC de la batterie (obligatoire) |
| `power_entity`, `power_charge_positive` | Puissance et son signe (positif = charge par défaut) |
| `state_entity` | Texte d'état (Charging, Discharging, Static…) ; sinon déduit de la puissance |
| `floor_entity` | SOC minimum : barre et pourcentage passent en rouge en dessous |
| `mode_entity`, `mode_labels` | Mode de travail et traduction des libellés |
| `days_entity`, `days_label` | Jours depuis la dernière charge complète |
| `temps` + `show_temps` | Pastilles de température |
| `footer` | Jusqu'à 4 compteurs (`label`, `entity`, `unit`, `decimals`) |
| `link` | Module Link repliable (`soc_entity`, `temp_entity`, `cycles_entity`, `infos`) |
| `labels`, `bar_colors`, `bar_colors_dark`, `curve_color` | Libellés et couleurs |
| `show_ring` | Cercle d'état à droite (désactivé par défaut) |

Le Link se déplie avec la flèche sous la carte ; le choix est retenu sur chaque appareil.
La carte `custom:titan-link-card` existe aussi seule (mêmes options `soc_entity`, `temp_entity`, `cycles_entity`).

## Licence
MIT
