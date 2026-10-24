import {describe, expect, it, vi} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";
import {Empty, Stars, StatusBadge} from "../ui.jsx";

describe("composants UI", () => {
  it("affiche cinq étoiles et remonte la note choisie", () => {
    const onChange = vi.fn();
    render(<Stars value={2} onChange={onChange}/>);
    expect(screen.getAllByRole("button")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", {name: "4 étoile(s)"}));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("traduit les statuts métier", () => {
    render(<StatusBadge s="confirmed"/>);
    expect(screen.getByText("Confirmée")).toBeInTheDocument();
  });

  it("affiche un état vide avec son action", () => {
    render(<Empty icon="🔎" title="Aucun résultat"><span>Essayez autre chose</span></Empty>);
    expect(screen.getByText("Aucun résultat")).toBeInTheDocument();
    expect(screen.getByText("Essayez autre chose")).toBeInTheDocument();
  });
});
