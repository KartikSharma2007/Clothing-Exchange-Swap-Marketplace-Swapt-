import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Facebook, Twitter, MessageCircle, Instagram, Send, Pin, Mail, Share2, Link2 } from "lucide-react";

type Network = { id: string; name: string; icon: typeof Twitter; color: string; make: (u: string, t: string) => string; bg: string };

const NETWORKS: Network[] = [
  { id: "whatsapp", name: "WhatsApp", icon: MessageCircle, color: "text-[#25D366]", bg: "bg-[#25D366]/10", make: (u: string, t: string) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
  { id: "telegram", name: "Telegram", icon: Send, color: "text-[#26A5E4]", bg: "bg-[#26A5E4]/10", make: (u: string, t: string) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: "x", name: "X", icon: Twitter, color: "text-foreground", bg: "bg-foreground/5", make: (u: string, t: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { id: "facebook", name: "Facebook", icon: Facebook, color: "text-[#1877F2]", bg: "bg-[#1877F2]/10", make: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: "pinterest", name: "Pinterest", icon: Pin, color: "text-[#E60023]", bg: "bg-[#E60023]/10", make: (u: string, t: string) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(u)}&description=${encodeURIComponent(t)}` },
  { id: "email", name: "Email", icon: Mail, color: "text-foreground/70", bg: "bg-muted", make: (u: string, t: string) => `mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(`${t} ${u}`)}` },
  { id: "instagram", name: "Instagram", icon: Instagram, color: "text-[#E4405F]", bg: "bg-[#E4405F]/10", make: () => "https://www.instagram.com/" },
] as const;

export function ShareMenu({ url, title, children, align = "right" }: {
  url: string;
  title: string;
  children: (open: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const copy = async () => {
    await navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ title, url, text: title }); setOpen(false); return; } catch { /* fall through */ }
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={wrapRef} className="relative">
      {children(nativeShare)}
      {open && (
        <div
          className={`absolute z-40 mt-2 w-[320px] animate-scale-in overflow-hidden rounded-[1.25rem] border border-border bg-card shadow-2xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="bg-gradient-to-br from-brand/5 to-violet-500/5 p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-white"><Share2 className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black leading-none">Share this find</p>
                <p className="text-xs text-foreground/60 truncate mt-0.5">{title}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-background border border-border p-2">
              <Link2 className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
              <span className="flex-1 truncate text-xs font-mono text-foreground/70">{url}</span>
              <button onClick={copy} className={`shrink-0 rounded-full px-3 py-2 text-sm min-h-9 font-bold transition ${copied ? "bg-emerald-500 text-white" : "bg-foreground text-background hover:bg-foreground/90"}`}>
                {copied ? <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Copied</span> : "Copy"}
              </button>
            </div>
          </div>

          <div className="p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-foreground/40 px-1 mb-2">Share via</p>
            <div className="grid grid-cols-3 gap-2">
              {NETWORKS.map(({ id, name, icon: Icon, color, bg, make }) => (
                <a
                  key={id}
                  href={make(url, title)}
                  target={id === "email" ? undefined : "_blank"}
                  rel={id === "email" ? undefined : "noopener noreferrer"}
                  onClick={() => {
                    if (id === "instagram") {
                      copy();
                    }
                    setOpen(false);
                  }}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border border-border p-3 hover:border-foreground/20 hover:shadow-md transition group ${bg}`}
                >
                  <span className={`grid h-9 w-9 place-items-center rounded-xl bg-card shadow-sm ${color} group-hover:scale-105 transition`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-bold">{name}</span>
                </a>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-foreground/40">Instagram: copy link and share in app • Links preview via OG tags</p>
          </div>
        </div>
      )}
    </div>
  );
}
