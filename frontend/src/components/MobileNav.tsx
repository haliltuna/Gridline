import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutGrid, Upload, FileText, MoreHorizontal, Receipt, TrendingDown,
  Library, Inbox, Users, Settings as Cog, CreditCard,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/dashboard", label: "Jobs", icon: LayoutGrid },
  { to: "/upload", label: "Takeoff", icon: Upload },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "__more", label: "More", icon: MoreHorizontal },
];

const MORE_LINKS = [
  { to: "/expenses", label: "Profit", icon: Receipt },
  { to: "/costing", label: "Costing", icon: TrendingDown },
  { to: "/products", label: "Products", icon: Library },
  { to: "/leads", label: "Demos", icon: Inbox },
  { to: "/team", label: "Team", icon: Users },
  { to: "/settings", label: "Settings", icon: Cog },
  { to: "/billing", label: "Billing", icon: CreditCard },
];

export default function MobileNav() {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="mobile-nav"
      >
        <div className="mx-3 mb-3 flex items-center justify-around rounded-2xl border border-white/[0.06] bg-black/70 px-1.5 py-1.5 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
          {TABS.map((tab) => {
            const isMore = tab.to === "__more";
            const active = isMore
              ? MORE_LINKS.some((l) => pathname.startsWith(l.to))
              : pathname === tab.to || pathname.startsWith(`${tab.to}/`);

            const inner = (
              <>
                <tab.icon
                  className={cn("h-[22px] w-[22px] transition-transform", active && "scale-110")}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span
                  className={cn(
                    "mt-0.5 text-[10px] font-medium tracking-tight",
                    active ? "text-[#0A84FF]" : "text-white/60",
                  )}
                >
                  {tab.label}
                </span>
              </>
            );

            const cls = cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0 rounded-xl py-2 transition-colors active:scale-95",
              active && "bg-white/[0.06]",
            );

            return isMore ? (
              <button
                key={tab.to}
                type="button"
                onClick={() => setMoreOpen(true)}
                className={cls}
                data-testid="mobile-nav-more"
              >
                {inner}
              </button>
            ) : (
              <Link
                key={tab.to}
                to={tab.to}
                className={cls}
                data-testid={`mobile-nav-${tab.label.toLowerCase()}`}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-3xl border-t-0"
        >
          <SheetHeader className="pb-2">
            <SheetTitle className="text-center text-[17px] font-semibold">More</SheetTitle>
          </SheetHeader>

          <div className="-mt-2 divide-y divide-hairline">
            {MORE_LINKS.map((link) => {
              const active = pathname === link.to || pathname.startsWith(`${link.to}/`);
              return (
                <SheetClose
                  key={link.to}
                  nativeButton={false}
                  render={<Link to={link.to} />}
                  data-testid={`mobile-more-${link.label.toLowerCase()}`}
                  className={cn(
                    "flex items-center gap-4 px-5 py-4 text-[17px] transition-colors active:bg-white/[0.05]",
                    active ? "text-[#0A84FF]" : "text-foreground",
                  )}
                >
                  <link.icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                  <span className="font-medium">{link.label}</span>
                </SheetClose>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}