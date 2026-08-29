import { api, apiEnabled } from "@/lib/api";

export type ShippingAddress = {
  id: string;
  label: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  postal: string;
  country: string;
  phone: string;
  isDefault: boolean;
};

export async function fetchAddresses(): Promise<ShippingAddress[]> {
  if (!apiEnabled) {
    try {
      const raw = localStorage.getItem("swapt.addresses.demo");
      if (raw) return JSON.parse(raw) as ShippingAddress[];
    } catch {}
    return [];
  }
  const { items } = await api<{ items: ShippingAddress[] }>("/api/me/addresses");
  return items;
}

export async function createAddress(input: Omit<ShippingAddress, "id">): Promise<ShippingAddress> {
  if (!apiEnabled) {
    const list = await fetchAddresses();
    if (list.length >= 5) throw new Error("You can save up to 5 addresses.");
    const addr: ShippingAddress = { id: crypto.randomUUID(), ...input, isDefault: input.isDefault || list.length === 0 };
    const next = list.map((a) => (addr.isDefault ? { ...a, isDefault: false } : a));
    next.push(addr);
    localStorage.setItem("swapt.addresses.demo", JSON.stringify(next));
    return addr;
  }
  const { address } = await api<{ address: ShippingAddress }>("/api/me/addresses", { method: "POST", body: input });
  return address;
}

export async function updateAddress(id: string, patch: Partial<Omit<ShippingAddress, "id">>): Promise<ShippingAddress> {
  if (!apiEnabled) {
    const list = await fetchAddresses();
    const idx = list.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error("Address not found");
    list[idx] = { ...list[idx], ...patch };
    if (patch.isDefault) list.forEach((a, i) => { if (i !== idx) a.isDefault = false; });
    localStorage.setItem("swapt.addresses.demo", JSON.stringify(list));
    return list[idx];
  }
  const { address } = await api<{ address: ShippingAddress }>(`/api/me/addresses/${id}`, { method: "PATCH", body: patch });
  return address;
}

export async function deleteAddress(id: string): Promise<void> {
  if (!apiEnabled) {
    const list = (await fetchAddresses()).filter((a) => a.id !== id);
    if (list.length && !list.some((a) => a.isDefault)) list[0].isDefault = true;
    localStorage.setItem("swapt.addresses.demo", JSON.stringify(list));
    return;
  }
  await api(`/api/me/addresses/${id}`, { method: "DELETE" });
}

export async function setDefaultAddress(id: string): Promise<void> {
  if (!apiEnabled) {
    const list = await fetchAddresses();
    list.forEach((a) => { a.isDefault = a.id === id; });
    localStorage.setItem("swapt.addresses.demo", JSON.stringify(list));
    return;
  }
  await api(`/api/me/addresses/${id}/default`, { method: "POST" });
}
