// ---- Regional price model ---------------------------------------------------
// Base assumption: a 6-piece McNugget costs $5.00 nationally.
// We estimate a local 6-piece price from the ZIP code. This is an ESTIMATE,
// derived from broad regional price tiers, not live store data.
const NATIONAL_6PC = 5.00;

// Broad region by first ZIP digit: { name, sixPiece }
const REGIONS = {
  '0': { name: 'New England / N.J.',    price: 5.49 },
  '1': { name: 'New York / Pennsylvania', price: 5.49 },
  '2': { name: 'Mid-Atlantic',          price: 5.19 },
  '3': { name: 'Southeast',             price: 4.79 },
  '4': { name: 'Great Lakes',           price: 4.79 },
  '5': { name: 'Upper Midwest',         price: 4.69 },
  '6': { name: 'Central Plains',        price: 4.89 },
  '7': { name: 'South Central',         price: 4.89 },
  '8': { name: 'Mountain West',         price: 5.19 },
  '9': { name: 'West Coast',            price: 5.69 },
};

// Metro overrides by 3-digit ZIP prefix (pricier or notably cheaper areas).
const METROS = {
  '100': { name: 'Manhattan, NY',   price: 6.49 },
  '101': { name: 'Manhattan, NY',   price: 6.49 },
  '102': { name: 'Manhattan, NY',   price: 6.49 },
  '103': { name: 'Staten Island, NY', price: 6.19 },
  '104': { name: 'Bronx, NY',       price: 6.19 },
  '111': { name: 'Queens, NY',      price: 6.29 },
  '112': { name: 'Brooklyn, NY',    price: 6.29 },
  '070': { name: 'Newark, NJ',      price: 5.99 },
  '071': { name: 'Northern N.J.',   price: 5.99 },
  '021': { name: 'Boston, MA',      price: 5.99 },
  '022': { name: 'Boston, MA',      price: 5.99 },
  '200': { name: 'Washington, DC',  price: 5.99 },
  '606': { name: 'Chicago, IL',     price: 5.49 },
  '300': { name: 'Atlanta, GA',     price: 4.99 },
  '331': { name: 'Miami, FL',       price: 5.49 },
  '770': { name: 'Houston, TX',     price: 4.89 },
  '787': { name: 'Austin, TX',      price: 4.99 },
  '752': { name: 'Dallas, TX',      price: 4.99 },
  '802': { name: 'Denver, CO',      price: 5.39 },
  '850': { name: 'Phoenix, AZ',     price: 5.09 },
  '891': { name: 'Las Vegas, NV',   price: 5.29 },
  '900': { name: 'Los Angeles, CA', price: 5.99 },
  '902': { name: 'Los Angeles, CA', price: 5.99 },
  '941': { name: 'San Francisco, CA', price: 6.79 },
  '940': { name: 'S.F. Bay Area, CA', price: 6.49 },
  '981': { name: 'Seattle, WA',     price: 6.19 },
  '967': { name: 'Honolulu, HI',    price: 6.49 },
  '968': { name: 'Hawaii',          price: 6.49 },
  '995': { name: 'Anchorage, AK',   price: 6.29 },
  '997': { name: 'Alaska',          price: 6.29 },
};

function estimateFromZip(zip) {
  if (!/^\d{5}$/.test(zip)) {
    return { name: 'National estimate', price: NATIONAL_6PC };
  }
  const three = zip.slice(0, 3);
  if (METROS[three]) return METROS[three];
  const region = REGIONS[zip[0]];
  if (region) return { name: region.name + ' region', price: region.price };
  return { name: 'National estimate', price: NATIONAL_6PC };
}
