# Rapport — catalogue « Sismicité depuis 2006 »

*Généré le 12/11/2026 à 13:27 UTC par `pipeline/fetch_recent_catalogue.py`.*

Période : 01/01/2006 → 12/11/2026. Zone : 20–38 °N, 18 °W–1 °E.

## Volumes

- EMSC : 49251 séismes ; USGS : 1318
- Doublons EMSC/USGS fusionnés (≤ 20 s et ≤ 50 km, EMSC prioritaire) : 1216
- **Total : 49353** séismes → `data/catalogue/recent_2006.csv`
- dont îles Canaries : 13583 (signalés dans `remarques`, à écarter des statistiques « Maroc »)

**Par année (EMSC)** : 2006 : 628, 2007 : 2652, 2008 : 2664, 2009 : 2390, 2010 : 2421, 2011 : 2571, 2012 : 384, 2013 : 337, 2014 : 233, 2015 : 322, 2016 : 518, 2017 : 300, 2018 : 278, 2019 : 383, 2020 : 1081, 2021 : 14682, 2022 : 5939, 2023 : 3326, 2024 : 2705, 2025 : 2485, 2026 : 2952

## Qualité

- Sans magnitude : 15 ; sans profondeur : 0
- Types de magnitude : ml 46277, mb 1609, md 784, m 628, mw 20, ? 16, mblg 14, ms 4, mwr 1
- Agences d'origine (EMSC) : MDD 21519, EMSC 17064, IGN 8439, INMG 1542, CNRST 551, IPMA 51, CNRM 37, ALG 37, NEIC 10, GFZ 1
- Classes de profondeur : shallow 48746, intermediate 604, deep 3

## À savoir

- Catalogue **complet** (répliques comprises), contrairement au catalogue de référence 1045–2005 (déclusterisé).
- Magnitudes de types différents (ml, mb, mbLg, Mw…) : elles ne sont pas converties en Mw ici.
- La forte hausse des petits séismes au fil des ans reflète surtout la densification des réseaux.
