import {Router} from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import {z} from "zod";
import rateLimit from "express-rate-limit";
import {db} from "./db.js";
import {HttpError, ah, parse} from "./util.js";

export const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const sha = s => crypto.createHash("sha256").update(s).digest("hex");
export const pub = u => ({id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role});
const access = u => jwt.sign({sub: u.id, role: u.role}, SECRET, {expiresIn: "15m"});

function issue(res, u) {
  const rt = crypto.randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)")
    .run(u.id, sha(rt), new Date(Date.now() + 7 * 864e5).toISOString());
  res.cookie("rt", rt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: 7 * 864e5
  });
  return access(u);
}

export const auth = (req, res, next) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const payload = jwt.verify(token, SECRET);
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(payload.sub);
    if (!user) throw new HttpError(401, "UNAUTHORIZED", "Authentification requise");
    if (user.blocked) throw new HttpError(403, "FORBIDDEN", "Ce compte est suspendu");
    req.user = user;
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "UNAUTHORIZED", "Authentification requise"));
  }
};
export const role = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : next(new HttpError(403, "FORBIDDEN", "Accès réservé"));

const limiter = rateLimit({
  windowMs: 60000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {error: {code: "RATE_LIMITED", message: "Trop de tentatives, réessayez dans une minute"}}
});
const reg = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(60),
  email: z.string().trim().email("Email invalide"),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8, "Mot de passe : 8 caractères minimum"),
  role: z.enum(["client", "owner"]).default("client")
});
const r = Router();

r.post("/register", limiter, ah((req, res) => {
  const d = parse(reg, req.body);
  if (db.prepare("SELECT 1 FROM users WHERE email=?").get(d.email.toLowerCase())) throw new HttpError(409, "CONFLICT", "Cet email est déjà utilisé");
  const id = db.prepare("INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,?)")
    .run(d.name, d.email.toLowerCase(), d.phone || "", bcrypt.hashSync(d.password, 10), d.role).lastInsertRowid;
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  res.status(201).json({data: {user: pub(u), accessToken: issue(res, u)}});
}));

r.post("/login", limiter, ah((req, res) => {
  const d = parse(z.object({email: z.string().trim(), password: z.string()}), req.body);
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(d.email.toLowerCase());
  if (!u || !bcrypt.compareSync(d.password, u.password_hash)) throw new HttpError(401, "UNAUTHORIZED", "Email ou mot de passe incorrect");
  if (u.blocked) throw new HttpError(403, "FORBIDDEN", "Ce compte est suspendu");
  res.json({data: {user: pub(u), accessToken: issue(res, u)}});
}));

r.post("/refresh", ah((req, res) => {
  const rt = req.cookies?.rt;
  const row = rt && db.prepare("SELECT * FROM refresh_tokens WHERE token_hash=? AND revoked=0").get(sha(rt));
  if (!row || row.expires_at < new Date().toISOString()) throw new HttpError(401, "UNAUTHORIZED", "Session expirée");
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(row.user_id);
  if (!u || u.blocked) throw new HttpError(403, "FORBIDDEN", "Ce compte est suspendu");
  db.prepare("UPDATE refresh_tokens SET revoked=1 WHERE id=?").run(row.id);
  res.json({data: {user: pub(u), accessToken: issue(res, u)}});
}));

r.post("/logout", ah((req, res) => {
  const rt = req.cookies?.rt;
  if (rt) db.prepare("UPDATE refresh_tokens SET revoked=1 WHERE token_hash=?").run(sha(rt));
  res.clearCookie("rt", {path: "/api/auth"});
  res.json({data: {ok: true}});
}));

r.get("/me", auth, (req, res) => res.json({data: pub(req.user)}));

r.patch("/me", auth, ah((req, res) => {
  const d = parse(z.object({
    name: z.string().trim().min(2).max(60).optional(),
    phone: z.string().max(20).optional()
  }), req.body);
  db.prepare("UPDATE users SET name=?,phone=? WHERE id=?")
    .run(d.name ?? req.user.name, d.phone ?? req.user.phone, req.user.id);
  res.json({data: pub(db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id))});
}));

export default r;
