/**
 * Shared marketplace taxonomy: categories, sizes, and the department menus
 * that power the "Shop by category" mega-menu in the navbar.
 * Keep this in sync with server/src/models/Listing.js.
 */

export const CATEGORIES = [
  "T-shirts",
  "Shirts & Blouses",
  "Tops",
  "Knitwear & Jumpers",
  "Hoodies & Sweatshirts",
  "Dresses",
  "Skirts",
  "Jeans",
  "Trousers",
  "Shorts",
  "Bottoms",
  "Jackets & Coats",
  "Outerwear",
  "Blazers & Suits",
  "Activewear",
  "Swimwear",
  "Loungewear & Sleepwear",
  "Shoes",
  "Sneakers",
  "Boots",
  "Bags",
  "Accessories",
  "Jewellery",
  "Hats & Caps",
  "Sunglasses",
  "Watches",
  "Vintage",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
export type Size = (typeof SIZES)[number];

export const CONDITIONS = ["New with tags", "New", "Like new", "Good", "Fair"] as const;
export const GENDERS = ["Womens", "Mens", "Unisex", "Kids"] as const;

export const FITS = ["Slim", "Regular", "Relaxed", "Oversized", "Cropped", "Tailored"] as const;
export const STYLES = [
  "Streetwear", "Vintage", "Minimal", "Y2K", "Workwear", "Sportswear",
  "Boho", "Grunge", "Preppy", "Formal",
] as const;
export const MATERIALS = [
  "Cotton", "Organic cotton", "Linen", "Denim", "Wool", "Cashmere",
  "Silk", "Leather", "Polyester", "Nylon", "Recycled blend", "Viscose",
] as const;

export type NavSearch = {
  q: string; cat: string; size: string; g: string; brand: string; tag: string; sort: string;
};

export const emptySearch: NavSearch = {
  q: "", cat: "", size: "", g: "", brand: "", tag: "", sort: "newest",
};

export type MenuColumn = {
  title: string;
  items: { label: string; search: Partial<NavSearch> }[];
};

export type DepartmentMenu = {
  label: string;
  /** Landing view when the top-level nav label itself is clicked. */
  search: NavSearch;
  columns: MenuColumn[];
  highlight?: { title: string; blurb: string; search: Partial<NavSearch> };
};

const cats = (g: string, list: string[]) =>
  list.map((c) => ({ label: c, search: { g, cat: c } }));

const sizeLinks = (g: string, list: readonly string[]) =>
  list.map((s) => ({ label: `Size ${s}`, search: { g, size: s } }));

const brandLinks = (g: string, list: string[]) =>
  list.map((b) => ({ label: b, search: { g, brand: b } }));

export const DEPARTMENT_MENUS: DepartmentMenu[] = [
  {
    label: "Women",
    search: { ...emptySearch, g: "Womens" },
    columns: [
      {
        title: "Shop by category",
        items: cats("Womens", [
          "Dresses", "Tops", "T-shirts", "Shirts & Blouses", "Knitwear & Jumpers",
          "Skirts", "Jeans", "Trousers",
        ]),
      },
      {
        title: "Outerwear & shoes",
        items: cats("Womens", ["Jackets & Coats", "Blazers & Suits", "Shoes", "Boots", "Sneakers", "Activewear", "Swimwear"]),
      },
      {
        title: "Accessories",
        items: cats("Womens", ["Bags", "Jewellery", "Sunglasses", "Hats & Caps", "Watches", "Accessories"]),
      },
      { title: "Shop by size", items: sizeLinks("Womens", SIZES) },
    ],
    highlight: {
      title: "Summer dresses",
      blurb: "Silk slips, linen midis and vintage finds swapped daily.",
      search: { g: "Womens", cat: "Dresses", sort: "newest" },
    },
  },
  {
    label: "Men",
    search: { ...emptySearch, g: "Mens" },
    columns: [
      {
        title: "Shop by category",
        items: cats("Mens", ["T-shirts", "Shirts & Blouses", "Hoodies & Sweatshirts", "Knitwear & Jumpers", "Jeans", "Trousers", "Shorts"]),
      },
      {
        title: "Outerwear & shoes",
        items: cats("Mens", ["Jackets & Coats", "Blazers & Suits", "Sneakers", "Boots", "Shoes", "Activewear", "Swimwear"]),
      },
      {
        title: "Accessories",
        items: cats("Mens", ["Bags", "Hats & Caps", "Watches", "Sunglasses", "Accessories", "Jewellery"]),
      },
      { title: "Shop by size", items: sizeLinks("Mens", SIZES) },
    ],
    highlight: {
      title: "Workwear & denim",
      blurb: "Carhartt-style jackets, raw denim and heavy tees.",
      search: { g: "Mens", cat: "Jeans" },
    },
  },
  {
    label: "Kids",
    search: { ...emptySearch, g: "Kids" },
    columns: [
      {
        title: "Shop by category",
        items: cats("Kids", ["T-shirts", "Tops", "Hoodies & Sweatshirts", "Dresses", "Trousers", "Shorts", "Jeans"]),
      },
      {
        title: "Outerwear & shoes",
        items: cats("Kids", ["Jackets & Coats", "Sneakers", "Shoes", "Boots", "Swimwear", "Activewear"]),
      },
      {
        title: "Extras",
        items: cats("Kids", ["Bags", "Hats & Caps", "Accessories", "Loungewear & Sleepwear"]),
      },
      { title: "Shop by size", items: sizeLinks("Kids", ["XS", "S", "M", "L"]) },
    ],
    highlight: {
      title: "Grow-out swaps",
      blurb: "Outgrown in a season — swap instead of shopping new.",
      search: { g: "Kids", sort: "newest" },
    },
  },
  {
    label: "Brands",
    search: { ...emptySearch, sort: "value-desc" },
    columns: [
      {
        title: "Most swapped",
        items: brandLinks("", ["Levi's", "Nike", "Adidas", "The North Face", "Patagonia", "Uniqlo", "COS", "Vans"]),
      },
      {
        title: "Premium",
        items: brandLinks("", ["Reformation", "Acne Studios", "Ganni", "A.P.C.", "Carhartt", "Stüssy"]),
      },
      {
        title: "Everyday",
        items: brandLinks("", ["Zara", "H&M", "Mango", "Herschel", "New Balance", "Champion"]),
      },
      {
        title: "By value",
        items: [
          { label: "Under 25 credits", search: { tag: "sale", sort: "value-asc" } },
          { label: "Highest value", search: { sort: "value-desc" } },
          { label: "New in", search: { sort: "newest" } },
        ],
      },
    ],
    highlight: {
      title: "Verified brand swaps",
      blurb: "Every premium listing is reviewed before it goes live.",
      search: { sort: "value-desc" },
    },
  },
  {
    label: "Sports",
    search: { ...emptySearch, tag: "sports" },
    columns: [
      {
        title: "Shop by category",
        items: [
          { label: "Activewear", search: { tag: "sports", cat: "Activewear" } },
          { label: "Sneakers", search: { tag: "sports", cat: "Sneakers" } },
          { label: "Hoodies & Sweatshirts", search: { tag: "sports", cat: "Hoodies & Sweatshirts" } },
          { label: "Shorts", search: { tag: "sports", cat: "Shorts" } },
          { label: "Jackets & Coats", search: { tag: "sports", cat: "Jackets & Coats" } },
          { label: "Swimwear", search: { tag: "sports", cat: "Swimwear" } },
        ],
      },
      {
        title: "Sports brands",
        items: ["Nike", "Adidas", "Puma", "Under Armour", "New Balance", "Reebok", "Champion"].map((b) => ({
          label: b, search: { brand: b },
        })),
      },
      {
        title: "By department",
        items: [
          { label: "Womens sport", search: { tag: "sports", g: "Womens" } },
          { label: "Mens sport", search: { tag: "sports", g: "Mens" } },
          { label: "Kids sport", search: { tag: "sports", g: "Kids" } },
        ],
      },
    ],
    highlight: {
      title: "Trainer swaps",
      blurb: "Barely-worn runners looking for a second season.",
      search: { tag: "sports", cat: "Sneakers" },
    },
  },
  {
    label: "Trending",
    search: { ...emptySearch, tag: "trending" },
    columns: [
      {
        title: "This week",
        items: [
          { label: "Vintage denim", search: { tag: "trending", cat: "Jeans" } },
          { label: "Y2K tops", search: { tag: "trending", cat: "Tops" } },
          { label: "Cargo trousers", search: { tag: "trending", cat: "Trousers" } },
          { label: "Chunky knits", search: { tag: "trending", cat: "Knitwear & Jumpers" } },
          { label: "Statement bags", search: { tag: "trending", cat: "Bags" } },
        ],
      },
      {
        title: "Collections",
        items: [
          { label: "Newly listed", search: { sort: "newest" } },
          { label: "Under 25 credits", search: { tag: "sale" } },
          { label: "Vintage archive", search: { cat: "Vintage" } },
        ],
      },
      {
        title: "By department",
        items: [
          { label: "Trending womens", search: { tag: "trending", g: "Womens" } },
          { label: "Trending mens", search: { tag: "trending", g: "Mens" } },
          { label: "Trending kids", search: { tag: "trending", g: "Kids" } },
        ],
      },
    ],
    highlight: {
      title: "Most saved today",
      blurb: "What the community is racing to swap right now.",
      search: { tag: "trending", sort: "newest" },
    },
  },
];
