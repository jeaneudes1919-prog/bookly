import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router-dom";

vi.mock("../auth.jsx", () => ({
  useAuth: () => ({user: null, loading: false, login: vi.fn(), register: vi.fn()})
}));

import {AuthPage} from "../me.jsx";

describe("page de connexion", () => {
  it("remplit les identifiants de démonstration", async () => {
    const user = userEvent.setup();
    const {container} = render(<MemoryRouter><AuthPage/></MemoryRouter>);
    await user.click(screen.getByRole("button", {name: "Client (démo)"}));
    expect(container.querySelector('input[type="email"]')).toHaveValue("client@bookly.dev");
    expect(container.querySelector('input[type="password"]')).toHaveValue("Bookly2026!");
  });

  it("affiche le champ nom en mode inscription", () => {
    render(<MemoryRouter><AuthPage register/></MemoryRouter>);
    expect(screen.getByText("Nom complet")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Je suis prestataire"})).toBeInTheDocument();
  });
});
