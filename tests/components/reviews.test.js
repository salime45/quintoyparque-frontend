import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick } from "vue";
import ReviewDialog from "../../src/components/ReviewDialog.vue";
import MyReviewsDialog from "../../src/components/MyReviewsDialog.vue";
import VenuePopup from "../../src/components/VenuePopup.vue";
import SuggestionDialog from "../../src/components/SuggestionDialog.vue";
import * as service from "../../src/services/firebase.js";
vi.mock("../../src/services/firebase.js", () => ({
  firebaseAvailable: true,
  login: vi.fn(),
  loadMyReview: vi.fn(),
  promoteOlderReview: vi.fn(),
  saveReview: vi.fn(),
  loadMyReviews: vi.fn(),
  loadVenueReviews: vi.fn(),
  saveSuggestion: vi.fn(),
}));
const venue = {
  id: "node/2",
  tags: { name: "Bar de prueba", amenity: "bar" },
  dist: 12,
  park: { id: "way/1", tags: { leisure: "playground" } },
};
const target = { venue, park: venue.park };
const user = { uid: "person-1" };
const wrappers = [];
function create(component, props) {
  const wrapper = mount(component, {
    props,
    global: { stubs: { AppDialog: { template: "<div><slot/></div>" } } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.resetAllMocks();
});
describe("Reseñas con estado reactivo", () => {
  it("Solicita sesión y carga el formulario cuando el usuario entra", async () => {
    service.loadMyReview.mockResolvedValue(null);
    const wrapper = create(ReviewDialog, { target, user: null });
    expect(wrapper.get("#reviewAuthGate").attributes("hidden")).toBeUndefined();
    expect(wrapper.get("#reviewForm").attributes("hidden")).toBeDefined();
    await wrapper.setProps({ user });
    await flushPromises();
    expect(wrapper.get("#reviewAuthGate").attributes("hidden")).toBeDefined();
    expect(wrapper.get("#reviewForm").attributes("hidden")).toBeUndefined();
    await wrapper.get('input[name="rating"][value="5"]').setValue();
    await wrapper.get('input[name="parkVisible"][value="yes"]').setValue();
    await wrapper.get('input[name="streetCrossing"][value="no"]').setValue();
    await wrapper.get("#reviewComment").setValue("Buena terraza");
    service.saveReview.mockResolvedValue({ rating: 5 });
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(service.saveReview).toHaveBeenCalledWith({
      uid: user.uid,
      ...target,
      editing: false,
      fields: {
        rating: "5",
        parkVisible: "yes",
        streetCrossing: "no",
        comment: "Buena terraza",
      },
    });
    expect(wrapper.emitted("saved")[0]).toEqual([venue]);
    expect(wrapper.get("#reviewExisting").text()).toContain("Reseña publicada");
  });
  it("Recupera los campos de la reseña existente y guarda como edición", async () => {
    service.loadMyReview.mockResolvedValue({
      status: "published",
      rating: 3,
      parkVisible: false,
      streetCrossing: true,
      comment: "Antes",
    });
    service.saveReview.mockResolvedValue({ rating: 4 });
    const wrapper = create(ReviewDialog, { target, user });
    await flushPromises();
    expect(wrapper.get('input[name="rating"][value="3"]').element.checked).toBe(
      true,
    );
    expect(
      wrapper.get('input[name="parkVisible"][value="no"]').element.checked,
    ).toBe(true);
    expect(
      wrapper.get('input[name="streetCrossing"][value="yes"]').element.checked,
    ).toBe(true);
    await wrapper.get('input[name="rating"][value="4"]').setValue();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(service.saveReview.mock.calls[0][0].editing).toBe(true);
    expect(wrapper.get("#reviewExisting").text()).toContain(
      "Cambios guardados",
    );
  });
  it("Descarta una respuesta pendiente si se cierra la sesión", async () => {
    let resolve;
    service.loadMyReview.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const wrapper = create(ReviewDialog, { target, user });
    await flushPromises();
    await wrapper.setProps({ user: null });
    resolve({ status: "published", rating: 5 });
    await flushPromises();
    expect(wrapper.get("#reviewForm").attributes("hidden")).toBeDefined();
    expect(wrapper.get("#reviewMessage").text()).toContain("Inicia sesión");
  });
  it("Mantiene el formulario y explica un fallo al guardar", async () => {
    service.loadMyReview.mockResolvedValue(null);
    service.saveReview.mockRejectedValue({ code: "permission-denied" });
    const wrapper = create(ReviewDialog, { target, user });
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("#reviewMessage").text()).toContain(
      "permisos de Firestore",
    );
    expect(wrapper.get("#reviewSubmit").element.disabled).toBe(false);
    expect(wrapper.emitted("saved")).toBeUndefined();
  });
  it("Consulta el listado privado del usuario y reconstruye los IDs al editar", async () => {
    service.loadMyReviews.mockResolvedValue([
      {
        key: "node_2",
        venueName: "Bar",
        parkId: "way/1",
        parkName: "Parque",
        rating: 4,
      },
    ]);
    const wrapper = create(MyReviewsDialog, { open: true, user, revision: 0 });
    await flushPromises();
    expect(service.loadMyReviews).toHaveBeenCalledWith(user.uid);
    await wrapper.get(".my-review-card button").trigger("click");
    expect(wrapper.emitted("edit")[0][0].venue.id).toBe("node/2");
    await wrapper.setProps({ user: null });
    expect(wrapper.findAll(".my-review-card")).toHaveLength(0);
  });
  it("Escapa nombres y comentarios y muestra solo las tres opiniones recientes", async () => {
    const attack = "<img src=x onerror=alert(1)>";
    service.loadVenueReviews.mockResolvedValue(
      Array.from({ length: 4 }, () => ({
        rating: 4,
        comment: attack,
        parkVisible: true,
        streetCrossing: false,
      })),
    );
    const wrapper = create(VenuePopup, {
      venue: { ...venue, tags: { name: attack } },
      revision: 0,
    });
    await flushPromises();
    await nextTick();
    expect(wrapper.get(".venue-popup__title").text()).toBe(attack);
    expect(wrapper.findAll(".popup-review-item")).toHaveLength(3);
    expect(
      wrapper.get(".popup-review-item__comment").find("img").exists(),
    ).toBe(false);
    expect(wrapper.get(".popup-score__number").text()).toBe("4,0");
    expect(wrapper.get(".popup-review-more").text()).toContain("3 opiniones");
  });
});

describe("Propuestas de sitios", () => {
  it("Conserva el formulario al elegir ubicación y envía los campos recortados", async () => {
    vi.spyOn(window, "alert").mockImplementation(() => {});
    service.saveSuggestion.mockResolvedValue({ id: "suggestion-1" });
    const position = { lat: 39.47, lng: -0.38 };
    const wrapper = create(SuggestionDialog, { open: true, user, position });
    await wrapper.get('[name="name"]').setValue(" Bar de prueba ");
    await wrapper.get('[name="address"]').setValue(" Calle de prueba ");
    await wrapper.get('[name="comment"]').setValue(" Se ve el parque ");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Elegir en el mapa")
      .trigger("click");
    expect(wrapper.emitted("pick")).toHaveLength(1);
    await wrapper.setProps({ open: false });
    const selected = { lat: 39.48, lng: -0.39 };
    await wrapper.setProps({ open: true, position: selected });
    expect(wrapper.get('[name="name"]').element.value).toBe(" Bar de prueba ");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(service.saveSuggestion).toHaveBeenCalledWith(
      user.uid,
      {
        name: "Bar de prueba",
        address: "Calle de prueba",
        comment: "Se ve el parque",
      },
      selected,
    );
    expect(wrapper.emitted("close")).toHaveLength(1);
    window.alert.mockRestore();
  });
});
