// Seed the database with realistic demo listings across every category,
// each with 4 real photos actually uploaded to your Cloudinary account.
//
// Run it from the Backend folder:
//
//   node src/scripts/seedListings.js
//
// Flags:
//   --count=3     listings per category (default 2)
//   --force       reseed even if demo listings already exist
//   --dry-run     print what would be created, touch nothing
//
// What it does:
//   1. Creates a handful of demo seller accounts (or reuses ones from a
//      previous run — matched by email).
//   2. For every category in CATEGORIES, generates N realistic listings
//      (brand, title, description, size, condition, measurements, value).
//   3. For each listing, fetches 4 real stock photos (via Cloudinary's
//      remote-fetch upload — Cloudinary downloads and hosts them, you get
//      real publicIds back, exactly like a normal seller upload) and
//      attaches them.
//   4. Tags every seeded listing "seed-demo" so you can find/wipe them
//      later without touching real user data.
//
// Image source: LoremFlickr (https://loremflickr.com), a free keyword-based
// photo service — not scraped retailer product photography. Quality varies
// listing to listing since it's genuinely random within each keyword set,
// same as any placeholder-image approach.

import "dotenv/config";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { User } from "../models/User.js";
import { Listing, CATEGORIES, SIZES, CONDITIONS, GENDERS } from "../models/Listing.js";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");
const COUNT_ARG = [...args].find((a) => a.startsWith("--count="));
const PER_CATEGORY = COUNT_ARG ? Math.max(1, parseInt(COUNT_ARG.split("=")[1], 10) || 2) : 2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "swapt/listings";
const PRIVATE_ASSETS = String(process.env.CLOUDINARY_PRIVATE_ASSETS ?? "true") === "true";

// ---------------------------------------------------------------------------
// Category metadata — keywords for sourcing on-topic photos, which
// measurement fields make sense, and typical genders.
// ---------------------------------------------------------------------------
const TOP_MEASURE = ["chest", "shoulder", "sleeve", "length"];
const BOTTOM_MEASURE = ["waist", "hips", "inseam", "length"];
const NO_MEASURE = [];

const CATEGORY_META = {
  "T-shirts": { kw: ["tshirt", "fashion"], measure: TOP_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Shirts & Blouses": { kw: ["shirt", "blouse", "fashion"], measure: TOP_MEASURE, genders: ["Mens", "Womens"] },
  "Tops": { kw: ["top", "fashion", "women"], measure: TOP_MEASURE, genders: ["Womens"] },
  "Knitwear & Jumpers": { kw: ["sweater", "knitwear"], measure: TOP_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Hoodies & Sweatshirts": { kw: ["hoodie", "sweatshirt"], measure: TOP_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Dresses": { kw: ["dress", "fashion", "women"], measure: TOP_MEASURE, genders: ["Womens"] },
  "Skirts": { kw: ["skirt", "fashion"], measure: BOTTOM_MEASURE, genders: ["Womens"] },
  "Jeans": { kw: ["jeans", "denim"], measure: BOTTOM_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Trousers": { kw: ["trousers", "pants"], measure: BOTTOM_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Shorts": { kw: ["shorts", "fashion"], measure: BOTTOM_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Bottoms": { kw: ["pants", "fashion"], measure: BOTTOM_MEASURE, genders: ["Unisex"] },
  "Jackets & Coats": { kw: ["jacket", "coat"], measure: TOP_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Outerwear": { kw: ["coat", "outerwear"], measure: TOP_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Blazers & Suits": { kw: ["blazer", "suit"], measure: TOP_MEASURE, genders: ["Mens", "Womens"] },
  "Activewear": { kw: ["activewear", "gym", "sportswear"], measure: TOP_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Swimwear": { kw: ["swimwear", "swimsuit"], measure: TOP_MEASURE, genders: ["Mens", "Womens"] },
  "Loungewear & Sleepwear": { kw: ["loungewear", "pajamas"], measure: TOP_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Shoes": { kw: ["shoes", "footwear"], measure: NO_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Sneakers": { kw: ["sneakers", "shoes"], measure: NO_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Boots": { kw: ["boots", "footwear"], measure: NO_MEASURE, genders: ["Mens", "Womens", "Unisex"] },
  "Bags": { kw: ["handbag", "bag"], measure: NO_MEASURE, genders: ["Womens", "Unisex"] },
  "Accessories": { kw: ["fashion", "accessories"], measure: NO_MEASURE, genders: ["Unisex"] },
  "Jewellery": { kw: ["jewellery", "jewelry"], measure: NO_MEASURE, genders: ["Womens", "Unisex"] },
  "Hats & Caps": { kw: ["cap", "hat"], measure: NO_MEASURE, genders: ["Unisex"] },
  "Sunglasses": { kw: ["sunglasses"], measure: NO_MEASURE, genders: ["Unisex"] },
  "Watches": { kw: ["watch", "wristwatch"], measure: NO_MEASURE, genders: ["Unisex"] },
  "Vintage": { kw: ["vintage", "fashion", "retro"], measure: TOP_MEASURE, genders: ["Unisex"] },
};

const BRANDS = [
  "Zara", "H&M", "Uniqlo", "Mango", "Levi's", "Nike", "Adidas", "Gap",
  "Fabindia", "Allen Solly", "Van Heusen", "W for Woman", "Biba", "Marks & Spencer",
  "Forever 21", "Vero Moda", "Only", "Roadster", "The North Face", "Puma",
  "Ralph Lauren", "Tommy Hilfiger", "Calvin Klein", "Superdry",
];
const COLORS = ["Black", "White", "Navy", "Olive", "Beige", "Maroon", "Grey", "Sky Blue", "Mustard", "Rust", "Charcoal", "Ivory"];
const MATERIALS = ["Cotton", "Denim", "Polyester blend", "Linen", "Wool blend", "Cotton-linen", "Rayon", "Leather", "Cotton jersey"];
const FITS = ["Regular", "Slim", "Relaxed", "Oversized", "Skinny", "Straight"];
const CONDITION_NOTES = {
  "New with tags": "Never worn, tags still attached.",
  "New": "Never worn, no tags.",
  "Like new": "Worn once or twice, looks practically new.",
  "Good": "Gently worn with light signs of use, no flaws.",
  "Fair": "Visibly worn but plenty of life left — priced accordingly.",
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickSome(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function buildListingData(category, meta) {
  const brand = pick(BRANDS);
  const color = pick(COLORS);
  const material = pick(MATERIALS);
  const fit = pick(FITS);
  const condition = pick(CONDITIONS);
  const gender = pick(meta.genders.length ? meta.genders : GENDERS);
  const size = pick(SIZES);
  const singular = category.replace(/s$/, "").replace(" & ", " ");
  const title = `${brand} ${color} ${singular}`.slice(0, 120);
  const value = randInt(8, 60) * 5; // 40..300, in steps of 5
  const retailValue = value + randInt(10, 80) * 5;

  const description = [
    `${brand} ${category.toLowerCase()} in ${color.toLowerCase()}, ${fit.toLowerCase()} fit.`,
    `${material}. ${CONDITION_NOTES[condition]}`,
    Math.random() > 0.5 ? "Smoke-free, pet-free home." : "Open to reasonable swap offers.",
  ].join(" ");

  const measurements = {};
  for (const dim of meta.measure) {
    measurements[dim] = `${randInt(dim === "waist" || dim === "hips" ? 60 : 40, dim === "waist" || dim === "hips" ? 110 : 130)} cm`;
  }

  return {
    title,
    brand,
    description,
    category,
    gender,
    size,
    condition,
    color,
    value,
    retailValue,
    material,
    fit,
    quantity: 1,
    committedQuantity: 0,
    measurements,
    tags: ["seed-demo", category.toLowerCase().replace(/[^a-z]+/g, "-")],
    status: "active",
    moderationStatus: "approved",
  };
}

// ---------------------------------------------------------------------------
// Demo sellers
// ---------------------------------------------------------------------------
const DEMO_SELLERS = [
  { username: "priya.wardrobe", displayName: "Priya Sharma", email: "priya.demo@swapt.local", city: "Mumbai" },
  { username: "rahul.thrifts", displayName: "Rahul Verma", email: "rahul.demo@swapt.local", city: "Delhi" },
  { username: "ananya.closet", displayName: "Ananya Iyer", email: "ananya.demo@swapt.local", city: "Bengaluru" },
  { username: "vikram.style", displayName: "Vikram Nair", email: "vikram.demo@swapt.local", city: "Pune" },
  { username: "sana.swaps", displayName: "Sana Khan", email: "sana.demo@swapt.local", city: "Hyderabad" },
];

async function ensureDemoSellers() {
  const sellers = [];
  for (const s of DEMO_SELLERS) {
    let user = await User.findOne({ email: s.email });
    if (!user) {
      user = new User({
        username: s.username,
        email: s.email,
        displayName: s.displayName,
        provider: "local",
        emailVerified: true,
        phoneVerified: true,
        credits: 500,
        address: s.city,
      });
      await user.setPassword("Demo@12345");
      await user.save();
      console.log(`  created demo seller @${user.username}`);
    }
    sellers.push(user);
  }
  return sellers;
}

// ---------------------------------------------------------------------------
// Images — fetch-upload real stock photos to Cloudinary per listing.
// ---------------------------------------------------------------------------
async function uploadStockPhoto(keywords, seed) {
  const url = `https://loremflickr.com/800/1000/${keywords.join(",")}/all?lock=${seed}`;
  const result = await cloudinary.uploader.upload(url, {
    folder: CLOUDINARY_FOLDER,
    resource_type: "image",
    type: PRIVATE_ASSETS ? "authenticated" : "upload",
    overwrite: false,
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  });
  return { publicId: result.public_id, width: result.width, height: result.height, bytes: result.bytes };
}

async function buildImages(meta, listingIndex) {
  const images = [];
  for (let i = 0; i < 4; i++) {
    // Deterministic-ish lock seed so reruns are reproducible per listing/slot.
    const seed = `${meta.kw.join("")}-${listingIndex}-${i}-${randInt(1, 999999)}`;
    try {
      const img = await uploadStockPhoto(meta.kw, seed);
      images.push(img);
    } catch (err) {
      console.warn(`    image ${i + 1}/4 failed (${err.message}) — continuing`);
    }
  }
  return images;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("--------------------------------------------------------");
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"} | ${PER_CATEGORY} listing(s) per category | ${CATEGORIES.length} categories`);
  console.log("--------------------------------------------------------");

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set — check your .env file.");
    process.exit(1);
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error("Cloudinary credentials are not fully set (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET) — check your .env file.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const existing = await Listing.countDocuments({ tags: "seed-demo" });
  if (existing > 0 && !FORCE) {
    console.log(`Found ${existing} existing demo listings already. Re-run with --force to add more anyway, or delete them first with:`);
    console.log(`  db.listings.deleteMany({ tags: "seed-demo" })`);
    await mongoose.disconnect();
    return;
  }

  const sellers = DRY_RUN ? [] : await ensureDemoSellers();

  let created = 0;
  let imagesUploaded = 0;

  for (const category of CATEGORIES) {
    const meta = CATEGORY_META[category] || { kw: ["fashion"], measure: [], genders: ["Unisex"] };
    console.log(`\n[${category}]`);

    for (let i = 0; i < PER_CATEGORY; i++) {
      const data = buildListingData(category, meta);
      const seller = sellers.length ? pick(sellers) : null;

      if (DRY_RUN) {
        console.log(`  would create: "${data.title}" (${data.size}, ${data.condition}, ${data.value} credits)`);
        continue;
      }

      const images = await buildImages(meta, `${category}-${i}`);
      if (!images.length) {
        console.warn(`  skipping "${data.title}" — no images could be uploaded`);
        continue;
      }
      imagesUploaded += images.length;

      const listing = await Listing.create({
        ...data,
        seller: seller._id,
        images,
      });
      created += 1;
      console.log(`  created: "${data.title}" (${images.length} images, ${data.value} credits) -> ${listing._id}`);
    }
  }

  console.log("\n--------------------------------------------------------");
  console.log(DRY_RUN
    ? `Dry run complete. Would have created listings across ${CATEGORIES.length} categories.`
    : `Done. Created ${created} listings with ${imagesUploaded} images total across ${CATEGORIES.length} categories.`);
  console.log("--------------------------------------------------------");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exitCode = 1;
});