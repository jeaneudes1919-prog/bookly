import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router-dom";

const state = vi.hoisted(() => ({user: null, loading: false}));
vi.mock("../auth.jsx", () => ({
  useAuth: () => ({...state, logout: vi.fn()})
}));

import {Guard} from "../App.jsx";

const renderAt = path => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/" element={<div>accueil</div>}/>
      <Route path="/connexion" element={<div>page connexion</div>}/>
      <Route path="*" element={<Guard roles={["client"]}><div>contenu privé</div></Guard>}/>
    </Routes>
  </MemoryRouter>
);

describe("Guard", () => {
  beforeEach(() => {
    state.user = null;
    state.loading = false;
  });

  it("redirige un visiteur non connecté", () => {
    renderAt("/prive");
    expect(screen.getByText("page connexion")).toBeInTheDocument();
    expect(screen.queryByText("contenu privé")).not.toBeInTheDocument();
  });

  it("redirige un rôle non autorisé", () => {
    state.user = {id: 2, role: "owner"};
    renderAt("/prive");
    expect(screen.getByText("accueil")).toBeInTheDocument();
  });

  it("laisse passer un client autorisé", () => {
    state.user = {id: 3, role: "client"};
    renderAt("/prive");
    expect(screen.getByText("contenu privé")).toBeInTheDocument();
  });
});
