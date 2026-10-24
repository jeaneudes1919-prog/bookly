import {createContext, useContext, useEffect, useState} from "react";
import {api, refresh, setToken} from "./api.js";

const Ctx = createContext();
export const useAuth = () => useContext(Ctx);

export function AuthProvider({children}) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    refresh().then(d => setUser(d.user)).catch(() => {}).finally(() => setLoading(false));
    const logout = () => {
      setToken(null);
      setUser(null);
      setFavorites([]);
    };
    window.addEventListener("pulse:logout", logout);
    return () => window.removeEventListener("pulse:logout", logout);
  }, []);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      return;
    }
    if (user.role !== "client") {
      setFavorites([]);
      return;
    }
    api.get("/favorites").then(rows => setFavorites(rows.map(row => row.id))).catch(() => setFavorites([]));
  }, [user]);

  const done = d => {
    setToken(d.accessToken);
    setUser(d.user);
    return d.user;
  };
  const login = async (email, password) => done(await api.post("/auth/login", {email, password}));
  const register = async form => done(await api.post("/auth/register", form));
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    setToken(null);
    setUser(null);
    setFavorites([]);
  };
  const toggleFavorite = async businessId => {
    if (!user) throw new Error("Connectez-vous pour ajouter un favori");
    const isFavorite = favorites.includes(businessId);
    setFavorites(current => isFavorite ? current.filter(id => id !== businessId) : [...current, businessId]);
    try {
      if (isFavorite) await api.del("/favorites/" + businessId);
      else await api.post("/favorites/" + businessId);
      return !isFavorite;
    } catch (error) {
      setFavorites(current => isFavorite ? [...current, businessId] : current.filter(id => id !== businessId));
      throw error;
    }
  };

  return <Ctx.Provider value={{user, setUser, loading, login, register, logout, favorites, toggleFavorite}}>{children}</Ctx.Provider>;
}
