import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
const mfHoursPhase4Css = document.createElement("style");
mfHoursPhase4Css.id = "mfHoursPhase4Style";
mfHoursPhase4Css.textContent = `
#checkoutButton.is-closed{opacity:.62;filter:grayscale(.35);cursor:not-allowed}
.store-closed-warning{border:1px solid rgba(239,68,68,.45);background:rgba(239,68,68,.10);border-radius:16px;padding:12px;margin-top:10px}
`;
document.head.appendChild(mfHoursPhase4Css);
const mfCmsPhase3Css = document.createElement("style");
mfCmsPhase3Css.id = "mfCmsPhase3Style";
mfCmsPhase3Css.textContent = `
.promo-area{display:grid;gap:10px;margin:12px 0}
.promo-card{border:1px solid rgba(85,224,255,.28);background:linear-gradient(135deg,rgba(124,140,255,.16),rgba(85,224,255,.08));border-radius:20px;padding:15px;box-shadow:0 14px 34px rgba(0,0,0,.18)}
.promo-card h3{margin:.2rem 0 .3rem;font-size:1.15rem}
.promo-card p{margin:.2rem 0;color:var(--muted)}
.coupon-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.coupon-chip{border:1px dashed rgba(255,255,255,.25);background:rgba(255,255,255,.05);border-radius:999px;padding:7px 10px;font-weight:900}
.coupon-box{display:grid;grid-template-columns:1fr auto auto;gap:8px;margin:8px 0}
.coupon-box input{min-width:0}
.coupon-status{margin:2px 0 8px;font-size:.88rem;color:var(--muted)}
.coupon-status.ok{color:#22c55e}
.coupon-status.err{color:#ef4444}
@media(max-width:650px){.coupon-box{grid-template-columns:1fr}.coupon-box .btn{width:100%}}
`;
document.head.appendChild(mfCmsPhase3Css);
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
function contentStoreMatches(item, store){
  if(!item || !store) return false;
  const itemStoreId = String(item.storeId || "").trim();
  const itemStoreSlug = normalize(item.storeSlug || item.store || "");
  const activeSlug = normalize(store.slug || "");
  return !itemStoreId && !itemStoreSlug || itemStoreId === store.id || itemStoreSlug === activeSlug || itemStoreSlug === slug(store);
}

function publishedContent(store, type){
  return state.content
    .filter(item => item && item.status === "published")
    .filter(item => !type || item.type === type)
    .filter(item => contentStoreMatches(item, store))
    .sort((a,b) => Number(a.order ?? a.priority ?? 0) - Number(b.order ?? b.priority ?? 0));
}

function publicBanners(store){
  return publishedContent(store, "banner");
}

function publicCoupons(store){
  return publishedContent(store, "coupon");
}

function couponCode(coupon){
  return normalize(coupon?.slug || coupon?.code || coupon?.title || "").replace(/[^a-z0-9]+/g,"");
}

function normalizeCouponCode(code){
  return normalize(code || "").replace(/[^a-z0-9]+/g,"");
}

function findCoupon(code){
  const normalized = normalizeCouponCode(code);
  if(!normalized || !state.activeStore) return null;
  return publicCoupons(state.activeStore).find(coupon => couponCode(coupon) === normalized) || null;
}

function parseCouponConfig(coupon){
  if(!coupon) return null;

  const raw = String(coupon.content || coupon.excerpt || coupon.description || coupon.title || "").trim();
  let parsed = null;

  if(raw.startsWith("{") && raw.endsWith("}")){
    try{
      const data = JSON.parse(raw);
      const mode = String(data.mode || data.type || data.kind || "").toLowerCase();
      const value = Number(data.value ?? data.amount ?? data.discount ?? data.percent ?? 0);
      parsed = {
        mode: mode === "fixed" || mode === "value" || mode === "valor" ? "fixed" : "percent",
        value,
        minSubtotal: Number(data.minSubtotal || data.minimum || data.min || 0),
        maxDiscount: Number(data.maxDiscount || data.max || 0),
        label: data.label || ""
      };
    }catch(err){
      parsed = null;
    }
  }

  if(!parsed){
    const match = raw.match(/(\d+(?:[,.]\d+)?)/);
    const value = match ? Number(match[1].replace(",", ".")) : 0;
    parsed = {
      mode: raw.includes("%") ? "percent" : "fixed",
      value,
      minSubtotal: 0,
      maxDiscount: 0,
      label: ""
    };
  }

  if(!Number.isFinite(parsed.value) || parsed.value <= 0) return null;
  if(!Number.isFinite(parsed.minSubtotal) || parsed.minSubtotal < 0) parsed.minSubtotal = 0;
  if(!Number.isFinite(parsed.maxDiscount) || parsed.maxDiscount < 0) parsed.maxDiscount = 0;

  return parsed;
}

function couponDiscount(coupon, subtotal){
  const cfg = parseCouponConfig(coupon);
  if(!cfg || subtotal <= 0) return 0;
  if(cfg.minSubtotal && subtotal < cfg.minSubtotal) return 0;

  let discount = cfg.mode === "percent" ? subtotal * cfg.value / 100 : cfg.value;
  if(cfg.maxDiscount > 0) discount = Math.min(discount, cfg.maxDiscount);
  return Math.max(0, Math.min(subtotal, discount));
}

function couponLabel(coupon){
  const cfg = parseCouponConfig(coupon);
  if(!coupon || !cfg) return "";
  if(cfg.label) return cfg.label;
  return cfg.mode === "percent" ? `${cfg.value}% de desconto` : `${money(cfg.value)} de desconto`;
}

function renderPromos(store){
  const area = $("#promoArea");
  if(!area) return;

  const banners = publicBanners(store).slice(0, 3);
  const coupons = publicCoupons(store).slice(0, 6);
  const html = [];

  banners.forEach(banner => {
    html.push(`<article class="promo-card"><span class="badge ok">Promoção</span><h3>${esc(banner.title || "Promoção")}</h3><p>${esc(banner.excerpt || banner.content || "")}</p></article>`);
  });

  if(coupons.length){
    html.push(`<div class="coupon-strip">${coupons.map(coupon => `<button class="coupon-chip" type="button" data-use-coupon="${esc(coupon.slug || coupon.code || coupon.title || "")}">Cupom ${esc(coupon.slug || coupon.code || coupon.title || "")}</button>`).join("")}</div>`);
  }

  area.innerHTML = html.join("");

  $$("[data-use-coupon]", area).forEach(btn => {
    btn.onclick = () => {
      state.couponCode = String(btn.dataset.useCoupon || "").trim();
      localStorage.setItem("mf-coupon", state.couponCode);
      renderCart();
      $("#cartDrawer").classList.remove("hidden");
      toast("Cupom selecionado.", "ok");
    };
  });
}
function show(view){
  ["homeView","featuresView","menuView"].forEach(id => $("#"+id).classList.add("hidden"));
  $("#"+view).classList.remove("hidden");
}
function publicStoreKeyFromUrl(){
  const params = new URLSearchParams(location.search || "");
  const queryKey = params.get("loja") || params.get("store") || params.get("slug") || params.get("cardapio") || "";
  if(queryKey) return decodeURIComponent(queryKey);

  const hash = location.hash || "";
  if(hash.startsWith("#/cardapio")){
    return decodeURIComponent(hash.split("/")[2] || "demo");
  }

  return "";
}

function setCanonicalStoreHash(key){
  if(!key || (location.hash || "").startsWith("#/cardapio")) return;
  try{
    history.replaceState(null, "", location.pathname + location.search + "#/cardapio/" + encodeURIComponent(key));
  }catch(err){
    location.hash = "#/cardapio/" + encodeURIComponent(key);
  }
}

function findStoreByKey(key){
  const clean = String(key || "demo").trim();
  const cleanNorm = normalize(clean);

  if(!clean || clean === "demo"){
    return demoStore();
  }

  return state.stores.find(store =>
    store.id === clean ||
    normalize(store.slug || "") === cleanNorm ||
    slug(store) === cleanNorm
  ) || null;
}

function route(){
  const hash = location.hash || "#/";
  const urlStoreKey = publicStoreKeyFromUrl();

  if(hash === "#/recursos"){
    show("featuresView");
    return;
  }

  if(hash.startsWith("#/cardapio") || urlStoreKey){
    const key = urlStoreKey || decodeURIComponent(hash.split("/")[2] || "demo");
    setCanonicalStoreHash(key);
    state.activeStore = findStoreByKey(key);
    show("menuView");
    renderMenu();
    return;
  }

  show("homeView");
}
function parseTimeToMinutes(value){
  const match = String(value || "").trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if(!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeStoreHoursRange(range){
  if(Array.isArray(range)){
    return {
      open:String(range[0] || "").trim(),
      close:String(range[1] || "").trim()
    };
  }

  if(range && typeof range === "object"){
    return {
      open:String(range.open || range.from || range.start || "").trim(),
      close:String(range.close || range.to || range.end || "").trim()
    };
  }

  return null;
}

function normalizeStoreHours(store){
  const raw = store?.hours || store?.openingHours || {};
  const scheduleRaw = raw.schedule || raw.days || {};
  const schedule = {};

  for(let day=0; day<7; day++){
    const key = String(day);
    const ranges = Array.isArray(scheduleRaw[key]) ? scheduleRaw[key] : [];

    schedule[key] = ranges
      .map(normalizeStoreHoursRange)
      .filter(range => range && range.open && range.close);
  }

  return {
    isAuto: raw.isAuto === true || raw.enabled === true || store?.status === "auto",
    schedule
  };
}

function isMinuteInsideRange(nowMinutes, startMinutes, endMinutes){
  if(startMinutes === null || endMinutes === null) return false;
  if(startMinutes === endMinutes) return true;
  if(endMinutes > startMinutes) return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
}

function isStoreOpen(store, date = new Date()){
  if(!store) return true;
  if(store.status === "closed") return false;

  const cfg = normalizeStoreHours(store);

  if(!cfg.isAuto){
    return store.status !== "closed";
  }

  const dayKey = String(date.getDay());
  const ranges = cfg.schedule[dayKey] || [];

  if(!ranges.length) return false;

  const nowMinutes = date.getHours() * 60 + date.getMinutes();

  return ranges.some(range => {
    const start = parseTimeToMinutes(range.open);
    const end = parseTimeToMinutes(range.close);
    return isMinuteInsideRange(nowMinutes, start, end);
  });
}

function storeHoursText(store){
  const cfg = normalizeStoreHours(store);
  const names = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  return names.map((name,index) => {
    const ranges = cfg.schedule[String(index)] || [];
    return `${name}: ${ranges.length ? ranges.map(r => `${r.open} às ${r.close}`).join(", ") : "fechado"}`;
  }).join(" · ");
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

  const open = isStoreOpen(store);
  const categories = storeCategories(store.id);
  let products = storeProducts(store.id).filter(p => p.active !== false);

  if(state.menuCategory !== "all") products = products.filter(p => p.categoryId === state.menuCategory);

  const q = normalize(state.menuSearch);
  if(q) products = products.filter(p => normalize(p.name + " " + (p.description || "")).includes(q));

  $("#storeHero").innerHTML = `<h1>${esc(store.name)}</h1><p>${esc(store.headline || "Cardápio digital inteligente.")}</p><div class="badges"><span class="badge ${open ? "ok" : "warn"}">${open ? "Aberto" : "Fechado"}</span><span class="badge">Entrega ${money(store.deliveryFee)}</span><span class="badge">Mínimo ${money(store.minOrder)}</span></div>${open ? "" : `<div class="store-closed-warning"><b>No momento estamos fechados.</b><br>${esc(storeHoursText(store))}</div>`}`;

  if(typeof renderPromos === "function") renderPromos(store);

  $("#categoryList").innerHTML = `<button class="cat-btn ${state.menuCategory === "all" ? "active" : ""}" data-cat="all">Tudo</button>` + categories.map(c => `<button class="cat-btn ${state.menuCategory === c.id ? "active" : ""}" data-cat="${c.id}">${esc(c.name)}</button>`).join("");

  $$("#categoryList [data-cat]").forEach(btn => btn.onclick = () => {
    state.menuCategory = btn.dataset.cat;
    renderMenu();
  });

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
  const subtotal = state.cart.reduce((sum,item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  const delivery = state.cart.length ? Number((state.activeStore || demoStore()).deliveryFee || 0) : 0;
  const coupon = findCoupon(state.couponCode);
  const discount = couponDiscount(coupon, subtotal);
  const total = Math.max(0, subtotal - discount) + delivery;

  return {
    subtotal,
    delivery,
    discount,
    total,
    coupon,
    couponCode: coupon ? (coupon.slug || coupon.code || coupon.title || state.couponCode) : "",
    couponLabel: coupon ? couponLabel(coupon) : "",
    couponValid: !!coupon,
    couponTyped: !!String(state.couponCode || "").trim()
  };
}

function renderCart(){
  const totalQty = state.cart.reduce((sum,item) => sum + Number(item.qty || 0), 0);
  $("#cartCount").textContent = totalQty;

  $("#cartItems").innerHTML = state.cart.map(item => {
    const itemKey = esc(item.cartId || item.id);
    const flavor = item.flavorText ? `<br><small>Sabores: ${esc(item.flavorText)}</small>` : "";
    return `<div class="cart-item"><div><strong>${esc(item.name)}</strong>${flavor}<br><small>${money(item.price)} un.</small></div><div class="qty"><button data-dec="${itemKey}" type="button">−</button><b>${esc(item.qty)}</b><button data-inc="${itemKey}" type="button">+</button></div></div>`;
  }).join("") || `<div class="empty">Carrinho vazio.</div>`;

  $$("[data-inc]").forEach(button => button.onclick = () => qty(button.dataset.inc, 1));
  $$("[data-dec]").forEach(button => button.onclick = () => qty(button.dataset.dec, -1));

  const totals = cartTotals();

  $("#cartSubtotal").textContent = money(totals.subtotal);
  $("#cartDelivery").textContent = money(totals.delivery);
  $("#cartTotal").textContent = money(totals.total);

  if($("#cartDiscount")){
    $("#cartDiscount").textContent = totals.discount ? "- " + money(totals.discount) : money(0);
  }

  if($("#couponCode")){
    $("#couponCode").value = state.couponCode || "";
  }

  if($("#couponStatus")){
    $("#couponStatus").className = "coupon-status";

    if(totals.couponTyped && totals.couponValid && totals.discount > 0){
      $("#couponStatus").classList.add("ok");
      $("#couponStatus").textContent = `Cupom ${totals.couponCode} aplicado: ${totals.couponLabel}.`;
    }else if(totals.couponTyped && totals.couponValid && totals.discount <= 0){
      const cfg = parseCouponConfig(totals.coupon);
      $("#couponStatus").classList.add("err");
      $("#couponStatus").textContent = cfg && cfg.minSubtotal ? `Cupom válido, mas exige subtotal mínimo de ${money(cfg.minSubtotal)}.` : "Cupom válido, mas sem desconto aplicável neste carrinho.";
    }else if(totals.couponTyped && !totals.couponValid){
      $("#couponStatus").classList.add("err");
      $("#couponStatus").textContent = "Cupom não encontrado ou indisponível para esta loja.";
    }else{
      $("#couponStatus").textContent = "Digite um cupom publicado no ForgeCMS.";
    }
  }

  const checkoutButton = $("#checkoutButton");
  if(checkoutButton){
    const open = isStoreOpen(state.activeStore || demoStore());
    checkoutButton.classList.toggle("is-closed", !open);
    checkoutButton.setAttribute("aria-disabled", open ? "false" : "true");
    checkoutButton.title = open ? "Finalizar pedido" : "No momento estamos fechados. Confira nossos horários de atendimento.";
    checkoutButton.textContent = open ? "Finalizar pedido" : "Loja fechada";
  }
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
async async async function submitOrder(form){
  if(!state.cart.length) return toast("Carrinho vazio.", "err");

  const store = state.activeStore || demoStore();

  if(!isStoreOpen(store)){
    toast("No momento estamos fechados. Confira nossos horários de atendimento.", "err");
    renderMenu();
    renderCart();
    return;
  }

  const fd = new FormData(form);
  const totals = cartTotals();

  const order = {
    storeId: store.id,
    storeName: store.name,
    items: state.cart.map(item => ({
      cartId: item.cartId || item.id,
      id: item.id,
      storeId: item.storeId,
      name: item.name,
      flavors: item.flavors || [],
      flavorText: item.flavorText || "",
      price: Number(item.price || 0),
      basePrice: Number(item.basePrice || item.price || 0),
      qty: Number(item.qty || 1)
    })),
    subtotal: totals.subtotal,
    deliveryFee: totals.delivery,
    discount: totals.discount || 0,
    total: totals.total,
    coupon: totals.coupon ? {
      id: totals.coupon.id,
      code: totals.couponCode,
      title: totals.coupon.title || "",
      label: totals.couponLabel,
      rawContent: totals.coupon.content || ""
    } : null,
    storeHours: normalizeStoreHours(store),
    status: "new",
    shortId: Math.random().toString(36).slice(2,8).toUpperCase(),
    customer: {
      name: fd.get("name"),
      phone: fd.get("phone")
    },
    address: {
      street: fd.get("street"),
      number: fd.get("number"),
      district: fd.get("district"),
      complement: fd.get("complement"),
      reference: fd.get("reference")
    },
    payment: {
      method: fd.get("payment"),
      changeFor: fd.get("changeFor")
    },
    notes: fd.get("notes"),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const lines = [
    `Novo pedido #${order.shortId}`,
    `Subtotal: ${money(order.subtotal)}`,
    order.discount ? `Desconto: -${money(order.discount)}` : "",
    order.coupon ? `Cupom: ${order.coupon.code} (${order.coupon.label})` : "",
    `Entrega: ${money(order.deliveryFee)}`,
    `Total: ${money(order.total)}`,
    `Cliente: ${order.customer.name}`,
    `WhatsApp: ${order.customer.phone}`,
    `Endereço: ${address(order)}`,
    `Pagamento: ${order.payment.method}${order.payment.changeFor ? " · Troco para " + order.payment.changeFor : ""}`,
    order.notes ? `Obs: ${order.notes}` : "",
    `Itens: ${order.items.map(item => `${item.qty}x ${item.name}${item.flavorText ? " (" + item.flavorText + ")" : ""}`).join(", ")}`
  ].filter(Boolean);

  try{
    if(store.id !== "demo"){
      await addDoc(collection(db,"orders"), order);
    }

    state.cart = [];
    state.couponCode = "";
    localStorage.removeItem("mf-coupon");
    saveCart();
    renderCart();

    $("#checkoutDialog").close();
    $("#cartDrawer").classList.add("hidden");

    if(store.whatsapp){
      window.open(wa(store.whatsapp, lines.join("\n")), "_blank", "noopener,noreferrer");
    }

    toast("Pedido criado.", "ok");
  }catch(err){
    toast("Erro ao criar pedido: " + err.message, "err");
  }
}
function bind(){
  $("#menuSearch").oninput = event => {
    state.menuSearch = event.target.value;
    renderMenu();
  };

  $("#openCart").onclick = () => $("#cartDrawer").classList.remove("hidden");
  $("#closeCart").onclick = () => $("#cartDrawer").classList.add("hidden");

  $("#checkoutButton").onclick = () => {
    const store = state.activeStore || demoStore();

    if(!isStoreOpen(store)){
      toast("No momento estamos fechados. Confira nossos horários de atendimento.", "err");
      renderMenu();
      renderCart();
      return;
    }

    state.cart.length ? $("#checkoutDialog").showModal() : toast("Carrinho vazio.", "err");
  };

  $$("#checkoutDialog [data-close-checkout], #checkoutDialog button[value='cancel'], #checkoutDialog .close").forEach(button => {
    button.onclick = event => {
      event.preventDefault();
      $("#checkoutDialog").close();
    };
  });

  $("#checkoutDialog").addEventListener("click", event => {
    if(event.target === $("#checkoutDialog")){
      $("#checkoutDialog").close();
    }
  });

  if($("#applyCoupon")){
    $("#applyCoupon").onclick = () => {
      const typed = ($("#couponCode").value || "").trim();

      if(!typed){
        state.couponCode = "";
        localStorage.removeItem("mf-coupon");
        renderCart();
        toast("Cupom removido.", "ok");
        return;
      }

      const coupon = findCoupon(typed);

      if(!coupon){
        state.couponCode = typed;
        localStorage.setItem("mf-coupon", state.couponCode);
        renderCart();
        toast("Cupom não encontrado.", "err");
        return;
      }

      state.couponCode = coupon.slug || coupon.code || coupon.title || typed;
      localStorage.setItem("mf-coupon", state.couponCode);
      renderCart();
      toast("Cupom aplicado.", "ok");
    };
  }

  if($("#clearCoupon")){
    $("#clearCoupon").onclick = () => {
      state.couponCode = "";
      localStorage.removeItem("mf-coupon");
      renderCart();
      toast("Cupom limpo.", "ok");
    };
  }

  $("#checkoutForm").onsubmit = event => {
    if(event.submitter?.value === "cancel") return;
    event.preventDefault();
    submitOrder(event.currentTarget);
  };

  window.addEventListener("hashchange", route);
}
function subscribe(){
  onSnapshot(collection(db,"stores"), snap => {
    state.stores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    state.storesLoaded = true;
    route();
  }, err => {
    state.storesLoaded = true;
    toast("Erro ao carregar lojas: " + err.message, "err");
    route();
  });

  onSnapshot(collection(db,"categories"), snap => {
    state.categories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMenu();
  }, err => toast("Erro ao carregar categorias: " + err.message, "err"));

  onSnapshot(collection(db,"products"), snap => {
    state.products = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMenu();
  }, err => toast("Erro ao carregar produtos: " + err.message, "err"));

  const publishedContentQuery = query(collection(db,"cms_content"), where("status","==","published"));

  onSnapshot(publishedContentQuery, snap => {
    state.content = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMenu();
    renderCart();
  }, err => toast("Erro ao carregar banners e cupons: " + err.message, "err"));
}
bind();
subscribe();
// public-store-timeout-fix
setTimeout(() => { if(!state.storesLoaded && location.hash.startsWith("#/cardapio")) { state.storesLoaded = true; route(); toast("A loja demorou para carregar. Confira regras do Firestore ou recarregue.", "err"); } }, 8000);
route();
renderCart();

