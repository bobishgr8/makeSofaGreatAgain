import { Link, NavLink } from "react-router-dom";
import { AppRouter } from "./router";
import { FormConfigProvider } from "./FormConfigContext";
import { useAuth } from "./AuthProvider";
import { useEffect } from "react";

export default function App() {
  const { user, logout } = useAuth();
  const logoSrc = ""; // set this to your logo image path if desired
  const faviconSrc = ""; // set this to your favicon image path if desired

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
            <img className="brand-logo" src={logoSrc} alt="ReFurbish Singapore logo" />
          ) : (
            <span>RF</span>
          )}
          <strong>
            ReFurbish <small>Singapore</small>
          </strong>
        </Link>
        <nav>
          <NavLink to="/furniture">Furniture</NavLink>
          <NavLink to="/donate">Donate</NavLink>
          <NavLink to="/donor">Your donations</NavLink>
          <NavLink to="/workspace">Social work</NavLink>
          <NavLink to="/admin">Admin</NavLink>
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
