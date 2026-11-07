# AB Firestop — website met beheer

Deze versie bevat de bestaande website in NL, FR en EN en een beveiligd beheer op `/admin/`. De website wordt op Netlify door functies weergegeven; opgeslagen inhoud en foto’s staan in Netlify Blobs en blijven bestaan bij volgende publicaties op hetzelfde Netlify-project.

## Wat werkt na activering

- Aanmelden met het ingestelde beheerdersaccount (standaard `info@abfirestop.be`).
- Teksten en bestaande foto’s per pagina en taal aanpassen.
- Nieuwe projectfoto’s uploaden, kiezen en aan een galerij onderaan een pagina toevoegen.
- Voorbeeld bekijken vóór het opslaan; opslaan publiceert direct.
- Datum en tijd van laatste wijziging bekijken; maximaal twintig eerdere paginaversies terugzetten.
- Paginaweergaven van de laatste dertig dagen en meest bekeken pagina’s bekijken. Dit zijn geen unieke bezoekers. Bekende bots worden genegeerd; adblockers en gemiste aanvragen kunnen de cijfers beperken. De daggrenzen van de statistieken zijn UTC; wijzigingstijden worden in Belgische tijd getoond.
- Foto’s worden opnieuw gecodeerd naar WebP en verkleind; oorspronkelijke metadata worden verwijderd.

Dit is websitebeheer, geen klanten-, offerte- of facturatie-CRM. Elke vertaling wordt apart aangepast. Menuteksten worden per pagina beheerd. Een nieuwe pagina of een nieuw project met een eigen URL aanmaken gebeurt nog in de bronbestanden.

## Belangrijk: niet via Netlify Drop uploaden

Een gewone ZIP/drag-and-drop-publicatie activeert de serverfuncties niet. Publiceer deze versie via Netlify CLI of via een Git-repository gekoppeld aan hetzelfde bestaande Netlify-project. Het domein en de e-mail-DNS hoeven niet te worden aangepast.

Dit pakket bevat de visuele update van 7 november 2026. Controleer vóór publicatie of er daarna nog andere wijzigingen aan de live website zijn gedaan.

## Eerste installatie door de beheerder

1. Pak dit bestand uit en open de projectmap in een terminal. Gebruik Node.js 22 of nieuwer.
2. Installeer de vastgelegde afhankelijkheden: `npm ci`.
3. Voer `npm run password` uit en typ het gewenste beheerderswachtwoord in de verborgen invoer. Het oorspronkelijke wachtwoord staat nergens in dit pakket.
4. Voeg de drie weergegeven waarden toe in Netlify bij **Project configuration → Environment variables** voor de scope **Functions**:
   - `AB_ADMIN_EMAIL`: `info@abfirestop.be`
   - `AB_ADMIN_PASSWORD_HASH`: de gegenereerde hash
   - `AB_SESSION_SECRET`: de gegenereerde willekeurige waarde
5. Voer `npx netlify login` uit en vervolgens `npx netlify link`. Kies het **bestaande** AB Firestop-project met het gekoppelde domein. Maak geen nieuwe site aan.
6. Maak een testpublicatie met `npx netlify deploy --build`. Controleer daar aanmelden, tekst wijzigen, publiceren, foto uploaden, versie terugzetten en de drie talen. Een testpublicatie gebruikt dezelfde inhoudsopslag als productie: gebruik geen vertrouwelijke of ongewenste testinhoud.
7. Publiceer na controle met `npm run deploy`. Het bestaande domein blijft aan hetzelfde project gekoppeld.
8. Open `/admin/` op het domein. Test daarna aanmelden en opslaan nogmaals op productie.

## Beveiliging en beheer

Er staat geen wachtwoord of toegangssleutel in de broncode. Wachtwoorden worden met scrypt gecontroleerd. Sessies worden serverzijdig opgeslagen en verlopen na acht uur. Cookies zijn Secure, HttpOnly en SameSite=Strict. Schrijfacties controleren origin en CSRF-token; aanmelden wordt begrensd per afgeleid IP-kenmerk. Verandering van de wachtwoordhash of sessiesleutel maakt bestaande sessies ongeldig.

De inhoud van pagina’s is openbaar; opgeslagen eerdere versies en statistieken zijn alleen via de beveiligde beheerfunctie beschikbaar. Geüploade foto’s zijn toegankelijk voor iedereen die hun afbeeldingslink heeft. Upload dus uitsluitend foto’s voor publicatie op de website.

Bij een latere bronwijziging die tekstvelden toevoegt of verplaatst moet de inhoudsmigratie worden gecontroleerd; veld-ID’s volgen de oorspronkelijke HTML-structuur. Upload geen oudere statische ZIP over deze versie: die verwijdert de beheerfuncties uit de actieve publicatie. Maak naast de Netlify-deploy ook een back-up van de Blobs-opslag; een download van de statische deploy bevat die opslag niet.

Gebruik en opslag vallen onder de limieten en eventuele kosten van het eigen Netlify-abonnement. Er is geen betaalde upgrade geactiveerd.

## Technische controles

`npm run build` bereidt 60 pagina’s en hun bewerkbare velden voor. `npm test` controleert 17 tests: toegangscontrole, CSRF, aanmelden/afmelden, publiceren, veilige tekstweergave, uploadvalidatie, foto’s verwerken, voorvertoning, terugzetten, statistieken, padvalidatie en gelijktijdige wijzigingen. De tests gebruiken een geïsoleerde opslagadapter, geen productiegegevens.

De functies zijn lokaal gebundeld met Netlify CLI. De paginatitels en het aanmeldscherm zijn visueel gecontroleerd op desktop en in mobiele kaders. De echte Netlify-opslag/authenticatie moet nog in een Netlify-testpublicatie worden gecontroleerd; publicatie is niet automatisch uitgevoerd vanuit dit pakket.

## Bronnen

- Netlify Functions: https://docs.netlify.com/build/functions/get-started/
- Netlify Blobs: https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- Publiceren met CLI: https://cli.netlify.com/commands/deploy/

## Visuele website-update

De binnenpagina’s hebben gecentreerde titels en inleidingen. De compacte taalkeuze is gecorrigeerd voor smalle schermen. Bij het eerste bezoek binnen een tabblad verschijnt het bestaande vlamlogo circa 0,8 seconde. De animatie wordt overgeslagen bij verminderde beweging of geblokkeerde sessieopslag. `Website-direct-upload.zip` bevat uitsluitend de statische website met deze visuele aanpassingen en is geschikt voor de bestaande Netlify-Drop-werkwijze. Die aparte ZIP activeert het dashboard niet. Gebruik die ZIP niet meer nadat het dashboard is geactiveerd.
