/**
 * Bag (wishlist) store.
 *
 * Logged-in users persist to the Express/Mongo API (`/api/wishlist`); guests
 * persist to localStorage under a stable key. When a guest signs in, the local
 * bag is merged into their account exactly once and then cleared, so nothing
 * saved before sign-up is lost.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { api, apiEnabled } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export type BagItem = {
  /** Listing id */
  listingId: string;
  title: string;
  image: string;
  owner: string;
  ownerId?: string | null;
  value: number;
  category: string;
  brand?: string;
  size?: string;
  addedAt: string;
};

const GUEST_KEY = "swapt.bag.guest";

function readGuestBag(): BagItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(GUEST_KEY) ?? "[]") as BagItem[];
    return Array.isArray(raw) ? raw.filter((i) => i && typeof i.listingId === "string") : [];
  } catch {
    return [];
  }
}

function writeGuestBag(items: BagItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_KEY, JSON.stringify(items));
}

type WishlistState = {
  items: BagItem[];
  count: number;
  loading: boolean;
  has: (listingId: string) => boolean;
  /** Adds when absent, removes when present. Returns the new saved state. */
  toggle: (item: Omit<BagItem, "addedAt">) => Promise<boolean>;
  add: (item: Omit<BagItem, "addedAt">) => Promise<boolean>;
  remove: (listingId: string) => Promise<void>;
  clear: () => Promise<void>;
  reload: () => Promise<void>;
};

const WishlistContext = createContext<WishlistState | null>(null);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [items, setItems] = useState<BagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const mergedFor = useRef<boolean>(false);

  const remote = apiEnabled && isAuthenticated;

  const reload = useCallback(async () => {
    if (!remote) {
      setItems(readGuestBag());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { items: fetched } = await api<{ items: BagItem[] }>("/api/wishlist");
      setItems(fetched);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [remote]);

  // Merge the guest bag into the account on first authenticated load.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    void (async () => {
      if (remote && !mergedFor.current) {
        mergedFor.current = true;
        const guest = readGuestBag();
        if (guest.length) {
          try {
            await api("/api/wishlist/merge", { method: "POST", body: { items: guest } });
            writeGuestBag([]);
          } catch {
            /* keep the guest bag if the merge fails; retried next session */
          }
        }
      }
      if (!remote) mergedFor.current = false;
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, remote, reload]);

  const has = useCallback(
    (listingId: string) => items.some((i) => i.listingId === listingId),
    [items],
  );

  const add = useCallback(
    async (item: Omit<BagItem, "addedAt">) => {
      if (items.some((i) => i.listingId === item.listingId)) return true; // no duplicates
      const next: BagItem = { ...item, addedAt: new Date().toISOString() };
      setItems((prev) => [next, ...prev]); // optimistic
      if (remote) {
        try {
          await api("/api/wishlist", { method: "POST", body: next });
        } catch {
          setItems((prev) => prev.filter((i) => i.listingId !== item.listingId));
          toast.error("Couldn't save to your Bag. Please try again.");
          return false;
        }
      } else {
        writeGuestBag([next, ...readGuestBag().filter((i) => i.listingId !== item.listingId)]);
      }
      return true;
    },
    [items, remote],
  );

  const remove = useCallback(
    async (listingId: string) => {
      const snapshot = items;
      setItems((prev) => prev.filter((i) => i.listingId !== listingId));
      if (remote) {
        try {
          await api(`/api/wishlist/${listingId}`, { method: "DELETE" });
        } catch {
          setItems(snapshot);
          toast.error("Couldn't remove that item.");
        }
      } else {
        writeGuestBag(readGuestBag().filter((i) => i.listingId !== listingId));
      }
    },
    [items, remote],
  );

  const clear = useCallback(async () => {
    const snapshot = items;
    setItems([]);
    if (remote) {
      try {
        await api("/api/wishlist", { method: "DELETE" });
      } catch {
        setItems(snapshot);
        toast.error("Couldn't empty your Bag.");
      }
    } else {
      writeGuestBag([]);
    }
  }, [items, remote]);

  const toggle = useCallback(
    async (item: Omit<BagItem, "addedAt">) => {
      if (has(item.listingId)) {
        await remove(item.listingId);
        toast("Removed from your Bag", { description: item.title });
        return false;
      }
      const ok = await add(item);
      if (ok) {
        toast.success("❤️ Item saved to your Bag", {
          description: "View it anytime from the Bag.",
        });
      }
      return ok;
    },
    [add, has, remove],
  );

  const value = useMemo<WishlistState>(
    () => ({ items, count: items.length, loading, has, toggle, add, remove, clear, reload }),
    [items, loading, has, toggle, add, remove, clear, reload],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside <WishlistProvider>");
  return ctx;
}
