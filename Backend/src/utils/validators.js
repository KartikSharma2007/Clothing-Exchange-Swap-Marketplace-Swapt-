import { z } from "zod";
import { CATEGORIES, CONDITIONS, GENDERS, SIZES } from "../models/Listing.js";

/**
 * Parse a boolean query param the way users expect: the string "false" must
 * actually mean false (z.coerce.boolean() treats "false" as truthy). Also
 * handles "0"/"1"/"" and real booleans.
 */
export const boolParam = (def = false) =>
  z.preprocess(
    (v) => {
      if (v === "false" || v === "0" || v === "") return false;
      if (v === "true" || v === "1") return true;
      return v;
    },
    z.coerce.boolean().optional().default(def),
  );

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-z0-9._]+$/i, "Only letters, numbers, dot and underscore"),
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(8, "At least 8 characters").max(72)
    .regex(/[A-Z]/, "Add an uppercase letter").regex(/[0-9]/, "Add a number"),
  displayName: z.string().trim().max(60).optional(),
  location: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(24).optional(),
  address: z.string().trim().max(200).optional(),
  age: z.coerce.number().int().min(13).max(120).nullable().optional(),
  bio: z.string().trim().max(300).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  password: z.string().min(1).max(72),
  // "Keep me logged in" — off issues a session cookie instead of a 30-day one.
  rememberMe: z.coerce.boolean().optional().default(true),
});

export const contactSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
  topic: z.string().trim().max(60).optional().default(""),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(4000),
});

/** Body measurements a member can save for "likely your fit" matching — numeric only, empty allowed. */
export const measurementsSchema = z.object({
  chest: z.string().trim().max(20).regex(/^\d*\.?\d*$/, "Must be a number").optional().default(""),
  waist: z.string().trim().max(20).regex(/^\d*\.?\d*$/, "Must be a number").optional().default(""),
  hips: z.string().trim().max(20).regex(/^\d*\.?\d*$/, "Must be a number").optional().default(""),
  length: z.string().trim().max(20).regex(/^\d*\.?\d*$/, "Must be a number").optional().default(""),
  inseam: z.string().trim().max(20).regex(/^\d*\.?\d*$/, "Must be a number").optional().default(""),
  shoulder: z.string().trim().max(20).regex(/^\d*\.?\d*$/, "Must be a number").optional().default(""),
  sleeve: z.string().trim().max(20).regex(/^\d*\.?\d*$/, "Must be a number").optional().default(""),
});

export const profileSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  bio: z.string().trim().max(300).optional(),
  location: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(24).optional(),
  address: z.string().trim().max(200).optional(),
  age: z.coerce.number().int().min(13).max(120).nullable().optional(),
  accent: z.enum(["red", "green", "blue", "black"]).optional(),
  heightCm: z.coerce.number().min(80).max(260).nullable().optional(),
  usualSize: z.string().trim().max(10).optional().default(""),
  measurements: measurementsSchema.optional(),
  shippingProfile: z
    .object({
      name: z.string().trim().max(80).optional().default(""),
      line1: z.string().trim().max(120).optional().default(""),
      line2: z.string().trim().max(120).optional().default(""),
      city: z.string().trim().max(80).optional().default(""),
      postal: z.string().trim().max(20).optional().default(""),
      country: z.string().trim().max(60).optional().default(""),
      phone: z.string().trim().max(24).optional().default(""),
    })
    .optional(),
  preferredCarrier: z.string().trim().max(40).optional().default(""),
  shipsWorldwide: z.coerce.boolean().optional(),
  language: z.string().trim().max(10).optional().default(""),
  currency: z.string().trim().max(10).optional().default(""),
  swapAlerts: z.coerce.boolean().optional(),
  emailUpdates: z.coerce.boolean().optional(),
  marketing: z.coerce.boolean().optional(),
  publicProfile: z.coerce.boolean().optional(),
  showLocation: z.coerce.boolean().optional(),
});

export const listingSchema = z.object({
  title: z.string().trim().min(3).max(120),
  brand: z.string().trim().min(1).max(60),
  description: z.string().trim().min(10).max(2000),
  category: z.enum(CATEGORIES),
  gender: z.enum(GENDERS).default("Unisex"),
  size: z.enum(SIZES),
  condition: z.enum(CONDITIONS),
  color: z.string().trim().min(1).max(40),
  value: z.coerce.number().int().min(1).max(10000),
  location: z.string().trim().max(120).optional().default(""),
  meetup: z.coerce.boolean().optional().default(false),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  retailValue: z.coerce.number().min(0).max(10000).optional(),
  material: z.string().trim().max(40).optional().default(""),
  fit: z.string().trim().max(30).optional().default(""),
  style: z.string().trim().max(30).optional().default(""),
  pattern: z.string().trim().max(30).optional().default(""),
  season: z.string().trim().max(40).optional().default(""),
  care: z.string().trim().max(200).optional().default(""),
  shippingDays: z.string().trim().max(40).optional().default(""),
  swapPreferences: z.string().trim().max(200).optional().default(""),
  quantity: z.coerce.number().int().min(1).max(50).optional().default(1),
  tags: z.string().trim().max(120).optional().default(""),
  /** Ordered list of image publicIds — lets the owner reorder / pick the cover. */
  imageOrder: z.preprocess(
    (v) => (typeof v === "string" && v ? v.split(",") : v),
    z.array(z.string().min(1).max(200)).optional(),
  ),
  /** publicIds of photos to delete on edit (multipart fields arrive joined). */
  removeImages: z.preprocess(
    (v) => (typeof v === "string" && v ? v.split(",") : v),
    z.array(z.string().min(1).max(200)).optional(),
  ),
  chest: z.string().trim().max(20).optional().default(""),
  waist: z.string().trim().max(20).optional().default(""),
  hips: z.string().trim().max(20).optional().default(""),
  length: z.string().trim().max(20).optional().default(""),
  inseam: z.string().trim().max(20).optional().default(""),
  shoulder: z.string().trim().max(20).optional().default(""),
  sleeve: z.string().trim().max(20).optional().default(""),
  // Draft/scheduled + policy fields
  status: z.enum(["active", "draft", "scheduled"]).optional(),
  publishAt: z.preprocess((v) => (v ? new Date(String(v)) : undefined), z.date().optional()),
  returnWindowDays: z.coerce.number().int().refine((v) => [0,7,14,30].includes(v), "Invalid window").optional().default(7),
  returnPolicy: z.string().trim().max(300).optional().default(""),
});

/** Relaxed schema for drafts — only title is required; everything else optional. */
export const draftListingSchema = z.object({
  title: z.string().trim().min(1).max(120).optional().default("Untitled draft"),
  brand: z.string().trim().max(60).optional().default(""),
  description: z.string().trim().max(2000).optional().default(""),
  category: z.enum(CATEGORIES).optional(),
  gender: z.enum(GENDERS).optional(),
  size: z.enum(SIZES).optional(),
  condition: z.enum(CONDITIONS).optional(),
  color: z.string().trim().max(40).optional().default(""),
  value: z.coerce.number().int().min(0).max(10000).optional(),
  location: z.string().trim().max(120).optional().default(""),
  meetup: z.coerce.boolean().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  retailValue: z.coerce.number().min(0).max(10000).optional(),
  material: z.string().trim().max(40).optional().default(""),
  fit: z.string().trim().max(30).optional().default(""),
  style: z.string().trim().max(30).optional().default(""),
  pattern: z.string().trim().max(30).optional().default(""),
  season: z.string().trim().max(40).optional().default(""),
  care: z.string().trim().max(200).optional().default(""),
  shippingDays: z.string().trim().max(40).optional().default(""),
  swapPreferences: z.string().trim().max(200).optional().default(""),
  quantity: z.coerce.number().int().min(1).max(50).optional(),
  tags: z.string().trim().max(120).optional().default(""),
  publishAt: z.preprocess((v) => (v ? new Date(String(v)) : undefined), z.date().optional()),
  returnWindowDays: z.coerce.number().int().refine((v) => [0,7,14,30].includes(v), "Invalid window").optional(),
  returnPolicy: z.string().trim().max(300).optional().default(""),
  chest: z.string().trim().max(20).optional().default(""),
  waist: z.string().trim().max(20).optional().default(""),
  hips: z.string().trim().max(20).optional().default(""),
  length: z.string().trim().max(20).optional().default(""),
  inseam: z.string().trim().max(20).optional().default(""),
  shoulder: z.string().trim().max(20).optional().default(""),
  sleeve: z.string().trim().max(20).optional().default(""),
});

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional().default(""),
  name: z.string().trim().max(80).optional().default(""),
  line1: z.string().trim().min(1, "Address line 1 required").max(120),
  line2: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().min(1, "City required").max(80),
  postal: z.string().trim().min(1, "Postal code required").max(20),
  country: z.string().trim().min(1, "Country required").max(60),
  phone: z.string().trim().max(24).optional().default(""),
  isDefault: z.coerce.boolean().optional().default(false),
});

export const updateAddressSchema = addressSchema.partial();

/** Split the flat multipart payload into the Listing document shape. */
export function toListingDoc(data) {
  const { chest, waist, hips, length, inseam, shoulder, sleeve, tags, lat, lng, ...rest } = data;
  const doc = {
    ...rest,
    tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12) : [],
    measurements: { chest, waist, hips, length, inseam, shoulder, sleeve },
  };
  // Only attach coordinates when the seller actually supplied both.
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    doc.locationCoord = { type: "Point", coordinates: [lng, lat] };
  } else {
    doc.locationCoord = undefined;
  }
  return doc;
}

/** Query params for a saved search — shared with the alert matcher. */
export const savedSearchSchema = z.object({
  name: z.string().trim().max(60).optional().default(""),
  q: z.string().trim().max(120).optional().default(""),
  cat: z.string().trim().max(40).optional().default(""),
  size: z.string().trim().max(5).optional().default(""),
  g: z.string().trim().max(20).optional().default(""),
  brand: z.string().trim().max(60).optional().default(""),
  tag: z.string().trim().max(20).optional().default(""),
  // Optional location scope for the search (matches browse's near-me filter).
  // Accepts null / "" / missing — the browse page stores `radiusKm ?? null` in
  // localStorage, and z.coerce.number() turns null into 0, which then failed
  // the `.min(1)` guard ("Number must be ≥ 1") whenever a saved filter came
  // from localStorage without a radius.
  lat: z.coerce.number().min(-90).max(90).optional().default(null),
  lng: z.coerce.number().min(-180).max(180).optional().default(null),
  radiusKm: z
    .preprocess(
      (v) => (v === null || v === "" || v === undefined ? null : Number(v)),
      z.number().min(1).max(5000).nullable().default(null),
    ),
  meetupOnly: boolParam(false),
  alertsEnabled: boolParam(true),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  cat: z.string().trim().max(40).optional().default(""),
  size: z.string().trim().max(5).optional().default(""),
  condition: z.string().trim().max(30).optional().default(""),
  g: z.string().trim().max(20).optional().default(""),
  brand: z.string().trim().max(60).optional().default(""),
  tag: z.string().trim().max(20).optional().default(""),
  sort: z.enum(["newest", "oldest", "value-asc", "value-desc", "most-saved", "most-viewed", "top-rated", "relevance", "nearest"]).optional().default("newest"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(60).optional().default(24),
  // Optional credit-range filter (mirrors the value the seller wants in return).
  minValue: z.coerce.number().min(0).max(100000).optional(),
  maxValue: z.coerce.number().min(0).max(100000).optional(),
  // Location filter — `lat`+`lng` + a radius in km narrows to items near a point.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(5000).optional(),
  meetupOnly: boolParam(false),
});