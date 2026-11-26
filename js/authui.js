// Telas de conta: entrar, criar conta, recuperar senha, nova senha. Mostra erros em linguagem simples.
import { auth } from "./net.js";
const $ = id => document.getElementById(id);

export function showAuth(onDone) {
  const el = $("auth"); el.hidden = false;
  const msg = (t, bad) => { const m = $("authMsg"); m.textContent = t || ""; m.className = "amsg" + (bad ? " bad" : t ? " ok" : ""); };
  const tabs = el.querySelectorAll("[data-atab]"); const forms = { login: $("fLogin"), signup: $("fSignup"), reset: $("fReset") };
  const show = k => { tabs.forEach(b => b.classList.toggle("on", b.dataset.atab === k)); Object.entries(forms).forEach(([n, f]) => f.hidden = n !== k); msg(""); };
  tabs.forEach(b => b.onclick = () => show(b.dataset.atab));
  const busy = (f, on) => f.querySelectorAll("button,input").forEach(x => x.disabled = on);
  forms.login.onsubmit = async e => { e.preventDefault(); busy(forms.login, true); try { await auth.signIn($("lEmail").value.trim(), $("lPass").value); el.hidden = true; onDone(); } catch (err) { msg(err.message, true); } finally { busy(forms.login, false); } };
  forms.signup.onsubmit = async e => { e.preventDefault(); if (!$("sTerms").checked) return msg("Aceite os termos pra continuar.", true); if ($("sPass").value.length < 8) return msg("Senha com pelo menos 8 caracteres.", true); busy(forms.signup, true);
    try { const r = await auth.signUp($("sEmail").value.trim(), $("sPass").value); if (r.session) { el.hidden = true; onDone(); } else { msg("Conta criada. Confirme pelo link que enviamos pro seu e-mail e depois entre.", false); show("login"); $("lEmail").value = $("sEmail").value.trim(); } } catch (err) { msg(err.message, true); } finally { busy(forms.signup, false); } };
  forms.reset.onsubmit = async e => { e.preventDefault(); busy(forms.reset, true); try { await auth.reset($("rEmail").value.trim()); msg("Se esse e-mail tiver conta, o link de recuperação foi enviado.", false); } catch (err) { msg(err.message, true); } finally { busy(forms.reset, false); } };
  show("login");
}
export function showNewPassword(onDone) {
  const el = $("newpass"); el.hidden = false;
  $("fNewPass").onsubmit = async e => { e.preventDefault(); const p = $("nPass").value; if (p.length < 8) return ($("npMsg").textContent = "Senha com pelo menos 8 caracteres."); try { await auth.updatePassword(p); el.hidden = true; history.replaceState(null, "", location.pathname); onDone(); } catch (err) { $("npMsg").textContent = err.message; } };
}
