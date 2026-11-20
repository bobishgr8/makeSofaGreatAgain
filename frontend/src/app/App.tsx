import { Link, NavLink, useLocation } from "react-router-dom";
import { AppRouter } from "./router";
import { FormConfigProvider } from "./FormConfigContext";
import { useAuth, type Role } from "./AuthProvider";
import { useEffect } from "react";
import logo from "../assets/logo.png";

// What each kind of visitor can reach (the Figma tab bars: donor Donate /
// Status / Thanks / Help, social worker Furniture List / Status / Help).
// Routes still check roles themselves; this only decides what is shown.
const NAV: Record<Role | "guest" | "signedIn", Array<[string, string]>> = {
  guest: [["/furniture", "Furniture"], ["/wishlist", "Wishlist"], ["/donate", "Donate"], ["/help", "Help"]],
  signedIn: [["/furniture", "Furniture"], ["/wishlist", "Wishlist"], ["/help", "Help"]],
  donor: [
    ["/donate", "Donate"],
    ["/donor", "Your donations"],
    ["/thanks", "Thanks"],
    ["/help", "Help"],
    ["/profile", "Profile"],
  ],
  social_worker: [
    ["/workspace", "Your cases"],
    ["/matches", "Furniture"],
    ["/help", "Help"],
    ["/profile", "Profile"],
  ],
  admin: [
    ["/furniture", "Furniture"],
    ["/donate", "Donate"],
    ["/donor", "Your donations"],
    ["/workspace", "Social work"],
    ["/admin", "Admin"],
    ["/help", "Help"],
  ],
};

export default function App() {
  const { user, role, logout, refreshClaims } = useAuth();
  const location = useLocation();

  // A new account gets its role just after signing up; pick it up on the next page.
  useEffect(() => {
    if (user && !role) void refreshClaims();
  }, [user, role, location.pathname, refreshClaims]);

  const links = NAV[role ?? (user ? "signedIn" : "guest")];
  const logoSrc = logo;
  // The source asset is a wide wordmark lockup, not a square icon — using it
  // as-is would render illegibly small in a browser tab, so leave the
  // favicon unset until a cropped icon-only mark exists.
  const faviconSrc = "";

  useEffect(() => {
    if (!faviconSrc) return;

    let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = faviconSrc;
  }, [faviconSrc]);

  return (
    <FormConfigProvider>
      <header className="app-header">
        <Link className="brand" to="/">
          {logoSrc ? (
            <img className="brand-logo" src={logoSrc} alt="ReFurbish Singapore" />
          ) : (
            <>
              <span>RF</span>
              <strong>
                ReFurbish <small>Singapore</small>
              </strong>
            </>
          )}
        </Link>
        <nav aria-label="Main">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        {user ? (
          <button className="link-button" onClick={logout}>
            Log out
          </button>
        ) : (
          <Link className="button" to="/login">
            Log in
          </Link>
        )}
      </header>
      <AppRouter />
    </FormConfigProvider>
  );
}
