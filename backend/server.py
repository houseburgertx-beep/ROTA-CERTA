from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import json
import base64
import httpx
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, BeforeValidator
from typing import List, Optional, Annotated, Literal
from bson import ObjectId
import uuid
import jwt
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret-change-me')
JWT_ALGO = 'HS256'
TOKEN_HOURS = 24 * 7
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODEL = 'qwen/qwen3.6-27b'
GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ----------------------- Helpers -----------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


PyObjectId = Annotated[str, BeforeValidator(str)]


def serialize(doc: dict) -> dict:
    """Convert a mongo doc to a JSON-safe dict (id as str, datetimes as iso)."""
    if not doc:
        return doc
    out = dict(doc)
    if "_id" in out:
        out["id"] = str(out.pop("_id"))
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = iso(v)
        if isinstance(v, ObjectId):
            out[k] = str(v)
    out.pop("password_hash", None)
    return out


def haversine(lat1, lon1, lat2, lon2) -> float:
    """Distance in km."""
    if None in (lat1, lon1, lat2, lon2):
        return 0.0
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def geocode(address: str):
    """Free geocoding via OpenStreetMap Nominatim. Returns (lat, lng) or (None, None)."""
    if not address or len(address.strip()) < 4:
        return None, None
    try:
        async with httpx.AsyncClient(timeout=10) as hc:
            r = await hc.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": address, "format": "json", "limit": 1, "countrycodes": "br"},
                headers={"User-Agent": "RotaCerta/1.0 (delivery app)"},
            )
            data = r.json()
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        logger.warning(f"geocode failed: {e}")
    return None, None


# ----------------------- Models -----------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=4, max_length=128)
    business_name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class DriverIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=4, max_length=128)
    phone: Optional[str] = None
    vehicle: Optional[str] = None


class DriverUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    vehicle: Optional[str] = None
    active: Optional[bool] = None


class ScanIn(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"


class DeliveryIn(BaseModel):
    customer_name: str
    address: str
    payment_method: str = "dinheiro"  # dinheiro | cartao | pix
    order_value: float = 0.0
    delivery_fee: float = 0.0
    notes: Optional[str] = None
    max_time: Optional[str] = None  # HH:MM deadline
    driver_id: Optional[str] = None


class DeliveryUpdate(BaseModel):
    customer_name: Optional[str] = None
    address: Optional[str] = None
    payment_method: Optional[str] = None
    order_value: Optional[float] = None
    delivery_fee: Optional[float] = None
    notes: Optional[str] = None
    max_time: Optional[str] = None
    driver_id: Optional[str] = None


class StatusUpdate(BaseModel):
    status: Literal["aguardando", "em_rota", "entregue", "problema"]
    problem_note: Optional[str] = None


class LocationIn(BaseModel):
    lat: float
    lng: float


class OptimizeIn(BaseModel):
    driver_id: str
    delivery_ids: List[str]
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None


# ----------------------- Auth -----------------------
def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now_utc(),
        "exp": now_utc() + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = payload.get("sub")
        doc = await db.users.find_one({"_id": ObjectId(uid)})
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")
    if not doc:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    return doc


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao gestor")
    return user


async def push_notification(user_id: str, title: str, body: str, kind: str = "info"):
    await db.notifications.insert_one({
        "user_id": user_id,
        "title": title,
        "body": body,
        "kind": kind,
        "read": False,
        "created_at": now_utc(),
    })


# ----------------------- Auth routes -----------------------
@api_router.get("/")
async def root():
    return {"message": "Rota Certa API"}


@api_router.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")
    doc = {
        "name": body.name,
        "email": email,
        "password_hash": pwd_context.hash(body.password),
        "role": "admin",
        "business_name": body.business_name or body.name,
        "created_at": now_utc(),
        "active": True,
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    token = create_token(str(res.inserted_id), "admin")
    return {"token": token, "user": serialize(doc)}


@api_router.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower()
    doc = await db.users.find_one({"email": email})
    if not doc or not pwd_context.verify(body.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    if not doc.get("active", True):
        raise HTTPException(status_code=403, detail="Conta desativada")
    token = create_token(str(doc["_id"]), doc["role"])
    return {"token": token, "user": serialize(doc)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize(user)


# ----------------------- Drivers (motoboys) -----------------------
@api_router.post("/drivers")
async def create_driver(body: DriverIn, admin: dict = Depends(require_admin)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")
    doc = {
        "name": body.name,
        "email": email,
        "password_hash": pwd_context.hash(body.password),
        "role": "driver",
        "phone": body.phone,
        "vehicle": body.vehicle,
        "admin_id": str(admin["_id"]),
        "active": True,
        "lat": None,
        "lng": None,
        "last_seen": None,
        "created_at": now_utc(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize(doc)


@api_router.get("/drivers")
async def list_drivers(admin: dict = Depends(require_admin)):
    cursor = db.users.find({"role": "driver", "admin_id": str(admin["_id"])}).sort("created_at", -1)
    out = []
    async for d in cursor:
        s = serialize(d)
        # active delivery count
        s["active_deliveries"] = await db.deliveries.count_documents({
            "driver_id": str(d["_id"]), "status": {"$in": ["aguardando", "em_rota"]}
        })
        out.append(s)
    return out


@api_router.get("/drivers/locations")
async def driver_locations(admin: dict = Depends(require_admin)):
    cursor = db.users.find({"role": "driver", "admin_id": str(admin["_id"]), "lat": {"$ne": None}})
    return [serialize(d) for d in await cursor.to_list(200)]


@api_router.put("/drivers/{driver_id}")
async def update_driver(driver_id: str, body: DriverUpdate, admin: dict = Depends(require_admin)):
    upd = {k: v for k, v in body.dict().items() if v is not None}
    if not upd:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = await db.users.update_one(
        {"_id": ObjectId(driver_id), "role": "driver", "admin_id": str(admin["_id"])},
        {"$set": upd},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Motoboy não encontrado")
    doc = await db.users.find_one({"_id": ObjectId(driver_id)})
    return serialize(doc)


@api_router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, admin: dict = Depends(require_admin)):
    await db.users.delete_one({"_id": ObjectId(driver_id), "role": "driver", "admin_id": str(admin["_id"])})
    await db.deliveries.update_many(
        {"driver_id": driver_id, "admin_id": str(admin["_id"])}, {"$set": {"driver_id": None}}
    )
    return {"ok": True}


# ----------------------- Comanda scan (Groq vision) -----------------------
SCAN_PROMPT = (
    "Você é um assistente que lê comandas/pedidos de delivery em português do Brasil. "
    "Extraia os dados da imagem e responda APENAS com um objeto JSON válido, sem texto extra, "
    "no formato: {\"customer_name\": string, \"address\": string, \"payment_method\": "
    "\"dinheiro\"|\"cartao\"|\"pix\", \"order_value\": number, \"delivery_fee\": number, "
    "\"notes\": string}. Use string vazia ou 0 quando não encontrar. "
    "payment_method deve ser exatamente dinheiro, cartao ou pix."
)


@api_router.post("/deliveries/scan")
async def scan_comanda(body: ScanIn, admin: dict = Depends(require_admin)):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="Chave da Groq não configurada. Adicione GROQ_API_KEY.")
    data_url = f"data:{body.mime_type};base64,{body.image_base64}"
    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": SCAN_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "max_tokens": 2048,
    }
    try:
        async with httpx.AsyncClient(timeout=60) as hc:
            r = await hc.post(GROQ_URL, json=payload, headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            })
        if r.status_code != 200:
            logger.error(f"Groq error {r.status_code}: {r.text}")
            raise HTTPException(status_code=502, detail=f"Erro na IA (Groq): {r.status_code}")
        content = r.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"scan failed: {e}")
        raise HTTPException(status_code=502, detail="Não foi possível ler a comanda")

    pm = str(parsed.get("payment_method", "dinheiro")).lower()
    if pm not in ("dinheiro", "cartao", "pix"):
        pm = "dinheiro"
    address = str(parsed.get("address", "") or "")
    result = {
        "customer_name": str(parsed.get("customer_name", "") or ""),
        "address": address,
        "payment_method": pm,
        "order_value": float(parsed.get("order_value", 0) or 0),
        "delivery_fee": float(parsed.get("delivery_fee", 0) or 0),
        "notes": str(parsed.get("notes", "") or ""),
        "address_incomplete": len(address.strip()) < 8,
    }
    return result


# ----------------------- Deliveries -----------------------
async def build_delivery_doc(body: DeliveryIn, admin_id: str) -> dict:
    lat, lng = await geocode(body.address)
    return {
        "customer_name": body.customer_name,
        "address": body.address,
        "payment_method": body.payment_method,
        "order_value": float(body.order_value or 0),
        "delivery_fee": float(body.delivery_fee or 0),
        "notes": body.notes,
        "max_time": body.max_time,
        "driver_id": body.driver_id,
        "admin_id": admin_id,
        "status": "aguardando",
        "lat": lat,
        "lng": lng,
        "sequence": 0,
        "created_at": now_utc(),
        "delivered_at": None,
    }


@api_router.post("/deliveries")
async def create_delivery(body: DeliveryIn, admin: dict = Depends(require_admin)):
    doc = await build_delivery_doc(body, str(admin["_id"]))
    res = await db.deliveries.insert_one(doc)
    doc["_id"] = res.inserted_id
    if body.driver_id:
        await push_notification(body.driver_id, "Nova entrega atribuída",
                                f"{body.customer_name} — {body.address}", "assign")
    return serialize(doc)


@api_router.get("/deliveries")
async def list_deliveries(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "admin":
        q["admin_id"] = str(user["_id"])
    else:
        q["driver_id"] = str(user["_id"])
    if status_filter and status_filter != "todas":
        q["status"] = status_filter
    cursor = db.deliveries.find(q).sort([("sequence", 1), ("created_at", -1)])
    docs = await cursor.to_list(1000)
    out = []
    driver_cache = {}
    for d in docs:
        s = serialize(d)
        did = d.get("driver_id")
        if did:
            if did not in driver_cache:
                dv = await db.users.find_one({"_id": ObjectId(did)})
                driver_cache[did] = dv.get("name") if dv else None
            s["driver_name"] = driver_cache[did]
        out.append(s)
    return out


@api_router.get("/deliveries/{delivery_id}")
async def get_delivery(delivery_id: str, user: dict = Depends(get_current_user)):
    d = await db.deliveries.find_one({"_id": ObjectId(delivery_id)})
    if not d:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    uid = str(user["_id"])
    owns = (user["role"] == "admin" and d.get("admin_id") == uid) or (
        user["role"] == "driver" and d.get("driver_id") == uid
    )
    if not owns:
        raise HTTPException(status_code=403, detail="Sem permissão")
    return serialize(d)


@api_router.put("/deliveries/{delivery_id}")
async def update_delivery(delivery_id: str, body: DeliveryUpdate, admin: dict = Depends(require_admin)):
    prev = await db.deliveries.find_one({"_id": ObjectId(delivery_id), "admin_id": str(admin["_id"])})
    if not prev:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    upd = {k: v for k, v in body.dict().items() if v is not None}
    if "address" in upd:
        lat, lng = await geocode(upd["address"])
        upd["lat"], upd["lng"] = lat, lng
    await db.deliveries.update_one({"_id": ObjectId(delivery_id)}, {"$set": upd})
    if "driver_id" in upd and upd["driver_id"] and prev.get("driver_id") != upd["driver_id"]:
        d = await db.deliveries.find_one({"_id": ObjectId(delivery_id)})
        await push_notification(upd["driver_id"], "Nova entrega atribuída",
                                f"{d['customer_name']} — {d['address']}", "assign")
    doc = await db.deliveries.find_one({"_id": ObjectId(delivery_id)})
    return serialize(doc)


@api_router.put("/deliveries/{delivery_id}/status")
async def update_status(delivery_id: str, body: StatusUpdate, user: dict = Depends(get_current_user)):
    d = await db.deliveries.find_one({"_id": ObjectId(delivery_id)})
    if not d:
        raise HTTPException(status_code=404, detail="Entrega não encontrada")
    uid = str(user["_id"])
    owns = (user["role"] == "admin" and d.get("admin_id") == uid) or (
        user["role"] == "driver" and d.get("driver_id") == uid
    )
    if not owns:
        raise HTTPException(status_code=403, detail="Sem permissão")
    upd = {"status": body.status}
    if body.status == "entregue":
        upd["delivered_at"] = now_utc()
    if body.problem_note is not None:
        upd["problem_note"] = body.problem_note
    await db.deliveries.update_one({"_id": ObjectId(delivery_id)}, {"$set": upd})
    # notify admin
    admin_id = d.get("admin_id")
    if admin_id:
        labels = {"aguardando": "aguardando", "em_rota": "em rota", "entregue": "entregue", "problema": "com problema"}
        kind = "problem" if body.status == "problema" else "status"
        await push_notification(admin_id, f"Entrega {labels[body.status]}",
                                f"{d['customer_name']} — {d['address']}", kind)
    doc = await db.deliveries.find_one({"_id": ObjectId(delivery_id)})
    return serialize(doc)


@api_router.delete("/deliveries/{delivery_id}")
async def delete_delivery(delivery_id: str, admin: dict = Depends(require_admin)):
    await db.deliveries.delete_one({"_id": ObjectId(delivery_id), "admin_id": str(admin["_id"])})
    return {"ok": True}


# ----------------------- Route optimization -----------------------
@api_router.post("/routes/optimize")
async def optimize_route(body: OptimizeIn, admin: dict = Depends(require_admin)):
    aid = str(admin["_id"])
    drv = await db.users.find_one({"_id": ObjectId(body.driver_id), "role": "driver", "admin_id": aid})
    if not drv:
        raise HTTPException(status_code=404, detail="Motoboy não encontrado")
    docs = []
    for did in body.delivery_ids:
        d = await db.deliveries.find_one({"_id": ObjectId(did), "admin_id": aid})
        if d:
            docs.append(d)
    if not docs:
        raise HTTPException(status_code=400, detail="Nenhuma entrega selecionada")

    # nearest-neighbor ordering by geocoded coords
    start_lat = body.start_lat
    start_lng = body.start_lng
    remaining = docs[:]
    ordered = []
    cur_lat, cur_lng = start_lat, start_lng
    # if no start point, begin with the first that has coords
    if cur_lat is None:
        seed = next((d for d in remaining if d.get("lat")), remaining[0])
        ordered.append(seed)
        remaining.remove(seed)
        cur_lat, cur_lng = seed.get("lat"), seed.get("lng")

    while remaining:
        # pick nearest with coords, else next in list
        best = None
        best_dist = float("inf")
        for d in remaining:
            if d.get("lat") is not None and cur_lat is not None:
                dist = haversine(cur_lat, cur_lng, d["lat"], d["lng"])
            else:
                dist = float("inf")
            if dist < best_dist:
                best_dist = dist
                best = d
        if best is None:
            best = remaining[0]
        ordered.append(best)
        remaining.remove(best)
        if best.get("lat") is not None:
            cur_lat, cur_lng = best["lat"], best["lng"]

    # compute total distance & assign sequence
    total_km = 0.0
    prev_lat, prev_lng = start_lat, start_lng
    result_items = []
    for i, d in enumerate(ordered):
        if prev_lat is not None and d.get("lat") is not None:
            total_km += haversine(prev_lat, prev_lng, d["lat"], d["lng"])
        await db.deliveries.update_one(
            {"_id": d["_id"]},
            {"$set": {"sequence": i + 1, "driver_id": body.driver_id}},
        )
        if d.get("lat") is not None:
            prev_lat, prev_lng = d["lat"], d["lng"]
        result_items.append({"id": str(d["_id"]), "sequence": i + 1,
                             "customer_name": d["customer_name"], "address": d["address"]})

    avg_speed = 25.0  # km/h urban
    est_minutes = round((total_km / avg_speed) * 60 + len(ordered) * 4)  # +4min per stop

    await push_notification(body.driver_id, "Rota atribuída",
                            f"{len(ordered)} entregas • {total_km:.1f} km", "route")

    return {
        "driver_id": body.driver_id,
        "count": len(ordered),
        "total_km": round(total_km, 2),
        "est_minutes": est_minutes,
        "items": result_items,
    }


# ----------------------- Dashboard & Billing -----------------------
@api_router.get("/dashboard")
async def dashboard(admin: dict = Depends(require_admin)):
    aid = str(admin["_id"])
    today = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    aguardando = await db.deliveries.count_documents({"admin_id": aid, "status": "aguardando"})
    em_rota = await db.deliveries.count_documents({"admin_id": aid, "status": "em_rota"})
    problema = await db.deliveries.count_documents({"admin_id": aid, "status": "problema"})
    concluidas_hoje = await db.deliveries.count_documents({
        "admin_id": aid, "status": "entregue", "delivered_at": {"$gte": today}
    })
    drivers_total = await db.users.count_documents({"role": "driver", "admin_id": aid})
    return {
        "aguardando": aguardando,
        "em_rota": em_rota,
        "concluidas_hoje": concluidas_hoje,
        "problema": problema,
        "drivers_total": drivers_total,
    }


@api_router.get("/billing")
async def billing(admin: dict = Depends(require_admin)):
    aid = str(admin["_id"])
    cursor = db.deliveries.find({"admin_id": aid})
    docs = await cursor.to_list(5000)
    taxa_realizada = sum(d.get("delivery_fee", 0) for d in docs if d.get("status") == "entregue")
    taxa_aberto = sum(d.get("delivery_fee", 0) for d in docs if d.get("status") in ("aguardando", "em_rota"))
    total_previsto = sum(d.get("delivery_fee", 0) for d in docs)
    valor_pedidos = sum(d.get("order_value", 0) for d in docs)
    entregues = [d for d in docs if d.get("status") == "entregue"]
    active_drivers = await db.users.count_documents({"role": "driver", "admin_id": aid, "active": True})
    return {
        "taxa_realizada": round(taxa_realizada, 2),
        "taxa_aberto": round(taxa_aberto, 2),
        "total_previsto": round(total_previsto, 2),
        "valor_pedidos": round(valor_pedidos, 2),
        "total_entregas": len(docs),
        "entregues": len(entregues),
        "motoboys_ativos": active_drivers,
    }


# ----------------------- Location -----------------------
@api_router.post("/location")
async def update_location(body: LocationIn, user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]},
                              {"$set": {"lat": body.lat, "lng": body.lng, "last_seen": now_utc()}})
    return {"ok": True}


# ----------------------- Notifications -----------------------
@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_current_user)):
    cursor = db.notifications.find({"user_id": str(user["_id"])}).sort("created_at", -1).limit(50)
    return [serialize(n) for n in await cursor.to_list(50)]


@api_router.get("/notifications/unread_count")
async def unread_count(user: dict = Depends(get_current_user)):
    c = await db.notifications.count_documents({"user_id": str(user["_id"]), "read": False})
    return {"count": c}


@api_router.put("/notifications/read_all")
async def read_all(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": str(user["_id"])}, {"$set": {"read": True}})
    return {"ok": True}


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
