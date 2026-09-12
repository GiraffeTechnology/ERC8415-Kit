export type State="REGISTERED"|"VERIFIED"|"ACTIVE"|"TRANSFERRED"|"SETTLED"|"REVOKED";
export interface Asset{id:string;holder:string;state:State;frozen:boolean;version:number;metadata:Record<string,unknown>}
export interface Proof{issuer:string;expires_at:number;signature:string}
export class APIError extends Error{status:number;constructor(status:number,message:string)}
export class Client{
 constructor(baseUrl:string,options?:{apiKey?:string;fetchImpl?:typeof fetch;timeoutMs?:number});
 login(username:string,password:string):Promise<{csrf:string}>;
 logout():Promise<{status:string}>;
 register(id:string,holder:string,metadata?:Record<string,unknown>):Promise<Asset>;
 state(id:string):Promise<Asset>;holder(id:string):Promise<{id:string;holder:string}>;
 history(id:string):Promise<Array<{operation:string;version:number;record:Record<string,unknown>;created_at:string}>>;
 assets():Promise<Asset[]>;
 update(id:string,version:number,state:State):Promise<Asset>;
 verify(id:string,version:number,proof:Proof):Promise<Asset>;
 transfer(id:string,version:number,holder:string):Promise<Asset>;
 freeze(id:string,version:number):Promise<Asset>;
 revoke(id:string,version:number):Promise<Asset>;
 settle(id:string,version:number):Promise<Asset>;
}
