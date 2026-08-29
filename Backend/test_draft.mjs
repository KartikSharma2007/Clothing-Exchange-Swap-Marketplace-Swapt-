import { connectDB } from "./src/config/db.js";
import { Listing } from "./src/models/Listing.js";
import { User } from "./src/models/User.js";
import dotenv from "dotenv";
dotenv.config();
const uri = process.env.MONGODB_URI;
if (!uri) { console.error("no uri"); process.exit(1); }
await connectDB(uri);
const user = await User.findOne({}).select("_id username");
if (!user) { console.error("no user"); process.exit(1); }
console.log("user", user.username);
const draft = await Listing.create({
  title: "Test draft",
  seller: user._id,
  status: "draft",
  moderationStatus: "pending",
  images: [],
});
console.log("draft created", draft._id, draft.status, draft.title);
console.log("draft brand", JSON.stringify(draft.brand), "category", JSON.stringify(draft.category));
await Listing.deleteOne({ _id: draft._id });
console.log("draft deleted ok");
process.exit(0);
