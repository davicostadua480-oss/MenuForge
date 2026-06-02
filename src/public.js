import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const mfFlavorCss = document.createElement("style");
mfFlavorCss.id = "mfFlavorDialogStyle";
mfFlavorCss.textContent = `
.flavor-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:120;display:grid;place-items:end center;padding:12px}
.flavor-modal{width:min(560px,100%);max-height:88vh;overflow:auto;background:#10192d;border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:18px;color:#f8fafc;box-shadow:0 24px 80px rgba(0,0,0,.45)}
.flavor-modal h2{margin:0 0 8px}
.flavor-list{display:grid;gap:8px;margin:14px 0}
.flavor-choice{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(255,255,255,.12);background:#17243f;border-radius:16px;padding:12px}
.flavor-choice input{width:auto}
.flavor-actions{display:flex;gap:8px;flex-wrap:wrap}
.flavor-actions .btn{flex:1}
`;
document.head.appendChild(mfFlavorCss);
const mfProductImagesCss = document.createElement("style");
mfProductImagesCss.id = "mfProductImagesStyle";
mfProductImagesCss.textContent = `
.product-img.has-photo{padding:0;overflow:hidden;background:#10192d}
.product-img.has-photo img{width:100%;height:100%;object-fit:cover;display:block}
`;
document.head.appendChild(mfProductImagesCss);
const mfCmsBridgeCss = document.createElement("style");
mfCmsBridgeCss.id = "mfCmsBridgeStyle";
mfCmsBridgeCss.textContent = `
.promo-area{display:grid;gap:10px;margin:12px 0}
.promo-card{border:1px solid rgba(85,224,255,.28);background:linear-gradient(135deg,rgba(124,140,255,.15),rgba(85,224,255,.08));border-radius:20px;padding:14px}
.promo-card h3{margin:.1rem 0 .25rem}
.coupon-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.coupon-chip{border:1px dashed rgba(255,255,255,.25);border-radius:999px;padding:7px 10px;font-weight:900}
.coupon-box{display:flex;gap:8px;margin:8px 0}
.coupon-box input{min-width:0}
.store-closed-warning{border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.1);border-radius:16px;padding:12px;margin-top:10px}
`;
document.head.appendChild(mfCmsBridgeCss);


const state = {
  options: {},
  stores: [],
  categories: [],
  products: [],
  content: [],
  activeStore: null,
  menuCategory: "all",
  menuSearch: "",
  cart: JSON.parse(localStorage.getItem("mf-cart") || "[]"),
  couponCode: localStorage.getItem("mf-coupon") || "",
  storesLoaded: false
};

function money(v){ return BRL.format(Number(v || 0)); }
function esc(v=""){ return String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }
function normalize(v=""){ return String(v).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,""); }
function slug(store){ return normalize(store?.slug || store?.name || "loja").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""); }
function saveCart(){ localStorage.setItem("mf-cart", JSON.stringify(state.cart)); }
function toast(msg,type=""){ const el=document.createElement("div"); el.className="toast "+type; el.textContent=msg; $("#toastArea").append(el); setTimeout(()=>el.remove(),4200); }

function demoStore(){ return { id:"demo", name:"Demo Burger", slug:"demo", status:"open", whatsapp:"5549999999999", deliveryFee:6.5, minOrder:15, headline:"Smash burgers, combos e bebidas em uma experiência de cardápio limpa." }; }
function demoCategories(){ return [{ id:"burgers", storeId:"demo", name:"Burgers" }, { id:"combos", storeId:"demo", name:"Combos" }, { id:"drinks", storeId:"demo", name:"Bebidas" }]; }
function demoProducts(){ return [
  { id:"p1", storeId:"demo", categoryId:"burgers", name:"Smash Duplo", price:28.9, active:true, featured:true, prepTime:22, description:"Dois smash burgers, cheddar e molho forge.", emoji:"🍔" },
  { id:"p2", storeId:"demo", categoryId:"combos", name:"Combo Família", price:79.9, active:true, featured:true, prepTime:35, description:"3 burgers, batata grande e refrigerante 2L.", emoji:"🍟" },
  { id:"p3", storeId:"demo", categoryId:"drinks", name:"Refrigerante lata", price:6.5, active:true, prepTime:2, description:"Escolha o sabor nas observações.", emoji:"🥤" }
];}
function storeCategories(storeId){ const list=state.categories.filter(c=>c.storeId===storeId); return list.length ? list : storeId==="demo" ? demoCategories() : []; }
function storeProducts(storeId){ const list=state.products.filter(p=>p.storeId===storeId); return storeId==="demo" ? demoProducts() : list; }
function productPresetEmoji(p){
  const key = String(p?.imagePreset || "").toLowerCase();
  const map = { burger:"🍔", pizza:"🍕", drink:"🥤", fries:"🍟", sushi:"🍣", dessert:"🍰", salad:"🥗", acai:"🫐", coffee:"☕", plate:"🍽️" };
  return map[key] || p?.emoji || "🍽️";
}
function productImageHtml(p,i){
  return p?.imageUrl
    ? `<div class="product-img has-photo"><img src="${esc(p.imageUrl)}" alt="${esc(p.name || "Produto")}" loading="lazy"></div>`
    : `<div class="product-img">${productPresetEmoji(p) || ["🍔","🍕","🥤","🍟"][i%4]}</div>`;
}
function storeContent(store){
  return state.content.filter(c => c.status === "published" && (!c.storeId || c.storeId === store?.id || c.storeSlug === store?.slug));
}
function publicBanners(store){ return storeContent(store).filter(c => c.type === "banner"); }
function publicCoupons(store){ return storeContent(store).filter(c => c.type === "coupon"); }
function couponCode(c){ return normalize(c.slug || c.title || "").replace(/[^a-z0-9]+/g,""); }
function findCoupon(code){
  const k = normalize(code || "").replace(/[^a-z0-9]+/g,"");
  if(!k || !state.activeStore) return null;
  return publicCoupons(state.activeStore).find(c => couponCode(c) === k) || null;
}
function couponDiscount(coupon, subtotal){
  if(!coupon) return 0;
  const raw = String(coupon.content || coupon.excerpt || coupon.title || "");
  const m = raw.match(/(\d+(?:[,.]\d+)?)/);
  if(!m) return 0;
  const n = Number(m[1].replace(",", "."));
  if(!Number.isFinite(n) || n <= 0) return 0;
  return raw.includes("%") ? Math.min(subtotal, subtotal * n / 100) : Math.min(subtotal, n);
}
function isStoreOpen(store){
  if(!store) return true;
  if(store.status === "closed") return false;
  if(store.status !== "auto") return true;
  const h = store.hours || {};
  if(!h.enabled) return true;
  const now = new Date();
  const day = String(now.getDay());
  const minutes = now.getHours() * 60 + now.getMinutes();
  const ranges = (h.days && h.days[day]) || [];
  return ranges.some(r => {
    const a = String(r[0] || "00:00").split(":").map(Number);
    const b = String(r[1] || "00:00").split(":").map(Number);
    const start = (a[0] || 0) * 60 + (a[1] || 0);
    let end = (b[0] || 0) * 60 + (b[1] || 0);
    if(end < start) end += 24 * 60;
    return minutes >= start && minutes <= end;
  });
}
function renderPromos(store){
  const banners = publicBanners(store);
  const coupons = publicCoupons(store);
  const parts = [];
  banners.slice(0,3).forEach(b => parts.push(`<article class="promo-card"><span class="badge ok">Promoção</span><h3>${esc(b.title)}</h3><p>${esc(b.excerpt || b.content || "")}</p></article>`));
  if(coupons.length) parts.push(`<div class="coupon-strip">${coupons.slice(0,6).map(c => `<span class="coupon-chip">Cupom ${esc(c.slug || c.title)}</span>`).join("")}</div>`);
  if($("#promoArea")) $("#promoArea").innerHTML = parts.join("");
}

function show(view){
  ["homeView","featuresView","menuView"].forEach(id => $("#"+id).classList.add("hidden"));
  $("#"+view).classList.remove("hidden");
}
function route(){
  const hash = location.hash || "#/";
  if(hash === "#/recursos"){ show("featuresView"); return; }
  if(hash.startsWith("#/cardapio")){
    const key = decodeURIComponent(hash.split("/")[2] || "demo");
    const keyNorm = normalize(key);
    if(key === "demo"){
      state.activeStore = demoStore();
    }else{
      state.activeStore = state.stores.find(s => s.id === key || normalize(s.slug || "") === keyNorm || slug(s) === keyNorm) || null;
    }
    show("menuView");
    renderMenu();
    return;
  }
  show("homeView");
}
function renderMenu(){
  const store = state.activeStore;
  if(!store){
    $("#storeHero").innerHTML = `<div class="publicMissing"><h1>Loja não encontrada</h1><p>${state.storesLoaded ? "Essa loja ainda não existe ou o link está errado." : "Carregando loja..."}</p></div>`;
    $("#categoryList").innerHTML = "";
    $("#productGrid").innerHTML = `<div class="empty">${state.storesLoaded ? "Volte ao painel e confira o slug da loja." : "Aguarde os dados carregarem."}</div>`;
    if($("#promoArea")) $("#promoArea").innerHTML = "";
    renderCart();
    return;
  }
  const categories = storeCategories(store.id);
  let products = storeProducts(store.id).filter(p => p.active !== false);
  if(state.menuCategory !== "all") products = products.filter(p => p.categoryId === state.menuCategory);
  const q = normalize(state.menuSearch);
  if(q) products = products.filter(p => normalize(p.name + " " + (p.description || "")).includes(q));

  const open = isStoreOpen(store);
  $("#storeHero").innerHTML = `<h1>${esc(store.name)}</h1><p>${esc(store.headline || "Cardápio digital inteligente.")}</p><div class="badges"><span class="badge ${open ? "ok" : "warn"}">${open ? "Aberto" : "Fechado"}</span><span class="badge">Entrega ${money(store.deliveryFee)}</span><span class="badge">Mínimo ${money(store.minOrder)}</span></div>${open ? "" : `<div class="store-closed-warning">A loja está fechada agora. Você pode visualizar o cardápio, mas confirme o atendimento pelo WhatsApp.</div>`}`;
  renderPromos(store);
  $("#categoryList").innerHTML = `<button class="cat-btn ${state.menuCategory === "all" ? "active" : ""}" data-cat="all">Tudo</button>` + categories.map(c => `<button class="cat-btn ${state.menuCategory === c.id ? "active" : ""}" data-cat="${c.id}">${esc(c.name)}</button>`).join("");
  $$("#categoryList [data-cat]").forEach(btn => btn.onclick = () => { state.menuCategory = btn.dataset.cat; renderMenu(); });
  $("#productGrid").innerHTML = products.map((p,i)=>`<article class="product-card">${productImageHtml(p,i)}<div class="product-body"><div class="badges">${p.featured ? "<span class='badge ok'>Destaque</span>" : ""}<span class="badge">${p.prepTime || 20} min</span></div><h3>${esc(p.name)}</h3><p>${esc(p.description || "Produto do cardápio.")}</p><div class="product-foot"><strong class="price">${money(p.price)}</strong><button class="btn primary" data-add="${p.id}" type="button">${p.multiFlavor ? "Escolher sabores" : "Adicionar"}</button></div></div></article>`).join("") || `<div class="empty">Nenhum produto cadastrado nesta loja ainda.</div>`;
  $$("[data-add]").forEach(btn => btn.onclick = () => {
    const product = storeProducts((state.activeStore || demoStore()).id).find(p => p.id === btn.dataset.add);
    if(product?.multiFlavor) return showFlavorPicker(product);
    addToCart(btn.dataset.add);
  });
  renderCart();
}
function showFlavorPicker(product){
  const max = Math.max(1, Number(product.maxFlavors || 2));
  const flavors = Array.isArray(product.flavors) ? product.flavors : [];
  if(!flavors.length){ addToCart(product.id, []); return; }

  const back = document.createElement("div");
  back.className = "flavor-modal-back";
  back.innerHTML = `<div class="flavor-modal"><h2>${esc(product.name)}</h2><p>Escolha até ${max} sabor(es). O valor final soma os adicionais.</p><div class="flavor-list">${flavors.map((f,i)=>`<label class="flavor-choice"><span><input type="checkbox" value="${i}"> ${esc(f.name)}</span><b>${Number(f.priceDelta||0)?"+ "+money(f.priceDelta):"sem adicional"}</b></label>`).join("")}</div><div class="flavor-actions"><button class="btn ghost" data-close type="button">Cancelar</button><button class="btn primary" data-confirm type="button">Adicionar</button></div></div>`;
  document.body.appendChild(back);

  const checks = Array.from(back.querySelectorAll("input[type=checkbox]"));
  checks.forEach(ch => ch.onchange = () => {
    const selected = checks.filter(x => x.checked);
    if(selected.length > max){ ch.checked = false; toast("Máximo de "+max+" sabor(es).", "err"); }
  });

  back.querySelector("[data-close]").onclick = () => back.remove();
  back.onclick = e => { if(e.target === back) back.remove(); };
  back.querySelector("[data-confirm]").onclick = () => {
    const selected = checks.filter(x => x.checked).map(x => flavors[Number(x.value)]);
    if(!selected.length) return toast("Escolha pelo menos um sabor.", "err");
    addToCart(product.id, selected);
    back.remove();
  };
}

function addToCart(id, selectedFlavors=[]){
  const product = storeProducts((state.activeStore || demoStore()).id).find(p => p.id === id);
  if(!product) return;

  const flavors = Array.isArray(selectedFlavors) ? selectedFlavors : [];
  const flavorText = flavors.map(f => f.name).join(" / ");
  const flavorExtra = flavors.reduce((s,f)=>s+Number(f.priceDelta||0),0);
  const cartId = product.id + (flavorText ? "::" + flavorText : "");

  const item = state.cart.find(i => i.cartId === cartId);
  item ? item.qty++ : state.cart.push({
    cartId,
    id:product.id,
    storeId:product.storeId,
    name:product.name,
    flavors,
    flavorText,
    price:Number(product.price) + flavorExtra,
    basePrice:Number(product.price),
    qty:1
  });

  saveCart(); renderCart(); toast(product.name + " adicionado.", "ok");
}
function cartTotals(){
  const subtotal = state.cart.reduce((s,i)=>s+i.price*i.qty,0);
  const coupon = findCoupon(state.couponCode);
  const discount = couponDiscount(coupon, subtotal);
  const delivery = state.cart.length ? Number((state.activeStore || demoStore()).deliveryFee || 0) : 0;
  return { subtotal, discount, delivery, total:Math.max(0, subtotal - discount) + delivery, coupon };
}
function renderCart(){
  $("#cartCount").textContent = state.cart.reduce((s,i)=>s+i.qty,0);
  $("#cartItems").innerHTML = state.cart.map(i=>`<div class="cart-item"><div><strong>${esc(i.name)}</strong>${i.flavorText ? `<br><small>Sabores: ${esc(i.flavorText)}</small>` : ""}<br><small>${money(i.price)} un.</small></div><div class="qty"><button data-dec="${esc(i.cartId || i.id)}">−</button><b>${i.qty}</b><button data-inc="${esc(i.cartId || i.id)}">+</button></div></div>`).join("") || `<div class="empty">Carrinho vazio.</div>`;
  $$("[data-inc]").forEach(b => b.onclick = () => qty(b.dataset.inc, 1));
  $$("[data-dec]").forEach(b => b.onclick = () => qty(b.dataset.dec, -1));
  const t = cartTotals();
  $("#cartSubtotal").textContent = money(t.subtotal);
  $("#cartDelivery").textContent = money(t.delivery);
  if($("#cartDiscount")) $("#cartDiscount").textContent = "- " + money(t.discount || 0);
  if($("#couponCode")) $("#couponCode").value = state.couponCode || "";
  $("#cartTotal").textContent = money(t.total);
}
function qty(id,delta){
  const item = state.cart.find(i=>(i.cartId || i.id)===id);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) state.cart = state.cart.filter(i=>(i.cartId || i.id)!==id);
  saveCart(); renderCart();
}
function address(order){ const a=order.address||{}; return [a.street,a.number,a.district,a.complement,a.reference].filter(Boolean).join(", "); }
function wa(phone,msg){ const p=String(phone||"").replace(/\D/g,""); return "https://wa.me/"+p+"?text="+encodeURIComponent(msg); }
async function submitOrder(form){
  if(!state.cart.length) return toast("Carrinho vazio.", "err");
  const fd = new FormData(form);
  const store = state.activeStore || demoStore();
  const t = cartTotals();
  const order = {
    storeId: store.id,
    storeName: store.name,
    items: state.cart,
    subtotal: t.subtotal,
    deliveryFee: t.delivery,
    discount: t.discount || 0,
    coupon: t.coupon ? { id:t.coupon.id, code:t.coupon.slug || t.coupon.title, title:t.coupon.title } : null,
    total: t.total,
    status: "new",
    shortId: Math.random().toString(36).slice(2,8).toUpperCase(),
    customer: { name:fd.get("name"), phone:fd.get("phone") },
    address: { street:fd.get("street"), number:fd.get("number"), district:fd.get("district"), complement:fd.get("complement"), reference:fd.get("reference") },
    payment: { method:fd.get("payment"), changeFor:fd.get("changeFor") },
    notes: fd.get("notes"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  try{
    if(store.id !== "demo") await addDoc(collection(db,"orders"), order);
    state.cart = []; saveCart(); renderCart();
    $("#checkoutDialog").close(); $("#cartDrawer").classList.add("hidden");
    if(store.whatsapp) window.open(wa(store.whatsapp, `Novo pedido #${order.shortId}\nTotal: ${money(order.total)}${order.discount ? "\nDesconto: -" + money(order.discount) : ""}${order.coupon ? "\nCupom: " + order.coupon.code : ""}\nCliente: ${order.customer.name}\nEndereço: ${address(order)}\nItens: ${order.items.map(i => `${i.qty}x ${i.name}${i.flavorText ? " ("+i.flavorText+")" : ""}`).join(", ")}`), "_blank", "noopener,noreferrer");
    toast("Pedido criado.", "ok");
  }catch(err){ toast("Erro ao criar pedido: " + err.message, "err"); }
}

function bind(){
  // checkout-close-force-1
  $("#menuSearch").oninput = e => { state.menuSearch = e.target.value; renderMenu(); };
  $("#openCart").onclick = () => $("#cartDrawer").classList.remove("hidden");
  $("#closeCart").onclick = () => $("#cartDrawer").classList.add("hidden");
  $("#checkoutButton").onclick = () => state.cart.length ? $("#checkoutDialog").showModal() : toast("Carrinho vazio.", "err");
  $$("#checkoutDialog [data-close-checkout], #checkoutDialog button[value='cancel'], #checkoutDialog .close").forEach(btn => btn.onclick = e => {
    e.preventDefault();
    $("#checkoutDialog").close();
  });
  $("#checkoutDialog").addEventListener("click", e => {
    if(e.target === $("#checkoutDialog")) $("#checkoutDialog").close();
  });
  if($("#applyCoupon")) $("#applyCoupon").onclick = () => {
    state.couponCode = ($("#couponCode").value || "").trim();
    localStorage.setItem("mf-coupon", state.couponCode);
    const c = findCoupon(state.couponCode);
    renderCart();
    toast(c ? "Cupom aplicado." : "Cupom não encontrado.", c ? "ok" : "err");
  };
  $("#checkoutForm").onsubmit = e => { if(e.submitter?.value === "cancel") return; e.preventDefault(); submitOrder(e.currentTarget); };
  window.addEventListener("hashchange", route);
}
function subscribe(){
  onSnapshot(collection(db,"stores"), snap => { state.stores=snap.docs.map(d=>({id:d.id,...d.data()})); state.storesLoaded=true; route(); }, err => { state.storesLoaded=true; toast("Erro ao carregar lojas: " + err.message, "err"); route(); });
  onSnapshot(collection(db,"categories"), snap => { state.categories=snap.docs.map(d=>({id:d.id,...d.data()})); renderMenu(); }, err => toast("Erro ao carregar categorias: " + err.message, "err"));
  onSnapshot(collection(db,"products"), snap => { state.products=snap.docs.map(d=>({id:d.id,...d.data()})); renderMenu(); }, err => toast("Erro ao carregar produtos: " + err.message, "err"));
  onSnapshot(collection(db,"cms_content"), snap => { state.content=snap.docs.map(d=>({id:d.id,...d.data()})); renderMenu(); renderCart(); }, err => toast("Erro ao carregar conteúdo: " + err.message, "err"));
}
bind();
subscribe();
// public-store-timeout-fix
setTimeout(() => { if(!state.storesLoaded && location.hash.startsWith("#/cardapio")) { state.storesLoaded = true; route(); toast("A loja demorou para carregar. Confira regras do Firestore ou recarregue.", "err"); } }, 8000);
route();
renderCart();

