// Cloudflare Pages Function that proxies the public FlixBus and Ryanair APIs
// (browsers can't call them directly because of CORS). It stores nothing;
// all user settings live in the browser's cookies.
//
//   GET /api/flixbus?from=<cityId>&to=<cityId>&date=YYYY-MM-DD&adults=1[&direct=1]
//   GET /api/flixbus/cities?q=<text>
//   GET /api/ryanair?from=<IATA>&to=<IATA>&date=YYYY-MM-DD&adults=1
//   GET /api/ryanair/airports

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const DAY = 86400;

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const handler = routes[url.pathname.replace(/^\/api\/|\/$/g, '')];
  if (!handler) return json({ error: 'Not found' }, { status: 404 });
  try {
    return await handler(Object.fromEntries(url.searchParams));
  } catch (err) {
    return json({ error: err.message }, { status: err.status || 502 });
  }
}

const routes = {
  'flixbus/cities': async ({ q = '' }) => {
    q = q.trim();
    if (q.length < 2) return json([]);
    const data = await get(`https://global.api.flixbus.com/search/autocomplete/cities?q=${encodeURIComponent(q)}&lang=en&flixbus_cities_only=false`);
    return json(data.map((c) => ({ id: c.id, name: c.name, country: c.country.toUpperCase() })), { maxAge: DAY });
  },

  'ryanair/airports': async () => {
    const data = await get('https://www.ryanair.com/api/views/locate/5/airports/en/active');
    return json(data.map((a) => ({ id: a.code, name: a.name, country: a.country.code.toUpperCase() })), { maxAge: DAY });
  },

  flixbus: async (query) => {
    const { from, to, date, adults } = validate(query, /^[0-9a-f-]{36}$/);
    const [y, m, d] = date.split('-');
    const data = await get('https://global.api.flixbus.com/search/service/v4/search?' + new URLSearchParams({
      from_city_id: from,
      to_city_id: to,
      departure_date: `${d}.${m}.${y}`,
      products: JSON.stringify({ adult: adults }),
      currency: 'EUR',
      locale: 'en',
      search_by: 'cities',
      include_after_midnight_rides: '0',
    }));
    const trips = data.trips
      .flatMap((t) => Object.values(t.results))
      .filter((r) => r.status === 'available' && r.departure.date.startsWith(date))
      .filter((r) => query.direct !== '1' || r.legs.length === 1)
      .map((r) => ({
        price: r.price.total_with_platform_fee ?? r.price.total,
        dep: r.departure.date.slice(0, 16),
        arr: r.arrival.date.slice(0, 16),
        info: `${changes(r.legs.length - 1)} · ${r.duration.hours}h ${r.duration.minutes}m`,
      }));
    const url = 'https://shop.flixbus.com/search?' + new URLSearchParams({
      departureCity: from, arrivalCity: to, rideDate: `${d}.${m}.${y}`, adult: adults, _locale: 'en',
    });
    return json(cheapest(trips, url, query.direct === '1' ? 'No direct buses that day' : 'No buses that day'));
  },

  ryanair: async (query) => {
    const { from, to, date, adults } = validate(query, /^[A-Z]{3}$/);
    const data = await get('https://www.ryanair.com/api/farfnd/v4/oneWayFares?' + new URLSearchParams({
      departureAirportIataCode: from,
      arrivalAirportIataCode: to,
      outboundDepartureDateFrom: date,
      outboundDepartureDateTo: date,
      adultPaxCount: adults,
      currency: 'EUR',
    }));
    const trips = data.fares.map(({ outbound: f }) => ({
      price: f.price.value,
      dep: f.departureDate.slice(0, 16),
      arr: f.arrivalDate.slice(0, 16),
      info: f.flightNumber,
    }));
    const url = 'https://www.ryanair.com/gb/en/trip/flights/select?' + new URLSearchParams({
      adults, teens: 0, children: 0, infants: 0, dateOut: date, dateIn: '', isConnectedFlight: false,
      isReturn: false, discount: 0, promoCode: '', originIata: from, destinationIata: to,
    });
    return json(cheapest(trips, url, 'No flights that day'));
  },
};

function validate({ from = '', to = '', date = '', adults = '1' }, idPattern) {
  const n = Number(adults);
  if (!idPattern.test(from) || !idPattern.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(n >= 1 && n <= 9)) {
    throw Object.assign(new Error('Invalid parameters'), { status: 400 });
  }
  return { from, to, date, adults: n };
}

function cheapest(trips, url, emptyNote) {
  if (!trips.length) return { price: null, note: emptyNote, url };
  const best = trips.reduce((a, b) => (b.price < a.price ? b : a));
  return { ...best, url };
}

function changes(n) {
  return n === 0 ? 'direct' : `${n} change${n > 1 ? 's' : ''}`;
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return res.json();
}

function json(body, { status = 200, maxAge = 0 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
}
