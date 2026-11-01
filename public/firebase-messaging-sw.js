// The push worker's old address. Registrations made before OneCamp's one service worker (public/sw.js, asana-12)
// still point here, with the Firebase config in the query, until the app registers the one worker in their place.
// Until then they run it from here: it reads the config from this same address.
importScripts('/sw.js');
