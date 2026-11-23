# Installeren via GitHub en Cloudflare Pages

Deze handleiding hoort bij `giannismarleotech/ab-firestop`. De bestaande website blijft actief terwijl de nieuwe versie wordt voorbereid. Er wordt nergens automatisch een domein of mailrecord gewijzigd.

## 1. GitHub koppelen

1. Open [Cloudflare](https://dash.cloudflare.com/), **Workers & Pages** en kies een **Pages**-project.
2. Kies **Import an existing Git repository / Connect to Git**, meld aan bij GitHub en selecteer `giannismarleotech/ab-firestop`.
3. Gebruik de instellingen hieronder. Kies geen Workers-only project en geen losse upload als je automatische publicaties vanuit GitHub wilt.

| Instelling | Invoer |
| --- | --- |
| Projectnaam | bijvoorbeeld `ab-firestop` — beschikbaarheid bepaalt het uiteindelijke adres |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build:cloudflare` |
| Build output directory | `dist/cloudflare` |
| Root directory | leeg |
| Build environment variable | `NODE_VERSION` = `22` |
| Functions compatibility date | `2026-07-30` |
| Functions compatibility flag | `nodejs_compat` |

De datum en vlag stel je bij de **Functions / Runtime**-instellingen in. Herpubliceer als je die pas na de eerste deployment instelt. Gebruik vervolgens het daadwerkelijk door Cloudflare getoonde `*.pages.dev`-adres.

Er staat bewust geen productie-`wrangler.jsonc` met verzonnen account- of database-ID's in deze repository. De Cloudflare-projectinstellingen zijn de bron voor de bindings. Alleen een voorbeeldbestand is beschikbaar in `cloudflare/wrangler.example.jsonc`; neem dat niet ongewijzigd over.

## 2. Database en foto-opslag

1. Maak onder **Storage & databases → D1** een database, bijvoorbeeld `ab-firestop-cms`.
2. Open de SQL-console en voer de volledige inhoud van [`cloudflare/schema.sql`](../cloudflare/schema.sql) uit. Dit maakt de lege tabel en index aan; bestaande inhoud wordt niet verwijderd.
3. Maak onder **R2 Object Storage** een privébucket, bijvoorbeeld `ab-firestop-media`. Laat openbare toegang uit. Activering van R2 kan betaalgegevens vragen; controleer Cloudflare's voorwaarden in het eigen account.
4. Open **Pages-project → Settings → Bindings** en voeg exact deze namen toe:

| Type | Variable name | Resource |
| --- | --- | --- |
| D1 database | `DB` | de zojuist gemaakte D1-database |
| R2 bucket | `MEDIA` | de zojuist gemaakte privébucket |

Gebruik voor **Production** de productieopslag. Koppel preview-branches niet aan de productiegegevens of productiesecrets. Voor dashboardtests op een preview maak je afzonderlijke testresources.

Zonder `DB` kan de oorspronkelijke openbare website al weergegeven worden. Zodra `DB` is gekoppeld, zijn een uitgevoerd schema en de `MEDIA`-binding vereist. Bij een opslagfout wordt geen verouderde inhoud als succesvol gepubliceerde versie getoond.

## 3. Beheeraccount activeren

Open de repository lokaal in een terminal en voer uit:

```sh
npm ci
npm run password:cloudflare
```

Kies een nieuw wachtwoord van minimaal 12 tekens; de invoer blijft verborgen. Het commando toont de waarden voor:

- `AB_ADMIN_EMAIL` — `info@abfirestop.be`
- `AB_ADMIN_PASSWORD_HASH` — de gegenereerde hash
- `AB_SESSION_SECRET` — de gegenereerde geheime sessiesleutel

Voeg de drie toe bij **Pages-project → Settings → Variables and Secrets**, voor **Production**. Gebruik voor hash en sessiesleutel **Secret / Encrypt**. Zet het gewone wachtwoord nooit in GitHub, broncode of een buildbestand. De backend accepteert ook het bestaande scrypt-hashformaat, maar met een nieuwe sessiesleutel worden oude sessies ongeldig.

Herpubliceer vervolgens de laatste commit. Open `https://JOUW-PROJECT.pages.dev/admin/` en meld aan. `/api/health` geeft `{"ready":true}` wanneer de opslag en beheersecrets bereikbaar zijn. Een succesvolle healthcheck vervangt de inhoudelijke tests hieronder niet.

Voor de volledige dynamische website en het dashboard is Workers Paid de aanbevolen productie-instelling; de Free CPU-limiet is slechts 10 ms per verzoek. Deze voorbereiding activeert geen betaald abonnement. Test inloggen op de gekozen Cloudflare-limieten: de bestaande scrypt-wachtwoordcontrole kost meer CPU dan een statische pagina. Als Cloudflare `exceeded CPU time` meldt, is een passend Workers-plan/CPU-limiet nodig; verzwak het wachtwoordalgoritme niet.

## 4. Bestaande inhoud uit Netlify meenemen

Nieuwe dashboardteksten, geüploade foto's, versies en statistieken staan in **Netlify Blobs**. De oorspronkelijke foto's en teksten staan al in de repository.

1. Pauzeer wijzigingen in het oude dashboard tijdens de uiteindelijke export.
2. Voer lokaal uit:

```sh
npm run build:cloudflare
npm run backup:netlify
```

Het exportprogramma vraagt het Netlify **Project ID** en een persoonlijk toegangstoken met toegang tot dit project. Het token blijft verborgen. Gebruik alleen het project van AB Firestop. De export staat in de genegeerde map `.private-backups/`; deel of commit hem niet. Sessies, wachtwoorden en rate-limitdata worden niet meegenomen. Bezoekcijfers zijn een momentopname per record.

3. Maak een importplan met het werkelijk aangemaakte bestandsadres:

```sh
npm run import:cloudflare -- .private-backups/AB-FIRESTOP-BACKUP.json
```

Dit commando **bereidt bestanden voor en voert geen online import uit**. Het valideert inhoud, vorige versies, foto's en verwijzingen. Het plan bevat SQL, foto's, metadatabestanden en een eigen `LEESMIJ` met de precieze uploadcommando's voor een **lege** D1-database en **lege** R2-bucket. Voer die instructies volledig uit voordat je het nieuwe dashboard gaat bewerken. D1 weigert bestaande inhoud te overschrijven. R2-uploadcommando's hebben die bescherming niet: gebruik daarom een nieuw, gecontroleerd leeg bucket.

De SQL kan meer dan één uploadstap nodig hebben; gebruik de instructies uit het gegenereerde plan en voer geen losse delen over bestaande productiegegevens uit. De pagina- en foto-URL's blijven werken, ook wanneer opgeslagen foto's nog een oude `/.netlify/functions/media`-URL hebben. Die URL wordt op Cloudflare lokaal afgehandeld en maakt geen verbinding met Netlify.

Bewaar de export als privéback-up. Verwijder de Netlify-opslag pas na vergelijking en akkoord op de nieuwe inhoud.

## 5. Controleren vóór het domein omgaat

Controleer op het `pages.dev`-adres:

- Startpagina en enkele detailpagina's in NL, FR en EN, op mobiel en desktop.
- Inloggen en uitloggen op `/admin/`.
- Een kleine tekstwijziging opslaan, op de openbare pagina bekijken en via versiegeschiedenis terugzetten.
- Een foto toevoegen, op een pagina kiezen, opslaan en weer verwijderen uit die pagina.
- Bestaande geïmporteerde foto's, teksten, vorige versies en statistieken vergelijken met Netlify.
- Een pagina bezoeken en daarna de paginaweergaven in het dashboard controleren.

GitHub **Actions → Website controleren en downloaden** voert ook automatische tests uit en bewaart een installatiepakket bij een geslaagde uitvoering. Die tests wijzigen geen productiegegevens. Publicatie vanuit GitHub naar Cloudflare gebeurt via de Git-koppeling uit stap 1.

## 6. abfirestop.be koppelen — met behoud van Exchange

Begin pas hiermee nadat de nieuwe website werkt. Er is verschil tussen het hoofddomein en `www`:

| Gewenst adres | Wat Cloudflare Pages vereist |
| --- | --- |
| `www.abfirestop.be` | Eerst toevoegen bij **Pages → Custom domains**; daarna bij de huidige DNS-provider alleen `www` als CNAME naar het echte `*.pages.dev`-adres zetten. De nameservers kunnen bij Vimexx blijven. |
| `abfirestop.be` zonder `www` | Het domein als zone in hetzelfde Cloudflare-account toevoegen en de nameservers naar Cloudflare verhuizen. Eerst alle bestaande mail- en verificatierecords volledig overnemen en controleren. |

Ga voor een nameserververhuizing niet af op automatische DNS-detectie alleen. Vergelijk de huidige werkende Exchange-MX, SPF, DKIM-selectors, DMARC, autodiscover en overige verificatierecords met de nieuwe zone. Bewaar een export van de huidige DNS. E-mailhostnamen horen op **DNS only**, niet via de HTTP-proxy. Er mogen geen twee SPF-records op het hoofddomein ontstaan.

Bij de `www`-route kan het hoofddomein via de bestaande hosting een HTTPS-doorverwijzing naar `www` krijgen. Die doorverwijzing moet apart werken voordat Netlify wordt afgesloten. Gebruik voor Cloudflare Pages geen willekeurig A-record of een Netlify-IP.

Deze codevoorbereiding doet geen van deze DNS-wijzigingen. Na de omzetting: HTTPS, website én inkomende/uitgaande Exchange-mail testen. Houd de oude hosting beschikbaar voor terugval tot alles is gecontroleerd.

## Lokaal ontwikkelen

`npm run dev:cloudflare` bouwt de website, maakt een genegeerde `wrangler.local.jsonc`, initialiseert alleen de lokale D1-database en start Wrangler met lokale D1/R2-opslag. Zet lokale beheersecrets vooraf in `.dev.vars` (genegeerd door Git). De nul-ID in de gegenereerde lokale configuratie is een lokale test-ID, geen productie-ID. Het commando overschrijft deze lokale configuratie bij elke start; gebruik een anders genoemd bestand voor eigen configuraties.

Gebruik de lokale configuratie nooit voor een remote deployment. Tests draaien met aparte tijdelijke opslag en hebben geen Cloudflare-login nodig.

## Officiële documentatie

- [Pages GitHub-integratie](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)
- [Pages Functions en bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Advanced mode met _worker.js](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Eigen domein en nameservers](https://developers.cloudflare.com/pages/configuration/custom-domains/)
- [Workers-limieten](https://developers.cloudflare.com/workers/platform/limits/)
