"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, CalendarDays, Refrigerator, ShoppingBasket, TrendingUp, BookOpen, ChefHat, Settings } from "lucide-react";

const MAIN = [
  { href: "/", label: "Dnes", icon: House },
  { href: "/plan", label: "Plán", icon: CalendarDays },
  { href: "/fridge", label: "Lednice", icon: Refrigerator, badge: "fridge" },
  { href: "/shopping", label: "Nákup", icon: ShoppingBasket, badge: "shop" },
  { href: "/progress", label: "Pokrok", icon: TrendingUp },
] as const;
const MORE = [
  { href: "/prep", label: "Meal prep", icon: ChefHat },
  { href: "/recipes", label: "Recepty", icon: BookOpen },
  { href: "/settings", label: "Nastavení", icon: Settings },
] as const;

function active(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Sidebar({ badges, side }: { badges: { fridge: number; shop: number }; side: { title: string; value: string; sub: string; dots: boolean[] } }) {
  const path = usePathname();
  return (
    <aside className="sidebar" aria-label="Hlavní navigace">
      <Link href="/" className="brand" aria-label="Nourish domů">
        <span className="brand-mark">N</span>
        <span>NOURISH</span>
      </Link>
      <nav className="nav-list">
        {MAIN.map((n) => (
          <Link key={n.href} href={n.href} className="nav-item" aria-current={active(path, n.href) ? "page" : undefined}>
            <n.icon aria-hidden />
            <span>{n.label}</span>
            {"badge" in n && badges[n.badge] > 0 ? <em className="nav-badge" style={{ fontStyle: "normal" }}>{badges[n.badge]}</em> : <i />}
          </Link>
        ))}
        <div className="nav-sep" />
        {MORE.map((n) => (
          <Link key={n.href} href={n.href} className="nav-item" aria-current={active(path, n.href) ? "page" : undefined}>
            <n.icon aria-hidden />
            <span>{n.label}</span>
            <i />
          </Link>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="side-card">
        <span className="eyebrow">{side.title}</span>
        <strong>{side.value}</strong>
        <span>{side.sub}</span>
        <div className="dots" aria-hidden>
          {side.dots.map((d, i) => (
            <i key={i} className={d ? "on" : ""} />
          ))}
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({ badges }: { badges: { fridge: number; shop: number } }) {
  const path = usePathname();
  return (
    <nav className="mobile-nav" aria-label="Mobilní navigace">
      {MAIN.map((n) => (
        <Link key={n.href} href={n.href} aria-current={active(path, n.href) ? "page" : undefined}>
          <n.icon aria-hidden />
          {n.label}
          {"badge" in n && badges[n.badge] > 0 && <span className="dot" aria-label={`${badges[n.badge]} upozornění`} />}
        </Link>
      ))}
    </nav>
  );
}
