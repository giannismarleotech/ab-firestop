# AB Firestop · GitHub + Cloudflare Pages

Website in Nederlands, Frans en Engels, met een dashboard voor teksten, foto's, eerdere versies en paginaweergaven.

**GitHub bewaart de code; Cloudflare Pages publiceert de website en voert het dashboard uit.** Op de nieuwe hosting zijn Netlify Functions en Netlify Blobs niet nodig. D1 bewaart teksten, versies en sessies; een privé-R2-bucket bewaart nieuwe foto's.

## Start hier

Verbind deze repository met **Cloudflare → Workers & Pages → Pages → Import an existing Git repository**.

| Instelling | Waarde |
| --- | --- |
| Repository | `giannismarleotech/ab-firestop` |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build:cloudflare` |
| Build output directory | `dist/cloudflare` |
| Root directory | leeg / repository-root |
| Build variable | `NODE_VERSION` = `22` |
| Functions compatibility date | `2026-07-30` |
| Functions compatibility flag | `nodejs_compat` |

Daarna eenmalig de database, foto-opslag en beheersecrets instellen. De precieze stappen staan in **[de Cloudflare-handleiding](docs/CLOUDFLARE.md)**. Zonder opslagkoppeling toont de eerste preview de oorspronkelijke website; het dashboard blijft afgesloten totdat het is ingericht.

**Bestaande dashboardwijzigingen staan niet in GitHub.** Neem vóór de overstap de teksten, foto's en statistieken over met het meegeleverde export- en importgereedschap. Laat de huidige website actief totdat de nieuwe versie en `/admin/` gecontroleerd zijn.

## Wat zit erin?

- Alle 60 bestaande pagina's, drie talen, eigen foto's en bestaande vormgeving.
- Cloudflare-backend met beveiligde sessies, CSRF-controle, loginbeperking en versiecontrole bij gelijktijdig opslaan.
- Foto's toevoegen/vervangen, pagina's bewerken, vorige versies terugzetten en paginaweergaven volgen.
- GitHub Actions die het pakket bouwen en de bestaande én Cloudflare-backend testen.
- Privé-export uit Netlify en een gecontroleerd importplan voor D1/R2.

De workflows en scripts wijzigen geen DNS of Exchange-instellingen. Het omzetten van `abfirestop.be` gebeurt pas na de test op het Cloudflare-adres. De handleiding maakt onderscheid tussen het hoofddomein en `www`, omdat Cloudflare Pages daarvoor verschillende DNS-eisen heeft.

## Lokaal controleren

Vereist: Node.js 22.13 of nieuwer.

```sh
npm ci
npm run build:cloudflare
npm test
```

De integratietests gebruiken Cloudflare's lokale runtime met tijdelijke D1- en R2-opslag. Ze benaderen geen productieaccount. De testgebruiker en het testwachtwoord bestaan alleen tijdens de tests.

```sh
npm run dev:cloudflare
```

Voor lokaal dashboardgebruik: maak een genegeerd `.dev.vars`-bestand met de drie beheervariabelen uit `npm run password:cloudflare` — de lokale database wordt bij het starten automatisch ingericht. Zie de handleiding. Commit nooit `.dev.vars`, exports of echte secrets.

| Onderdeel | Locatie |
| --- | --- |
| Pagina's, talen, foto's en beheerinterface | `public/` |
| Cloudflare-worker, opslagadapter en D1-schema | `cloudflare/` |
| Gedeelde beheerlogica | `server/` |
| Cloudflare-build | `scripts/build-cloudflare.mjs` |
| Installatiepakket na build | `dist/cloudflare/` |
| Setup, migratie en domein | [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) |

De bestaande Netlify-variant blijft tijdelijk beschikbaar voor de overgang: `npm run build` en `npm run deploy:netlify`. Oude foto-URL's onder `/.netlify/functions/media` blijven in Cloudflare als lokale alias werken.

## Praktische grenzen

De statistieken meten paginaweergaven, geen unieke bezoekers. Het bestaande contactformulier gebruikt `mailto:`. De browser zet geüploade foto's om naar WebP; de Cloudflare-backend controleert bestandstype, omvang en afmetingen. D1 bewaart maximaal 20 eerdere versies per pagina, binnen de limiet per databaserecord. De nieuwe omgeving moet nog in het eigen Cloudflare-account worden gekoppeld en getest; een geslaagde lokale test is geen productie-deployment.
