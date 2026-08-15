import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test } from "vitest";
import ProtectedRoute from "./ProtectedRoute";

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/asgardscan" element={<p>protected content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("redirects to /login when there is no token", () => {
    renderAt("/asgardscan");

    expect(screen.getByText("login page")).toBeTruthy();
    expect(screen.queryByText("protected content")).toBeNull();
  });

  test("renders the nested route when a token is present", () => {
    sessionStorage.setItem("token", "a-token");

    renderAt("/asgardscan");

    // The original hardcoded HomePage here, so every protected route rendered
    // HomePage regardless of the route's own element.
    expect(screen.getByText("protected content")).toBeTruthy();
    expect(screen.queryByText("login page")).toBeNull();
  });
});
