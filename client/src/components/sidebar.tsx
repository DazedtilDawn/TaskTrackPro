import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Package, 
  Heart, 
  ShoppingCart, 
  BarChart2,
  Settings 
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/watchlist", label: "Watchlist", icon: Heart },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/settings/ebay-auth", label: "eBay Settings", icon: Settings },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 border-r border-border h-screen bg-sidebar">
      <div className="p-6 space-y-4">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}>
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                location === href && "bg-sidebar-accent text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </div>
          </Link>
        ))}
      </div>
    </aside>
  );
}