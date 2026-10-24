import axios from "axios";
let token=null;export const setToken=t=>{token=t};export const getToken=()=>token;
const http=axios.create({baseURL:"/api",withCredentials:true});
http.interceptors.request.use(c=>{if(token)c.headers.Authorization="Bearer "+token;return c});
let refreshing=null;
export const refresh=()=>(refreshing??=axios.post("/api/auth/refresh",null,{withCredentials:true}).then(r=>{token=r.data.data.accessToken;return r.data.data}).finally(()=>{refreshing=null}));
http.interceptors.response.use(r=>r,async e=>{const c=e.config;
if(e.response?.status===401&&c&&!c._r&&!c.url.startsWith("/auth/")){c._r=true;try{await refresh();return http(c)}catch{window.dispatchEvent(new Event("pulse:logout"))}}
return Promise.reject(e)});
export const errMsg=e=>e.response?.data?.error?.message||"Une erreur est survenue. Vérifiez votre connexion.";
const un=p=>p.then(r=>r.data.data);
export const api={get:(u,o)=>un(http.get(u,o)),post:(u,b)=>un(http.post(u,b)),patch:(u,b)=>un(http.patch(u,b)),put:(u,b)=>un(http.put(u,b)),del:u=>un(http.delete(u))};
