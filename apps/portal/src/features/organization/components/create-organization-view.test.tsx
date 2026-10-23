import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateOrganizationView } from "./create-organization-view";

// Mocks only I/O: Better Auth's client calls and Next's router. The form, its validation,
// the slug logic and the shared useSwitchOrganization hook run for real.
const checkSlugMock = vi.fn();
const createMock = vi.fn();
const setActiveMock = vi.fn();
const pushMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: {
      checkSlug: (...a: unknown[]) => checkSlugMock(...a),
      create: (...a: unknown[]) => createMock(...a),
      setActive: (...a: unknown[]) => setActiveMock(...a),
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const slugTaken = {
  data: null,
  error: { code: "ORGANIZATION_SLUG_ALREADY_TAKEN", message: "Slug is taken" },
};

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <CreateOrganizationView />
    </QueryClientProvider>,
  );
  return { invalidate };
}

async function submitName(name: string) {
  const user = userEvent.setup();
  if (name) await user.type(screen.getByLabelText("Organization name"), name);
  await user.click(screen.getByRole("button", { name: /create organization/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  checkSlugMock.mockResolvedValue({ data: { status: true }, error: null });
  createMock.mockResolvedValue({ data: { id: "org_new", name: "Acme Rockets" }, error: null });
  setActiveMock.mockResolvedValue({ data: {}, error: null });
});

describe("CreateOrganizationView", () => {
  it("requires a name", async () => {
    renderView();
    await submitName("");

    expect(await screen.findByText("Organization name is required")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("creates the organization with a slug derived from its name, never shown to the user", async () => {
    renderView();
    expect(screen.queryByLabelText(/slug/i)).not.toBeInTheDocument();

    await submitName("Acme Rockets, Inc.");

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({
        name: "Acme Rockets, Inc.",
        slug: "acme-rockets-inc",
      }),
    );
    expect(checkSlugMock).toHaveBeenCalledWith({ slug: "acme-rockets-inc" });
  });

  it("picks another slug when the derived one is taken", async () => {
    checkSlugMock.mockResolvedValueOnce(slugTaken);
    renderView();

    await submitName("Acme");

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0]![0].slug).toMatch(/^acme-[a-z0-9]{6}$/);
  });

  it("switches to the new organization, clears cached data, and opens its team page", async () => {
    const { invalidate } = renderView();

    await submitName("Acme Rockets");

    await waitFor(() => expect(setActiveMock).toHaveBeenCalledWith({ organizationId: "org_new" }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/team"));
    expect(invalidate).toHaveBeenCalled();
  });

  it("explains a failed creation in plain language and stays on the page", async () => {
    createMock.mockResolvedValue({
      data: null,
      error: { code: "ORGANIZATION_ALREADY_EXISTS", message: "Organization already exists" },
    });
    renderView();

    await submitName("Acme");

    expect(
      await screen.findByText("We couldn't create that organization just now. Please try again."),
    ).toBeInTheDocument();
    expect(setActiveMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("doesn't create anything when every slug it tries is taken", async () => {
    checkSlugMock.mockResolvedValue(slugTaken);
    renderView();

    await submitName("Acme");

    expect(
      await screen.findByText("We couldn't create that organization just now. Please try again."),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });
});
