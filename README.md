# GPSInfo Voice Lab 0.1.0

Samostatný prototyp na porovnanie hlasových hlásení (bez GPS, bez úprav GPSInfo 0.5.3).

## Ako spustiť na Androide

1. Nahraj `voice-lab.html` do existujúceho GitHub Pages repozitára vedľa `index.html`.
2. Otvor `https://spajdy-web.github.io/Info-GPS/voice-lab.html`.
3. Vyskúšaj „Nasleduje zastávka“ a „Pri zastávke“ (gong + názov).
4. Skús slovenské hlasy dostupné v Chrome; nastav si tempo a hlasitosť.
5. Ak chceš porovnať zvuk s neutrálnym AI TTS, vytvor nahrávku cez svojho poskytovateľa a načítaj ju v sekcii 4. Stránka neposiela nahrávku na server.
6. Pre robotické MP3 ukážky pridaj aj `nasleduje-riviera-zaklad.mp3` a `gong-a-riviera-zaklad.mp3` do rovnakého adresára.

## Ukážky
- `Nasleduje zastávka Riviéra.`
- `Riviéra.` po ding-dong
- `Nasleduje zastávka Matejkova.`
- `Stanica Martin.` namiesto skratky `Stn. Martin`
- `Železničná stanica Vinohrady.` namiesto skratky `ŽST Vinohrady`

## Dôležité

Tento balík NEOBSAHUJE neurónové AI nahrávky. Súčasťou sú offline robotické ukážky ako kontrola výslovnosti (eSpeak), webová skúška hlasov nainštalovaných v Androide a pôvodný zvuk ding-dong. Kvalita/schopnosť offline prehrávania systémového hlasu závisí od Android zariadenia. Prirodzené hlasy dostupné v Azure sú `sk-SK-ViktoriaNeural` a `sk-SK-LukasNeural`; ich použitím cez API vznikajú osobitné technické a licenčné otázky. Nezadávaj API kľúč do verejnej stránky na GitHub Pages.
