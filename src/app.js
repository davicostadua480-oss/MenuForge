import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, getDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const state = {
  user: null,
  profile: null,
  stores: [],
  categories: [],
  products: [],
  orders: [],
  activeStore: null,
  activeStoreId: null,
  activeView: "dashboardView",
  menuCategory: "all",
  menuSearch: "",
  cart: JSON.parse(localStorage.getItem("mf-cart") || "[]"),
  unsub: []
};

const flow = [
  ["new", "Novo"],
  ["accepted", "Aceito"],
  ["preparing", "Preparo"],
  ["ready", "Saiu"],
  ["delivered", "Finalizado"]
];
const statusName = Object.fromEntries(flow);

function money(v) { return BRL.format(Number(v || 0)); }
function normalize(v = "") { return String(v).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }
function esc(v = "") { return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])); }
function toNumber(v) { const n = Number(String(v || "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
function stamp(v) { return v?.toMillis ? v.toMillis() : v?.seconds ? v.seconds * 1000 : Date.parse(v) || 0; }
function toast(msg, type = "") { const el = document.createElement("div"); el.className = "toast " + type; el.textContent = msg; $("#toastArea").append(el); setTimeout(() => el.remove(), 4500); }
function saveCart() { localStorage.setItem("mf-cart", JSON.stringify(state.cart)); }
function role() { return state.profile?.role || "visitor"; }
function isDev() { return ["developer", "admin"].includes(role()); }
function isMerchant() { return ["merchant", "developer", "admin"].includes(role()); }
function currentStoreId() { return state.activeStoreId || state.profile?.currentStoreId || state.stores[0]?.id || null; }
function slug(store) { return normalize(store?.slug || store?.name || "loja").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function address(order) { const a = order.address || {}; return [a.street, a.number, a.district, a.complement, a.reference].filter(Boolean).join(", "); }
function mapsUrl(order) { return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(address(order)); }
function wazeUrl(order) { return "https://waze.com/ul?q=" + encodeURIComponent(address(order)) + "&navigate=yes"; }
function wa(phone, msg) { const p = String(phone || "").replace(/\D/g, ""); return "https://wa.me/" + p + "?text=" + encodeURIComponent(msg); }

function demoStore() {
  return { id: "demo", name: "Demo Burger", slug: "demo", status: "open", whatsapp: "5549999999999", deliveryFee: 6.5, minOrder: 15, headline: "Smash burgers, combos e bebidas em uma experiência de cardápio limpa." };
}
function demoCategories() {
  return [{ id: "burgers", storeId: "demo", name: "Burgers" }, { id: "combos", storeId: "demo", name: "Combos" }, { id: "drinks", storeId: "demo", name: "Bebidas" }];
}
function demoProducts() {
  return [
    { id: "p1", storeId: "demo", categoryId: "burgers", name: "Smash Duplo", price: 28.9, active: true, featured: true, prepTime: 22, description: "Dois smash burgers, cheddar e molho forge.", emoji: "🍔" },
    { id: "p2", storeId: "demo", categoryId: "combos", name: "Combo Família", price: 79.9, active: true, featured: true, prepTime: 35, description: "3 burgers, batata grande e refrigerante 2L.", emoji: "🍟" },
    { id: "p3", storeId: "demo", categoryId: "drinks", name: "Refrigerante lata", price: 6.5, active: true, prepTime: 2, description: "Escolha o sabor nas observações.", emoji: "🥤" }
  ];
}

function storeCategories(storeId) {
  const list = state.categories.filter(c => c.storeId === storeId);
  return list.length ? list : storeId === "demo" ? demoCategories() : [];
}
function storeProducts(storeId) {
  const list = state.products.filter(p => p.storeId === storeId);
  return list.length ? list : storeId === "demo" ? demoProducts() : [];
}

function hideAllPublic() {
  $("#publicArea").classList.remove("hidden");
  $("#adminApp").classList.add("hidden");
  ["landingPage", "featuresPage", "menuPage"].forEach(id => $("#" + id).classList.add("hidden"));
}
function showPublic(id) {
  hideAllPublic();
  $("#" + id).classList.remove("hidden");
}
function showAdmin(view = state.activeView) {
  $("#publicArea").classList.add("hidden");
  $("#adminApp").classList.remove("hidden");
  $$(".workspace").forEach(w => w.classList.add("hidden"));
  $("#" + view).classList.remove("hidden");
  state.activeView = view;
  $("#workspaceTitle").textContent = ({ dashboardView: "Centro de operação", ordersView: "Pedidos", menuAdminView: "Cardápio", courierView: "Entregador", settingsView: "Configurações", developerView: "Developer Studio" })[view] || "Painel";
  $("#workspaceLabel").textContent = role() === "courier" ? "Entregas" : isDev() ? "Developer" : "Estabelecimento";
  $("#adminSidebar").classList.remove("open");
  renderAdminNav();
  renderActiveWorkspace();
}

function route() {
  const hash = location.hash || "#/";
  if (hash === "#/recursos") return showPublic("featuresPage");
  if (hash.startsWith("#/cardapio")) {
    const key = decodeURIComponent(hash.split("/")[2] || "demo");
    const found = state.stores.find(s => s.slug === key || slug(s) === key);
    state.activeStore = found || demoStore();
    state.activeStoreId = state.activeStore.id;
    showPublic("menuPage");
    renderMenuPage();
    return;
  }
  if (hash.startsWith("#/admin")) {
    if (!state.user) { openAuth(); return showPublic("landingPage"); }
    return showAdmin("dashboardView");
  }
  showPublic("landingPage");
}

async function ensureProfile(user, initialRole = "merchant") {
  const ref = doc(db, "users", user.uid);
  const base = { uid: user.uid, email: user.email, name: user.displayName || user.email?.split("@")[0] || "Usuário", role: initialRole };
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return { ...base, ...snap.data() };
    await setDoc(ref, { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return base;
  } catch (err) {
    toast("Login feito, mas Firestore bloqueou perfil: " + err.message, "err");
    return base;
  }
}

function stopSubscriptions() {
  state.unsub.forEach(fn => fn && fn());
  state.unsub = [];
}
function subscribe() {
  stopSubscriptions();
  const listen = (name, setter) => {
    state.unsub.push(onSnapshot(collection(db, name), snap => {
      setter(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      renderAll();
    }, err => toast(name + ": " + err.message, "err")));
  };
  listen("stores", data => {
    state.stores = data.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const id = currentStoreId();
    state.activeStore = state.stores.find(s => s.id === id) || state.activeStore || state.stores[0] || null;
    state.activeStoreId = state.activeStore?.id || null;
  });
  listen("categories", data => state.categories = data);
  listen("products", data => state.products = data.sort((a, b) => (a.name || "").localeCompare(b.name || "")));
  listen("orders", data => state.orders = data.sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt)));
}

function renderAll() {
  renderMenuPage();
  if (!$("#adminApp").classList.contains("hidden")) renderActiveWorkspace();
}

function renderMenuPage() {
  const store = state.activeStore || demoStore();
  const categories = storeCategories(store.id);
  let products = storeProducts(store.id).filter(p => p.active !== false);
  if (state.menuCategory !== "all") products = products.filter(p => p.categoryId === state.menuCategory);
  const q = normalize(state.menuSearch);
  if (q) products = products.filter(p => normalize(p.name + " " + (p.description || "")).includes(q));

  $("#storeHero").innerHTML = `<h1>${esc(store.name)}</h1><p>${esc(store.headline || "Cardápio digital inteligente.")}</p><div class="badges"><span class="badge ok">${store.status === "closed" ? "Fechado" : "Aberto"}</span><span class="badge">Entrega ${money(store.deliveryFee)}</span><span class="badge">Mínimo ${money(store.minOrder)}</span></div>`;
  $("#categoryList").innerHTML = `<button class="cat-btn ${state.menuCategory === "all" ? "active" : ""}" data-cat="all">Tudo</button>` + categories.map(c => `<button class="cat-btn ${state.menuCategory === c.id ? "active" : ""}" data-cat="${c.id}">${esc(c.name)}</button>`).join("");
  $$("#categoryList [data-cat]").forEach(btn => btn.onclick = () => { state.menuCategory = btn.dataset.cat; renderMenuPage(); });

  $("#productGrid").innerHTML = products.map((p, i) => `<article class="product-card"><div class="product-img">${p.emoji || ["🍔", "🍕", "🥤", "🍟"][i % 4]}</div><div class="product-body"><div class="badges">${p.featured ? "<span class='badge ok'>Destaque</span>" : ""}<span class="badge">${p.prepTime || 20} min</span></div><h3>${esc(p.name)}</h3><p>${esc(p.description || "Produto do cardápio.")}</p><div class="product-foot"><strong class="price">${money(p.price)}</strong><button class="btn primary" data-add="${p.id}" type="button">Adicionar</button></div></div></article>`).join("") || `<div class="empty">Nenhum produto.</div>`;
  $$("[data-add]").forEach(btn => btn.onclick = () => addToCart(btn.dataset.add));
  renderCart();
}

function addToCart(id) {
  const product = storeProducts((state.activeStore || demoStore()).id).find(p => p.id === id);
  if (!product) return;
  const item = state.cart.find(i => i.id === id);
  item ? item.qty++ : state.cart.push({ id: product.id, storeId: product.storeId, name: product.name, price: Number(product.price), qty: 1 });
  saveCart();
  renderCart();
  toast(product.name + " adicionado ao carrinho.", "ok");
}
function cartTotals() {
  const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const delivery = state.cart.length ? Number((state.activeStore || demoStore()).deliveryFee || 0) : 0;
  return { subtotal, delivery, total: subtotal + delivery };
}
function renderCart() {
  $("#cartCount").textContent = state.cart.reduce((sum, i) => sum + i.qty, 0);
  $("#cartItems").innerHTML = state.cart.map(i => `<div class="cart-item"><div><strong>${esc(i.name)}</strong><br><small>${money(i.price)} un.</small></div><div class="qty"><button data-dec="${i.id}">−</button><b>${i.qty}</b><button data-inc="${i.id}">+</button></div></div>`).join("") || `<div class="empty">Carrinho vazio.</div>`;
  $$("[data-inc]").forEach(b => b.onclick = () => changeQty(b.dataset.inc, 1));
  $$("[data-dec]").forEach(b => b.onclick = () => changeQty(b.dataset.dec, -1));
  const t = cartTotals();
  $("#cartSubtotal").textContent = money(t.subtotal);
  $("#cartDelivery").textContent = money(t.delivery);
  $("#cartTotal").textContent = money(t.total);
}
function changeQty(id, delta) {
  const item = state.cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) state.cart = state.cart.filter(i => i.id !== id);
  saveCart();
  renderCart();
}

async function submitOrder(form) {
  if (!state.cart.length) return toast("Carrinho vazio.", "err");
  const fd = new FormData(form);
  const store = state.activeStore || demoStore();
  const t = cartTotals();
  const order = {
    storeId: store.id,
    storeName: store.name,
    items: state.cart,
    subtotal: t.subtotal,
    deliveryFee: t.delivery,
    total: t.total,
    status: "new",
    shortId: Math.random().toString(36).slice(2, 8).toUpperCase(),
    customer: { uid: state.user?.uid || null, name: fd.get("name"), phone: fd.get("phone") },
    address: { street: fd.get("street"), number: fd.get("number"), district: fd.get("district"), complement: fd.get("complement"), reference: fd.get("reference") },
    payment: { method: fd.get("payment"), changeFor: fd.get("changeFor") },
    notes: fd.get("notes"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  try {
    if (store.id !== "demo") await addDoc(collection(db, "orders"), order);
    state.cart = [];
    saveCart();
    renderCart();
    $("#checkoutDialog").close();
    $("#cartDrawer").classList.add("hidden");
    const msg = `Novo pedido #${order.shortId}\nTotal: ${money(order.total)}\nCliente: ${order.customer.name}\nEndereço: ${address(order)}`;
    if (store.whatsapp) window.open(wa(store.whatsapp, msg), "_blank", "noopener,noreferrer");
    toast("Pedido criado.", "ok");
  } catch (err) { toast("Erro ao criar pedido: " + err.message, "err"); }
}

function renderAdminNav() {
  const items = [];
  if (isMerchant()) items.push(["dashboardView", "Centro"], ["ordersView", "Pedidos"], ["menuAdminView", "Cardápio"], ["settingsView", "Configurações"]);
  if (role() === "courier" || isDev()) items.push(["courierView", "Entregador"]);
  if (isDev()) items.push(["developerView", "Developer"]);
  $("#adminNav").innerHTML = items.map(([id, label]) => `<button class="nav-btn ${state.activeView === id ? "active" : ""}" data-view="${id}" type="button">${label}</button>`).join("");
  $$("#adminNav [data-view]").forEach(btn => btn.onclick = () => showAdmin(btn.dataset.view));
  $("#roleLabel").textContent = role();
}
function storeOrders() {
  const id = currentStoreId();
  return isDev() ? state.orders : state.orders.filter(o => o.storeId === id || o.customer?.uid === state.user?.uid || o.assignedCourierId === state.user?.uid);
}
function renderActiveWorkspace() {
  const view = state.activeView;
  if (view === "dashboardView") return renderDashboard();
  if (view === "ordersView") return renderOrders();
  if (view === "menuAdminView") return renderMenuAdmin();
  if (view === "courierView") return renderCourier();
  if (view === "settingsView") return renderSettings();
  if (view === "developerView") return renderDeveloper();
}

function requireStoreHtml() {
  if (state.activeStore) return "";
  return `<div class="panel"><h2>Configure sua loja</h2><p style="color:var(--muted)">Você já está logado. Agora crie uma loja demo para começar a cadastrar produtos e receber pedidos.</p><button class="btn primary" id="emptySeed" type="button">Criar loja demo</button></div>`;
}
function renderDashboard() {
  if (!state.activeStore) {
    $("#dashboardView").innerHTML = requireStoreHtml();
    $("#emptySeed").onclick = createDemoStore;
    return;
  }
  const orders = storeOrders();
  const open = orders.filter(o => !["delivered", "cancelled"].includes(o.status));
  const revenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  $("#dashboardView").innerHTML = `<div class="workspace-grid grid-4"><article class="metric-card"><span>Pedidos</span><strong>${orders.length}</strong></article><article class="metric-card"><span>Abertos</span><strong>${open.length}</strong></article><article class="metric-card"><span>Faturamento</span><strong>${money(revenue)}</strong></article><article class="metric-card"><span>Produtos</span><strong>${storeProducts(currentStoreId()).length}</strong></article></div><div class="panel"><h2>Pedidos recentes</h2>${open.slice(0, 6).map(orderCard).join("") || "<div class='empty'>Sem pedidos abertos.</div>"}</div>`;
  wireOrderButtons();
}
function orderCard(o) {
  return `<article class="order-card"><h4>#${esc(o.shortId || o.id.slice(0, 6))} · ${esc(o.customer?.name || "Cliente")}</h4><div class="badges"><span class="badge warn">${statusName[o.status] || o.status}</span><span class="badge">${money(o.total)}</span></div><p>${esc(address(o))}</p><div class="order-actions">${flow.map(([s, l]) => `<button class="btn ghost" data-status="${o.id}:${s}" type="button">${l}</button>`).join("")}<a class="btn soft" href="${mapsUrl(o)}" target="_blank">GPS</a></div></article>`;
}
function renderOrders() {
  const orders = storeOrders();
  $("#ordersView").innerHTML = `<div class="kanban">${flow.map(([s, label]) => `<section class="kanban-col"><h3>${label}</h3>${orders.filter(o => o.status === s).map(orderCard).join("") || "<div class='empty'>Vazio</div>"}</section>`).join("")}</div>`;
  wireOrderButtons();
}
function wireOrderButtons() {
  $$("[data-status]").forEach(btn => btn.onclick = async () => {
    const [id, status] = btn.dataset.status.split(":");
    try { await updateDoc(doc(db, "orders", id), { status, updatedAt: serverTimestamp() }); toast("Pedido atualizado.", "ok"); }
    catch (err) { toast(err.message, "err"); }
  });
}

function renderMenuAdmin() {
  const storeId = currentStoreId();
  if (!storeId) {
    $("#menuAdminView").innerHTML = requireStoreHtml();
    $("#emptySeed").onclick = createDemoStore;
    return;
  }
  const products = storeProducts(storeId);
  $("#menuAdminView").innerHTML = `<div class="workspace-grid grid-2"><article class="panel"><h2>Categorias</h2><button class="btn primary" id="newCategory" type="button">+ Categoria</button>${storeCategories(storeId).map(c => `<div class="data-card"><strong>${esc(c.name)}</strong></div>`).join("") || "<div class='empty'>Sem categorias.</div>"}</article><article class="panel"><h2>Produtos</h2><button class="btn primary" id="newProduct" type="button">+ Produto</button><table class="table"><tbody>${products.map(p => `<tr><td>${esc(p.name)}</td><td>${money(p.price)}</td><td><button class="btn ghost" data-edit-product="${p.id}">Editar</button></td></tr>`).join("")}</tbody></table></article></div>`;
  $("#newCategory").onclick = () => $("#categoryDialog").showModal();
  $("#newProduct").onclick = () => openProductDialog();
  $$("[data-edit-product]").forEach(btn => btn.onclick = () => openProductDialog(btn.dataset.editProduct));
}
function renderCourier() {
  const orders = state.orders.filter(o => !["delivered", "cancelled"].includes(o.status));
  $("#courierView").innerHTML = `<div class="panel"><h2>Entregas disponíveis</h2>${orders.map(o => `<article class="order-card"><h4>#${esc(o.shortId || o.id.slice(0,6))} · ${esc(o.customer?.name || "Cliente")}</h4><p>${esc(address(o))}</p><div class="order-actions"><a class="btn primary" href="${mapsUrl(o)}" target="_blank">Google Maps</a><a class="btn soft" href="${wazeUrl(o)}" target="_blank">Waze</a><button class="btn ghost" data-claim="${o.id}">Assumir</button><button class="btn soft" data-done="${o.id}">Dar baixa</button></div></article>`).join("") || "<div class='empty'>Nenhuma entrega.</div>"}</div>`;
  $$("[data-claim]").forEach(btn => btn.onclick = async () => updateDoc(doc(db, "orders", btn.dataset.claim), { assignedCourierId: state.user.uid, updatedAt: serverTimestamp() }));
  $$("[data-done]").forEach(btn => btn.onclick = async () => updateDoc(doc(db, "orders", btn.dataset.done), { status: "delivered", paidReceived: true, deliveredAt: serverTimestamp(), updatedAt: serverTimestamp() }));
}
function renderSettings() {
  const s = state.activeStore;
  $("#settingsView").innerHTML = `<div class="panel"><h2>Configurações da loja</h2><div class="form-grid"><label>Nome<input id="storeName" value="${esc(s?.name || "")}"></label><label>Slug<input id="storeSlug" value="${esc(s?.slug || "")}"></label><label>WhatsApp<input id="storeWhatsapp" value="${esc(s?.whatsapp || "")}"></label><label>Taxa entrega<input id="storeFee" value="${s?.deliveryFee || 0}"></label><label>Pedido mínimo<input id="storeMin" value="${s?.minOrder || 0}"></label><label class="wide">Chamada<input id="storeHeadline" value="${esc(s?.headline || "")}"></label></div><button class="btn primary" id="saveStore" type="button">Salvar loja</button></div>`;
  $("#saveStore").onclick = saveStore;
}
function renderDeveloper() {
  $("#developerView").innerHTML = `<div class="workspace-grid grid-4"><article class="metric-card"><span>Lojas</span><strong>${state.stores.length}</strong></article><article class="metric-card"><span>Pedidos</span><strong>${state.orders.length}</strong></article><article class="metric-card"><span>Produtos</span><strong>${state.products.length}</strong></article><article class="metric-card"><span>Categorias</span><strong>${state.categories.length}</strong></article></div>`;
}

async function createDemoStore() {
  if (!state.user) return openAuth();
  try {
    const storeRef = doc(collection(db, "stores"));
    await setDoc(storeRef, { name: "MenuForge Demo Delivery", slug: "menu-forge-demo", ownerId: state.user.uid, status: "open", whatsapp: "5549999999999", deliveryFee: 7, minOrder: 20, headline: "Loja demo para testar cardápio, pedidos e entregador.", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    const c1 = doc(collection(db, "categories")), c2 = doc(collection(db, "categories")), c3 = doc(collection(db, "categories"));
    await setDoc(c1, { storeId: storeRef.id, name: "Lanches", order: 1 });
    await setDoc(c2, { storeId: storeRef.id, name: "Combos", order: 2 });
    await setDoc(c3, { storeId: storeRef.id, name: "Bebidas", order: 3 });
    await addDoc(collection(db, "products"), { storeId: storeRef.id, categoryId: c1.id, name: "Burger Imperial", price: 31.9, active: true, featured: true, prepTime: 20, description: "Blend da casa, queijo duplo e molho especial.", emoji: "🍔" });
    await addDoc(collection(db, "products"), { storeId: storeRef.id, categoryId: c2.id, name: "Combo Família", price: 79.9, active: true, featured: true, prepTime: 35, description: "3 burgers, batata e refrigerante.", emoji: "🍟" });
    await addDoc(collection(db, "products"), { storeId: storeRef.id, categoryId: c3.id, name: "Refrigerante lata", price: 6.5, active: true, prepTime: 2, description: "Bebida gelada.", emoji: "🥤" });
    await setDoc(doc(db, "users", state.user.uid), { role: "merchant", currentStoreId: storeRef.id, updatedAt: serverTimestamp() }, { merge: true });
    state.profile = { ...state.profile, role: "merchant", currentStoreId: storeRef.id };
    toast("Loja demo criada.", "ok");
  } catch (err) { toast("Erro ao criar demo: " + err.message, "err"); }
}
async function saveStore() {
  const payload = { name: $("#storeName").value.trim(), slug: $("#storeSlug").value.trim(), whatsapp: $("#storeWhatsapp").value.trim(), deliveryFee: toNumber($("#storeFee").value), minOrder: toNumber($("#storeMin").value), headline: $("#storeHeadline").value.trim(), ownerId: state.user.uid, updatedAt: serverTimestamp() };
  try {
    if (state.activeStore?.id) await updateDoc(doc(db, "stores", state.activeStore.id), payload);
    else {
      const ref = await addDoc(collection(db, "stores"), { ...payload, createdAt: serverTimestamp() });
      await setDoc(doc(db, "users", state.user.uid), { role: "merchant", currentStoreId: ref.id }, { merge: true });
    }
    toast("Loja salva.", "ok");
  } catch (err) { toast(err.message, "err"); }
}
function openProductDialog(id = null) {
  const form = $("#productForm");
  form.reset();
  form.elements.id.value = "";
  $("#productForm [name=categoryId]").innerHTML = storeCategories(currentStoreId()).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  if (id) {
    const p = state.products.find(x => x.id === id);
    if (p) Object.entries(p).forEach(([k, v]) => { if (form.elements[k]) form.elements[k].value = String(v); });
    form.elements.id.value = id;
  }
  $("#productDialog").showModal();
}
async function saveProduct(e) {
  if (e.submitter?.value === "cancel") return;
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const id = fd.get("id");
  const payload = { storeId: currentStoreId(), categoryId: fd.get("categoryId"), name: fd.get("name"), price: toNumber(fd.get("price")), active: fd.get("active") === "true", featured: fd.get("featured") === "true", description: fd.get("description"), prepTime: Number(fd.get("prepTime") || 20), updatedAt: serverTimestamp() };
  try {
    if (id) await updateDoc(doc(db, "products", id), payload);
    else await addDoc(collection(db, "products"), { ...payload, createdAt: serverTimestamp() });
    $("#productDialog").close();
    toast("Produto salvo.", "ok");
  } catch (err) { toast(err.message, "err"); }
}
async function saveCategory(e) {
  if (e.submitter?.value === "cancel") return;
  e.preventDefault();
  try {
    await addDoc(collection(db, "categories"), { storeId: currentStoreId(), name: new FormData(e.currentTarget).get("name"), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $("#categoryDialog").close();
    e.currentTarget.reset();
    toast("Categoria salva.", "ok");
  } catch (err) { toast(err.message, "err"); }
}

function openAuth() { $("#authModal").classList.remove("hidden"); }
function closeAuth() { $("#authModal").classList.add("hidden"); }
async function enter(user, initialRole = "merchant") {
  state.user = user;
  state.profile = await ensureProfile(user, initialRole);
  closeAuth();
  subscribe();
  location.hash = "#/admin";
  showAdmin("dashboardView");
}
async function login(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  try {
    const cred = await signInWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
    await enter(cred.user, "merchant");
    toast("Login realizado.", "ok");
  } catch (err) { toast("Login falhou: " + err.message, "err"); }
}
async function register(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  try {
    const cred = await createUserWithEmailAndPassword(auth, fd.get("email"), fd.get("password"));
    await updateProfile(cred.user, { displayName: fd.get("name") });
    await setDoc(doc(db, "users", cred.user.uid), { uid: cred.user.uid, email: cred.user.email, name: fd.get("name"), role: fd.get("role"), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    await enter(cred.user, fd.get("role"));
  } catch (err) { toast("Cadastro falhou: " + err.message, "err"); }
}
async function googleAuth() {
  try {
    const cred = await signInWithPopup(auth, provider);
    await enter(cred.user, "merchant");
  } catch (err) {
    if (err.code === "auth/unauthorized-domain") toast("Google bloqueado: adicione davicostadua480-oss.github.io em Firebase Auth > Settings > Authorized domains.", "err");
    else toast("Google falhou: " + err.message, "err");
  }
}

function bind() {
  $("#boot").hidden = true;
  $("#loginTop").onclick = openAuth;
  $("#startTop").onclick = openAuth;
  $$("[data-open-auth]").forEach(b => b.onclick = openAuth);
  $$("[data-close-auth]").forEach(b => b.onclick = closeAuth);
  $$("[data-auth-tab]").forEach(btn => btn.onclick = () => {
    $$("[data-auth-tab]").forEach(b => b.classList.toggle("active", b === btn));
    $("#loginForm").classList.toggle("hidden", btn.dataset.authTab !== "login");
    $("#registerForm").classList.toggle("hidden", btn.dataset.authTab !== "register");
  });
  $("#loginForm").onsubmit = login;
  $("#registerForm").onsubmit = register;
  $("#googleLogin").onclick = googleAuth;
  $("#googleRegister").onclick = googleAuth;
  $("#menuSearch").oninput = e => { state.menuSearch = e.target.value; renderMenuPage(); };
  $("#openCart").onclick = () => $("#cartDrawer").classList.remove("hidden");
  $("#closeCart").onclick = () => $("#cartDrawer").classList.add("hidden");
  $("#checkoutButton").onclick = () => state.cart.length ? $("#checkoutDialog").showModal() : toast("Carrinho vazio.", "err");
  $("#checkoutForm").onsubmit = e => { if (e.submitter?.value === "cancel") return; e.preventDefault(); submitOrder(e.currentTarget); };
  $("#toggleSidebar").onclick = () => $("#adminSidebar").classList.toggle("open");
  $("#logoutButton").onclick = () => signOut(auth);
  $("#themeToggle").onclick = () => { document.body.classList.toggle("light"); localStorage.setItem("mf-theme", document.body.classList.contains("light") ? "light" : "dark"); };
  $("#seedDemo").onclick = createDemoStore;
  $("#newProductTop").onclick = () => openProductDialog();
  $("#productForm").onsubmit = saveProduct;
  $("#categoryForm").onsubmit = saveCategory;
  window.addEventListener("hashchange", route);
}

function init() {
  if (localStorage.getItem("mf-theme") === "light") document.body.classList.add("light");
  bind();
  renderMenuPage();
  renderCart();
  onAuthStateChanged(auth, async user => {
    if (!user) {
      state.user = null;
      state.profile = null;
      stopSubscriptions();
      if ((location.hash || "").startsWith("#/admin")) location.hash = "#/";
      route();
      return;
    }
    if (!state.user) {
      state.user = user;
      state.profile = await ensureProfile(user, "merchant");
      subscribe();
      if ((location.hash || "").startsWith("#/admin")) showAdmin("dashboardView");
      else route();
    }
  });
  route();
}
init();
