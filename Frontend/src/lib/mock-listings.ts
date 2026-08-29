import cargo from "@/assets/style-cargo.jpg";
import shirt from "@/assets/style-shirt.jpg";
import halter from "@/assets/style-halter.jpg";
import shorts from "@/assets/pop-shorts.jpg";
import sneakers from "@/assets/pop-sneakers.jpg";
import backpack from "@/assets/pop-backpack.jpg";
import hoodie from "@/assets/pop-hoodie.jpg";
import { CATEGORIES, SIZES } from "@/lib/taxonomy";

export type Measurements = {
  chest?: string;
  waist?: string;
  hips?: string;
  length?: string;
  inseam?: string;
  shoulder?: string;
  sleeve?: string;
};

export type Listing = {
  id: string;
  title: string;
  brand: string;
  category: string;
  gender: "Womens" | "Mens" | "Unisex" | "Kids";
  size: string;
  condition: string;
  color: string;
  value: number; // swap credits
  retailValue?: number;
  images: string[];
  seller: { name: string; rating: number; swaps: number; joined?: string; responseTime?: string };
  location: string;
  postedDaysAgo: number;
  description: string;
  /** Rich detail fields shown on the listing page. */
  material?: string;
  fit?: string;
  style?: string;
  pattern?: string;
  season?: string;
  care?: string;
  measurements?: Measurements;
  tags?: string[];
  quantity?: number;
  shipsFrom?: string;
  shippingDays?: string;
  swapPreferences?: string;
  views?: number;
  saves?: number;
};

export const listings: Listing[] = [
  {
    id: "1", title: "Beige cargo shorts", brand: "Uniqlo", category: "Shorts", gender: "Mens",
    size: "M", condition: "Like new", color: "Beige", value: 22, retailValue: 49,
    images: [cargo, shirt, sneakers],
    seller: { name: "mila.k", rating: 4.9, swaps: 128, joined: "2023", responseTime: "under 2h" },
    location: "Brooklyn, NY", postedDaysAgo: 2,
    description:
      "Barely worn cargo shorts, perfect for summer. Loose fit with deep utility pockets and a reinforced waistband. No stains, snags or tears — kept in a smoke-free home and only worn a handful of times on holiday.",
    material: "Cotton", fit: "Relaxed", style: "Workwear", pattern: "Solid", season: "Summer",
    care: "Machine wash cold, tumble dry low, iron on reverse.",
    measurements: { waist: "82 cm", hips: "104 cm", length: "48 cm", inseam: "23 cm" },
    tags: ["cargo", "utility", "summer", "y2k"], quantity: 1,
    shipsFrom: "Brooklyn, NY", shippingDays: "2–4 days",
    swapPreferences: "Looking for denim shorts or a light overshirt in L.",
    views: 1240, saves: 86,
  },
  {
    id: "2", title: "Light blue linen shirt", brand: "COS", category: "Shirts & Blouses", gender: "Unisex",
    size: "L", condition: "Good", color: "Blue", value: 28, retailValue: 89,
    images: [shirt, halter, cargo],
    seller: { name: "kai.designs", rating: 4.7, swaps: 54, joined: "2022", responseTime: "under 6h" },
    location: "Austin, TX", postedDaysAgo: 5,
    description:
      "Airy 100% linen button-up that breathes in real heat. Boxy cut that works open over a tee or tucked into shorts. Minor fading on the collar, otherwise structurally perfect with all buttons intact.",
    material: "Linen", fit: "Relaxed", style: "Minimal", pattern: "Solid", season: "Spring / Summer",
    care: "Machine wash 30°, line dry, warm iron while damp.",
    measurements: { chest: "116 cm", shoulder: "48 cm", length: "74 cm", sleeve: "62 cm" },
    tags: ["linen", "minimal", "summer"], quantity: 1,
    shipsFrom: "Austin, TX", shippingDays: "3–5 days",
    swapPreferences: "Open to knitwear or a lightweight jacket.",
    views: 890, saves: 51,
  },
  {
    id: "3", title: "Burgundy silk halter", brand: "Reformation", category: "Tops", gender: "Womens",
    size: "S", condition: "Like new", color: "Burgundy", value: 45, retailValue: 148,
    images: [halter, shorts, hoodie],
    seller: { name: "vintage.club", rating: 5.0, swaps: 302, joined: "2021", responseTime: "under 1h" },
    location: "Los Angeles, CA", postedDaysAgo: 1,
    description:
      "100% silk halter with a cowl neck and adjustable tie back. Worn twice to dinner, dry-cleaned after each wear. Comes from a smoke-free, pet-free home and ships with the original garment bag.",
    material: "Silk", fit: "Slim", style: "Minimal", pattern: "Solid", season: "All season",
    care: "Dry clean only. Do not tumble dry.",
    measurements: { chest: "86 cm", waist: "70 cm", length: "52 cm" },
    tags: ["silk", "going out", "occasion"], quantity: 1,
    shipsFrom: "Los Angeles, CA", shippingDays: "1–3 days",
    swapPreferences: "Would love a slip dress or designer knit in S.",
    views: 2310, saves: 198,
  },
  {
    id: "4", title: "Y2K zip-up hoodie", brand: "Nike", category: "Hoodies & Sweatshirts", gender: "Unisex",
    size: "M", condition: "Good", color: "Green", value: 35, retailValue: 79,
    images: [hoodie, sneakers, backpack],
    seller: { name: "riot.thrift", rating: 4.6, swaps: 87, joined: "2023", responseTime: "under 12h" },
    location: "Portland, OR", postedDaysAgo: 3,
    description:
      "Neon green full-zip hoodie with vintage Y2K graphics across the back. Brushed fleece interior, kangaroo pocket, ribbed cuffs. Some softening on the print from wash but no cracking or peeling.",
    material: "Cotton", fit: "Oversized", style: "Y2K", pattern: "Graphic", season: "Autumn / Winter",
    care: "Wash inside out at 30°, do not bleach.",
    measurements: { chest: "112 cm", shoulder: "50 cm", length: "68 cm", sleeve: "64 cm" },
    tags: ["y2k", "streetwear", "sportswear"], quantity: 1,
    shipsFrom: "Portland, OR", shippingDays: "2–4 days",
    swapPreferences: "After a track jacket or a graphic tee bundle.",
    views: 1670, saves: 143,
  },
  {
    id: "5", title: "Metallic mini backpack", brand: "Herschel", category: "Bags", gender: "Unisex",
    size: "S", condition: "Like new", color: "Silver", value: 30, retailValue: 85,
    images: [backpack, sneakers, cargo],
    seller: { name: "loop.studio", rating: 4.8, swaps: 44, joined: "2024", responseTime: "under 4h" },
    location: "Chicago, IL", postedDaysAgo: 7,
    description:
      "Shiny mini backpack that still fits a 13\" laptop, a notebook and daily essentials. Padded adjustable straps, magnetic strap closure and a zipped inner pocket. Interior lining is spotless.",
    material: "Polyester", fit: "Regular", style: "Streetwear", pattern: "Solid", season: "All season",
    care: "Spot clean with a damp cloth.",
    measurements: { length: "38 cm", chest: "28 cm (width)" },
    tags: ["bag", "metallic", "commute"], quantity: 1,
    shipsFrom: "Chicago, IL", shippingDays: "3–5 days",
    swapPreferences: "Happy to swap for a tote or crossbody.",
    views: 640, saves: 37,
  },
  {
    id: "6", title: "Pearlized slip-on sneakers", brand: "Vans", category: "Sneakers", gender: "Womens",
    size: "M", condition: "Good", color: "Black", value: 26, retailValue: 65,
    images: [sneakers, hoodie, shorts],
    seller: { name: "sole.mates", rating: 4.5, swaps: 61, joined: "2022", responseTime: "under 8h" },
    location: "Miami, FL", postedDaysAgo: 4,
    description:
      "Classic slip-ons with a pearlized finish that catches the light. Some honest wear on the outsole tread, uppers and insoles still fresh. Elastic side gores have full stretch.",
    material: "Leather", fit: "Regular", style: "Streetwear", pattern: "Solid", season: "All season",
    care: "Wipe clean, air dry away from direct heat.",
    measurements: { length: "26 cm insole" },
    tags: ["sneakers", "slip on", "everyday"], quantity: 1,
    shipsFrom: "Miami, FL", shippingDays: "2–4 days",
    swapPreferences: "Looking for white low-tops in the same size.",
    views: 980, saves: 64,
  },
  {
    id: "7", title: "Tropical print swim shorts", brand: "Patagonia", category: "Swimwear", gender: "Mens",
    size: "L", condition: "New with tags", color: "Multi", value: 40, retailValue: 95,
    images: [shorts, cargo, halter],
    seller: { name: "green.wardrobe", rating: 4.9, swaps: 152, joined: "2021", responseTime: "under 3h" },
    location: "San Diego, CA", postedDaysAgo: 1,
    description:
      "Never worn, tags still attached. Quick-dry recycled fabric with a mesh liner, elastic drawstring waist and a zipped back pocket. Bought a size too big and missed the return window.",
    material: "Recycled blend", fit: "Regular", style: "Sportswear", pattern: "Print", season: "Summer",
    care: "Rinse after swimming, machine wash cold, line dry.",
    measurements: { waist: "88 cm", length: "44 cm", inseam: "18 cm" },
    tags: ["swim", "holiday", "sustainable"], quantity: 1,
    shipsFrom: "San Diego, CA", shippingDays: "1–3 days",
    swapPreferences: "Interested in technical shorts or a running tee.",
    views: 720, saves: 45,
  },
  {
    id: "8", title: "Washed denim trucker jacket", brand: "Levi's", category: "Jackets & Coats", gender: "Unisex",
    size: "M", condition: "Like new", color: "Blue", value: 55, retailValue: 130,
    images: [shirt, cargo, hoodie],
    seller: { name: "denim.den", rating: 4.8, swaps: 210, joined: "2020", responseTime: "under 2h" },
    location: "Seattle, WA", postedDaysAgo: 6,
    description:
      "Iconic Type III trucker jacket in a gentle mid-wash. Sits perfectly over a hoodie without feeling tight in the shoulders. Original branded buttons, no fraying on the cuffs or hem.",
    material: "Denim", fit: "Regular", style: "Vintage", pattern: "Solid", season: "Spring / Autumn",
    care: "Wash rarely, cold, inside out. Hang dry.",
    measurements: { chest: "108 cm", shoulder: "46 cm", length: "62 cm", sleeve: "63 cm" },
    tags: ["denim", "vintage", "layering"], quantity: 1,
    shipsFrom: "Seattle, WA", shippingDays: "2–5 days",
    swapPreferences: "Trading for a leather jacket or heavy flannel.",
    views: 3050, saves: 264,
  },
];

export const categories = CATEGORIES;
export const sizes = SIZES;
export const sortOptions = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "value-asc", label: "Lowest value" },
  { value: "value-desc", label: "Highest value" },
  { value: "most-saved", label: "Most saved" },
  { value: "most-viewed", label: "Most viewed" },
  { value: "top-rated", label: "Top rated" },
] as const;

export function getListing(id: string) {
  return listings.find((l) => l.id === id);
}
