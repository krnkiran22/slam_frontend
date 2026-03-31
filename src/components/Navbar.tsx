"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Runs" },
  { href: "/about", label: "Docs" },
];

export function Navbar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
      <div className="w-full px-4 sm:px-6">
        <div className="flex items-center h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 mr-8 group">
            <div className="w-6 h-6 bg-foreground flex items-center justify-center">
              <Activity size={13} className="text-background" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-foreground">
              build
            </span>
            <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest hidden sm:block">
              VIO
            </span>
          </Link>

          {/* Nav links */}
          <nav className="flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1.5 text-[13px] font-medium transition-colors border-b-2",
                  isActive(item.href)
                    ? "text-foreground border-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right */}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <span className="text-[11px] font-mono text-muted-foreground border border-border px-2 py-0.5">
              Gen 4
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
