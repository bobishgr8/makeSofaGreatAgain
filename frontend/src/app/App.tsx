import { Link, NavLink } from "react-router-dom";
import { AppRouter } from "./router";
import { useAuth } from "./AuthProvider";

export default function App() {
  const { user, logout } = useAuth();
  return <>
    <header className="app-header">
      <Link className="brand" to="/"><span>RF</span><strong>ReFurbish</strong></Link>
      <nav><NavLink to="/furniture">Furniture</NavLink><NavLink to="/donate">Donate</NavLink><NavLink to="/workspace">Social work</NavLink></nav>
      {user ? <button className="link-button" onClick={logout}>Log out</button> : <Link className="button" to="/login">Log in</Link>}
    </header>
    <AppRouter />
  </>;
}
