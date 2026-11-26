// Rede: Supabase Auth + RPC. Toda regra do jogo roda no servidor; aqui só chamamos e tratamos erro.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

export class RpcError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
export async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new RpcError(humanize(error.message), error.code);
  return data;
}
function humanize(m) {
  if (!m) return "erro";
  if (/JWT|not authenticated|não autenticado/i.test(m)) return "Sessão expirou. Entre de novo.";
  return m.replace(/^.*?: /, "");
}
export const auth = {
  async session() { const { data } = await sb.auth.getSession(); return data.session; },
  async signUp(email, password) { const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } }); if (error) throw new RpcError(authMsg(error.message)); return data; },
  async signIn(email, password) { const { data, error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw new RpcError(authMsg(error.message)); return data; },
  async reset(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/?reset=1" }); if (error) throw new RpcError(authMsg(error.message)); },
  async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw new RpcError(authMsg(error.message)); },
  async signOut() { await sb.auth.signOut(); },
  onChange(cb) { sb.auth.onAuthStateChange((ev, s) => cb(ev, s)); },
};
function authMsg(m) {
  const t = { "Invalid login credentials": "E-mail ou senha incorretos.", "Email not confirmed": "Confirme seu e-mail antes de entrar. Veja a caixa de entrada.", "User already registered": "Esse e-mail já tem conta. Entre ou recupere a senha.", "Password should be at least 6 characters": "Senha precisa ter pelo menos 6 caracteres.", "Email rate limit exceeded": "Muitos e-mails enviados. Tente de novo em alguns minutos.", "For security purposes, you can only request this after": "Aguarde um minuto antes de pedir de novo." };
  for (const k in t) if (m.includes(k)) return t[k];
  return m;
}
// RPCs do jogo
export const api = {
  state: () => rpc("get_state"),
  createCharacter: (name, vocation, kingdom) => rpc("create_character", { p_name: name, p_vocation: vocation, p_kingdom: kingdom }),
  simulate: () => rpc("simulate"),
  startHunt: id => rpc("start_hunt", { p_hunt: id }),
  returnHome: () => rpc("return_home"),
  setBehavior: b => rpc("set_behavior", { p: b }),
  equip: id => rpc("equip_item", { p_item: id }),
  unequip: slot => rpc("unequip_item", { p_slot: slot }),
  protect: (id, on) => rpc("protect_item", { p_item: id, p_on: on }),
  sellNpc: id => rpc("sell_npc", { p_item: id }),
  buyShop: (tpl, qty = 1) => rpc("buy_shop", { p_tpl: tpl, p_qty: qty }),
  buyBless: () => rpc("buy_bless"),
  listItem: (id, price, currency = "gold") => rpc("list_item", { p_item: id, p_price: price, p_currency: currency }),
  sendChat: (channel, body) => rpc("send_chat", { p_channel: channel, p_body: body }),
  getChat: (channel, after = 0) => rpc("get_chat", { p_channel: channel, p_after: after }),
  createClan: (name, tag, desc, pay = "gold") => rpc("create_clan", { p_name: name, p_tag: tag, p_desc: desc, p_pay: pay }),
  clans: () => rpc("clans_view"),
  clanAction: (action, target = null) => rpc("clan_action", { p_action: action, p_target: target }),
  createTrade: (to, items, gold, gems, wantGold, wantGems) => rpc("create_trade", { p_to: to, p_items: items, p_gold: gold, p_gems: gems, p_want_gold: wantGold, p_want_gems: wantGems }),
  closeTrade: (id, action) => rpc("close_trade", { p_trade: id, p_action: action }),
  quests: () => rpc("quests_view"),
  questAction: (id, action) => rpc("quest_action", { p_quest: id, p_action: action }),
  dungeon: action => rpc("dungeon_action", { p_action: action, p_dungeon: "dragao" }),
  spendPoints: p => rpc("spend_points", { p }),
  mythic: action => rpc("mythic_action", { p_action: action, p_realm: "eldoria" }),
  // mundos e chefes mundiais
  worlds: () => rpc("worlds_view"),
  travel: w => rpc("travel_world", { p_world: w }),
  worldBoss: (action, boss = null) => rpc("world_boss_action", { p_action: action, p_boss: boss }),
  // Market 2.0
  market2: () => rpc("market_view2"),
  marketHistory: t => rpc("market_history", { p_tpl: t }),
  marketSeen: () => rpc("market_seen"),
  listStack: (t, purity, qty, price, currency) => rpc("list_stack", { p_tpl: t, p_purity: purity, p_qty: qty, p_price: price, p_currency: currency }),
  createOrder: (t, qty, each, currency, minPurity = 0, minRarity = 0) => rpc("create_buy_order", { p_tpl: t, p_qty: qty, p_price_each: each, p_currency: currency, p_min_purity: minPurity, p_min_rarity: minRarity }),
  fulfillOrder: (id, qty, purity, item) => rpc("fulfill_buy_order", { p_order: id, p_qty: qty, p_purity: purity, p_item: item }),
  cancelOrder: id => rpc("cancel_buy_order", { p_order: id }),
  npcBudget: () => rpc("npc_budget_view"),
  // trocas bilaterais
  tradeOpen: to => rpc("trade_open", { p_to: to }),
  tradeSet: (id, items, stacks, gold, gems) => rpc("trade_set", { p_trade: id, p_items: items, p_stacks: stacks, p_gold: gold, p_gems: gems }),
  tradeConfirm: (id, version) => rpc("trade_confirm", { p_trade: id, p_version: version }),
  tradeCancel: id => rpc("trade_cancel", { p_trade: id }),
  // carteira
  wallet: () => rpc("wallet_view"),
  deposit: (pkg, method, ref) => rpc("create_deposit", { p_package: pkg, p_method: method, p_reference: ref }),
  withdraw: (gems, network, address) => rpc("request_usdt_withdrawal", { p_gems: gems, p_network: network, p_address: address }),
  adminP2e: () => rpc("admin_p2e_view"),
  adminDeposit: (id, action, note) => rpc("admin_deposit", { p_id: id, p_action: action, p_note: note || null }),
  adminWithdrawal: (id, action, tx, note) => rpc("admin_withdrawal", { p_id: id, p_action: action, p_tx_hash: tx || null, p_note: note || null }),
  adminReceive: obj => rpc("admin_set_receive", { p_receive: obj }),
  // clã 2.0
  clanVault: (action, args = {}) => rpc("clan_vault_action", { p_action: action, p_args: args }),
  bestiary: () => rpc("bestiary_view"),
  resetPoints: () => rpc("reset_points"),
  chooseClass: id => rpc("choose_class", { p_class: id }),
  chooseSpec: id => rpc("choose_spec", { p_spec: id }),
  nodes: () => rpc("nodes_view"),
  gatherStart: id => rpc("gather_start", { p_node: id }),
  gatherFinish: id => rpc("gather_finish", { p_job: id }),
  gatherCancel: () => rpc("gather_cancel"),
  craftStart: (recipe, technique, qty, choices) => rpc("craft_start", { p_recipe: recipe, p_technique: technique, p_qty: qty, p_choices: choices }),
  craftFinish: id => rpc("craft_finish", { p_job: id }),
  itemAction: (id, action, arg = {}) => rpc("item_action", { p_item: id, p_action: action, p_arg: arg }),
  sellStack: (t, purity, qty) => rpc("sell_stack", { p_tpl: t, p_purity: purity, p_qty: qty }),
  table: async (name, cols = "*") => { const { data, error } = await sb.from(name).select(cols); if (error) throw new RpcError(error.message); return data; },
  cancelListing: id => rpc("cancel_listing", { p_listing: id }),
  buyListing: id => rpc("buy_listing", { p_listing: id }),
  market: () => rpc("market_view"),
  reportsSeen: () => rpc("mark_reports_seen"),
  challenge: rival => rpc("challenge_rival", { p_rival: rival }),
};
