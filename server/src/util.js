export class HttpError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
export const ah=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
export const parse=(schema,data)=>{const r=schema.safeParse(data);if(!r.success)throw new HttpError(400,"VALIDATION_ERROR",r.error.issues[0].message);return r.data};
export const errorHandler=(err,req,res,next)=>{if(err instanceof HttpError)return res.status(err.status).json({error:{code:err.code,message:err.message}});console.error(err);res.status(500).json({error:{code:"SERVER_ERROR",message:"Erreur interne du serveur"}})};
