# Titan Status Card

Cartes Lovelace pour Home Assistant : état d'une batterie de stockage (SOC, charge / décharge / veille,
puissance, courbe, compteurs), avec un module **Link** repliable. Deux styles : **blanc et doré** ou **noir et vert**.

> Projet communautaire, non affilié à un fabricant. Aucune marque n'est affichée par défaut :
> le texte en haut à droite se règle avec l'option `brand`.

## Aperçu

Carte repliée, puis avec le module Link déplié (flèche sous la carte), en blanc et doré ou en noir et vert :

![Carte repliée](images/apercu-replie.png)

![Carte avec un Link](images/apercu-link.png)

Plusieurs modules Link peuvent être empilés (ici 5) :

![Carte avec 5 Link](images/apercu-5-links.png)

Blocs Link compacts (`link_compact`), avec un nom à droite (`brand`), au style choisi (`link_palette`) : blanc et doré ou noir et vert, indépendamment de la carte :

![Blocs Link compacts, styles au choix](images/apercu-link-styles.png)

Version 2.0 : entrées PV de la Titan (`pv`), vert de la barre et de la courbe au choix (`green_style`), en blanc et doré ou en noir et vert :

![Titan Status Card 2.0, styles blanc et noir](images/apercu-v2-blanc-noir.png)

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

## Éditeur visuel

La carte se configure aussi **sans YAML** : ajoute-la depuis le sélecteur de cartes (« Titan Status Card »), ou ouvre ta carte puis **Modifier**. L'éditeur propose des sections repliables : Général, Entités (avec recherche d'entités), Boutons de commande, Entrées PV (onduleurs), Planning de recharge (plages, puissance, SOC cible, position) et Modules Link (jusqu'à 5). Avec l'intégration izypower_titan, choisis le SOC (`…_pile_average`) : la puissance (`…_ac_input_and_output`), l'état (`…_battery_state`) et le mode (`…_working_mode`) sont remplis automatiquement s'ils existent. Chaque champ affiche un exemple de nom d'entité. Les options absentes de l'éditeur (`temps`, `footer`, couleurs…) restent dans le YAML et sont conservées.

## Options principales

| Option | Rôle |
|---|---|
| `name`, `brand` | Nom de la carte, texte en haut à droite (vide par défaut) |
| `palette` | `gold` (défaut) ou `green` |
| `background` | Couleur de fond de la carte (ex. `"#EDE8D0"` pour un beige). Sans cette option, le fond d'origine est conservé |
| `text_color` | Couleur des textes (ex. `"#333333"`). Sans cette option, la couleur d'origine est conservée |
| `border_color` | Couleur des cadres : pastilles et boutons (ex. `"#39ff14"`). Sans cette option, la couleur d'accent est utilisée |
| `gold` / `green` | Couleur d'accent de chaque style |
| `soc_entity` | SOC de la batterie (obligatoire) |
| `power_entity`, `power_charge_positive` | Puissance et son signe (positif = charge par défaut) |
| `state_entity` | Texte d'état (Charging, Discharging, Static…) ; sinon déduit de la puissance |
| `floor_entity` | SOC minimum : barre et pourcentage passent en rouge en dessous |
| `mode_entity`, `mode_labels` | Mode de travail et traduction des libellés |
| `days_entity`, `days_label` | Jours depuis la dernière charge complète |
| `temps` + `show_temps` | Pastilles de température (jusqu'à 4). Dans l'éditeur : champ « Température Titan » en haut de la section Entités |
| `footer` | Jusqu'à 4 compteurs (`label`, `entity`, `unit`, `decimals`) |
| `link` | Module Link repliable (`soc_entity`, `temp_entity`, `cycles_entity`, `infos`) |
| `link_compact` | `true` : tous les blocs Link sont compacts (environ 3 fois moins hauts). Désactivé par défaut. Pour un seul bloc, ajouter `compact: true` dans ce `link` |
| `brand` (dans un bloc `link`) | Petit texte affiché en haut à droite du bloc Link, comme la marque de la carte principale (ex. `brand: MODULE A`) |
| `link_palette` | Style des blocs Link : `gold` (blanc et doré) ou `green` (noir et vert). Par défaut, comme la carte ; permet par exemple des Link noirs sous une carte blanche. Pour un seul bloc, `palette` dans ce `link` |
| `green_style` | `fluo` (vert vif `#39ff14`) ou `normal` (vert plus doux, par défaut) : règle uniquement le vert de la **barre de charge** (y compris barre pleine) et de la **courbe**, en clair comme en sombre, et dans les blocs Link. La bande de gauche, les chiffres et les cadres gardent leur couleur. Un choix explicite l'emporte sur `bar_colors`, `bar_colors_dark` et `curve_color`. Aussi disponible sur la carte Link seule |
| `link_collapsible` | `false` supprime la flèche : les blocs Link sont toujours affichés. Repliables par défaut |
| `link_show_bar` | `false` masque la barre de charge/décharge des blocs Link (affichée par défaut). Pour un seul bloc, ajouter `show_bar: false` dans ce `link` |
| `link_open` | `true` : les blocs Link sont ouverts au départ (ensuite, le dernier choix de l'appareil est mémorisé) |
| `controls` | Boutons dans l'en-tête pour commander des interrupteurs (`switch`, `input_boolean`, `light`) : `entity`, `label`, `icon`, `confirm` |
| `alarm_entity` | Capteur d'alarme (ex. `sensor.izypower_titan_titan_alarm`). Ajoute à côté des boutons de commande une pastille grisée ; elle passe au **rouge clignotant** si une alarme est active ou s'est produite pendant les dernières `alarm_hours` heures (24 par défaut). Les états « No Alarm », « Unknown », « unavailable »… sont ignorés (ajoutez d'autres états à ignorer avec `alarm_ignore: [...]`). Survol = texte de l'alarme. **Un clic sur la pastille rouge l'acquitte** (elle redevient grise et ne se rallume que pour une nouvelle alarme ; mémorisé dans le navigateur) ; un clic sur la pastille grise ouvre la fiche de l'entité. `alarm_icon` pour changer l'icône |
| `planning` | Section repliable « Planning de recharge » : interrupteur, plages horaires, puissance et SOC cible (voir ci-dessous) |
| `labels`, `bar_colors`, `bar_colors_dark`, `curve_color` | Libellés et couleurs. `bar_colors.full` (optionnel) règle la couleur de la barre quand la batterie est pleine (par défaut, celle de `charge`) |
| `show_eta` | `false` masque l'horloge / heure estimée en haut à gauche (affichée par défaut) |
| `pv` | Entrées PV (onduleurs) de la Titan, jusqu'à 4, affichées en pastilles sous les kWh : `- entity: sensor.…_dc_input_power_1` (option `label` pour changer « P1 »). L'éditeur les remplit tout seul quand tu choisis le SOC |
| `show_pv` | `false` masque les pastilles PV sans effacer les entités (affichées par défaut dès qu'`pv` est renseigné) |
| `pv_position` | `right` affiche les entrées PV à droite, avec les autres pastilles (par défaut : `left`, sous les kWh) |
| `pv_dropdown` | `true` : les entrées PV sont dans un petit menu déroulant « PV » (flèche), à gauche comme à droite. Le dernier choix est mémorisé sur l'appareil. `pv_open: true` pour l'ouvrir au départ |
| `eta_hide_idle` | L'heure estimée se masque automatiquement quand la batterie est en veille. `false` pour la garder toujours visible (affichée par défaut `--:--`) |
| `show_label` | `false` masque le texte vertical à gauche (VEILLE, CHARGE…). Affiché par défaut |

Boutons de commande (par exemple LED et mode hors réseau) dans l'en-tête de la carte : icônes seules sur écran étroit, avec leur nom sur écran large. `confirm: true` demande un second appui avant d'agir, et `controls_position: bottom` les place en rangée sous la carte :

```yaml
controls:
  - {entity: switch.ma_batterie_leds, label: LED}
  - {entity: switch.ma_batterie_off_grid, label: Off-grid, confirm: true}
```

### Planning de recharge

Section repliable sous la carte (la flèche « Planning de recharge ») : un interrupteur Activé / Désactivé / En cours, des plages horaires modifiables, la puissance et le SOC cible avec des boutons + et −.

Aperçu : replié, puis déplié (section placée au-dessus de la Titan avec `position: top`).

![Planning replié](images/planning-replie.png)

![Planning déplié](images/planning-deplie.png)

Au-dessus de la puissance limite (800 W par défaut), un avertissement s'affiche :

![Avertissement au-dessus de 800 W](images/planning-avertissement.png)

La section se place sous la Titan (par défaut) ou au-dessus (`position: top`), avec ou sans module Link :

![Planning sous la Titan](images/planning-position-bas.png)

![Planning au-dessus de la Titan](images/planning-position-haut.png)

**La carte ne fait que lire et écrire des entités : la recharge elle-même est pilotée par des automatisations.** Elles sont fournies dans [`planning/planning_recharge.yaml`](planning/planning_recharge.yaml) (batteries Izypower Titan avec l'intégration [izypower_titan](https://github.com/khirale/izypower_titan)). Le planning est **manuel** : tu l'actives toi-même. À l'heure de début, la batterie passe en RealTime, règle la puissance et le SOC cible, puis lance la charge. À la fin (heure de fin ou SOC atteint), l'action choisie s'exécute : **Standby** (par défaut : la charge s'arrête et la Titan reste en RealTime) ou **Self-consumed** (retour à l'autoconsommation). Le planning se coupe ensuite : il faut le réactiver à la main.

> Après un Standby, la batterie ne se recharge plus avec le solaire tant que tu n'as pas choisi un autre mode. Choisis « Self-consumed » comme action de fin si tu veux revenir à l'autoconsommation automatiquement.

> ⚠️ La recharge se fait sur le réseau. Teste d'abord à faible puissance (500 W) en surveillant la batterie. Utilisation à tes risques.
>
> ⚠️ **AVERTISSEMENT** : suivant ta configuration, les limites de sécurité par défaut sont **charge max 800 W** et **décharge max 800 W**. Modifier ces valeurs peut endommager ton matériel. La carte affiche cet avertissement dès que la puissance de recharge dépasse 800 W (réglable avec `power_warn`, personnalisable avec `power_warn_text`).

Installation du planning :

1. Dans `configuration.yaml`, vérifie que les paquets sont activés :
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
2. Copie `planning/planning_recharge.yaml` dans `/config/packages/`.
3. Ouvre le fichier et modifie **uniquement le bloc « RÉGLAGES À ADAPTER »** (4 lignes, dans la première automatisation) : capteur de SOC, capteur `working_mode` de ta Titan principale, puissance AC totale des batteries (positive en charge) et service de notification. Rien d’autre à changer. Vérifie que les entités `number.cluster_*` et `button.cluster_*` existent chez toi.
4. Redémarre Home Assistant. Règle les heures, la puissance et le SOC cible dans les entrées créées.
5. Ajoute la section à la carte de ta Titan principale (une seule carte, car le planning commande tout le cluster) :

```yaml
planning:
  name: Planning de recharge          # facultatif
  enable_entity: input_boolean.planning_recharge_actif
  active_entity: input_boolean.planning_recharge_en_cours   # facultatif : affiche « En cours »
  slots:                               # jusqu'à 4 plages
    - {label: Nuit, start: input_datetime.planning_recharge_debut_nuit, end: input_datetime.planning_recharge_fin_nuit}
    - {label: Jour, start: input_datetime.planning_recharge_debut_jour, end: input_datetime.planning_recharge_fin_jour}
  power_entity: input_number.planning_recharge_puissance
  soc_entity: input_number.planning_recharge_soc_cible
  power_warn: 800                      # facultatif : seuil (W) de l'avertissement, 800 par défaut
  position: top                        # facultatif : section au-dessus de la Titan (par défaut : en dessous)
  end_entity: input_select.planning_recharge_fin   # facultatif : choix de l'action de fin
```

La section n'apparaît que si `planning` est présent : sans cette option, la carte est inchangée. Les heures peuvent être des `input_datetime` (heure seule) ou des entités `time` ; la puissance et le SOC, des `input_number` ou `number`.

`link` accepte aussi une **liste** pour plusieurs modules Link sous la même carte :

```yaml
link:
  - {name: Link 1, soc_entity: sensor.link1_soc, temp_entity: sensor.link1_temperature, cycles_entity: sensor.link1_cycles}
  - {name: Link 2, soc_entity: sensor.link2_soc, temp_entity: sensor.link2_temperature, cycles_entity: sensor.link2_cycles}
```

Le Link se déplie avec la flèche sous la carte ; le choix est retenu sur chaque appareil.
La carte `custom:titan-link-card` existe aussi seule (mêmes options `soc_entity`, `temp_entity`, `cycles_entity`), plus `compact: true` pour un affichage réduit, `palette: green` (noir et vert), `background`, `text_color` et `border_color` ; tout est aussi dans l'éditeur visuel).

## Version 2.2.0

- Nouvelle pastille d'alarme (`alarm_entity`) : grisée au repos, rouge et clignotante si une alarme est active ou s'est déclenchée dans les dernières 24 h (`alarm_hours`) ; un clic l'acquitte (après une coupure de courant, par exemple). Détection par l'historique du capteur ; les passages par « indisponible » (redémarrage routeur…) ne comptent pas. Champ « Capteur d'alarme » dans l'éditeur, pré-rempli automatiquement.

## Version 2.1.2

- Boutons de commande (`controls`) sans `label` : dans l'en-tête, ils restent une simple icône (plus de nom d'entité très long qui déborde sur le titre et la marque) ; en bas de carte, le nom de l'entité s'affiche, coupé avec « … » s'il est trop long. Un `label` court (`LED`, `Off-grid`…) reste le plus propre pour afficher du texte.

## Version 2.1.1

- Blocs Link sous une Titan : la bande de gauche est d'une seule couleur, identique au bas de la bande de la Titan, sans rupture de vert entre les deux ni entre deux Link.

## Version 2.1

- Blocs Link compacts (`link_compact`) : la bande de gauche a la même largeur que celle de la Titan, et les textes sont alignés avec ceux de la Titan. La hauteur ne change pas.

## Version 2.0

- Le **cercle d'état** (`show_ring`) est supprimé : l'état (CHARGE, DÉCHARGE, VEILLE) est déjà écrit sur la bande de gauche. Si ta configuration contient encore `show_ring`, l'option est simplement ignorée (l'éditeur visuel la retire à la prochaine sauvegarde).
- Tout le reste est inchangé : tes cartes continuent de fonctionner sans modification.

## Licence
MIT
