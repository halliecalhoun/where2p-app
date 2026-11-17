# Where2P

Where2P helps you find a public restroom while you are out. Search for a city or address, or use your current location. Matching places show up in a list and on a map, including accessible, all-gender, and changing-table details when the listing has them. You can read reviews and leave your own.

![Where2P listing restrooms near Austin, with the same places marked on a map](images/screenshot.png)

Live site: [https://halliecalhoun.github.io/where2p-app/](https://halliecalhoun.github.io/where2p-app/)

GitHub Pages publishes the `master` branch from the repository root. There is no build step for the website. The iOS app is a Capacitor project in `ios/` and is documented in [docs/APP_STORE.md](docs/APP_STORE.md). `npm run build:web` copies this site into `www/` for that app. It does not move the files Pages serves.

## Run it locally

From this folder, start any static file server:

```bash
python3 -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080). Search works right away. "Use my location" needs a browser that can share your location. `localhost` counts as a secure page, so that button works there too.

## Tech stack

- HTML, CSS, and JavaScript, with no framework and no build
- [Leaflet](https://leafletjs.com/) and [OpenStreetMap](https://www.openstreetmap.org/copyright) for the map
- [Refuge Restrooms](https://www.refugerestrooms.org/) for the restroom listings
- [Photon](https://photon.komoot.io/) to turn a city or address into coordinates
- [Firebase Realtime Database](https://firebase.google.com/docs/database) for reviews

Listings are community-submitted, so names and notes vary in quality. Refuge Restrooms and OpenStreetMap both need to be credited, which the page already does.

## Reviews and API keys

The map and the restroom list do not need an API key.

Reviews use the existing Firebase project, `where2p-388bb`. Its web config lives in `js/config.js`. Those values identify the client app. They are not server secrets, and they were already in this repository. Firebase security rules decide who can read and write. The current rules allow anyone to read and write reviews, which is fine for this demo and too open for anything else. Tighten them in the Firebase console if the project stays online.

Nothing else needs to be filled in before the site works. The old Google Maps key no longer returns results because billing is not enabled on that Cloud project. The Yelp API cannot be called from a GitHub Pages site, and the token that used to be hardcoded in `js/app.js` was still accepted by Yelp, so it should be revoked in the [Yelp developer dashboard](https://www.yelp.com/developers/v3/manage_app).

## Authors

Jake Dudum, Darryl Tolentino, Hallie Calhoun, and Adrienne Liu.
