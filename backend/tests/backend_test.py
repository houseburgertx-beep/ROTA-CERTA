"""Backend API tests for Rota Certa"""
import os
import time
import base64
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://route-ops-4.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Use timestamped emails to avoid collisions on re-run
TS = int(time.time())
ADMIN_EMAIL = f"test_gestor_{TS}@teste.com"
ADMIN_PASSWORD = "teste123"
DRIVER_EMAIL = f"test_motoboy_{TS}@teste.com"
DRIVER_PASSWORD = "teste123"

state = {}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# ---------- Auth ----------
class TestAuth:
    def test_register_admin(self, s):
        r = s.post(f"{API}/auth/register", json={
            "name": "Gestor Teste",
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
            "business_name": "Pizzaria TEST",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "admin"
        state["admin_token"] = data["token"]
        state["admin_id"] = data["user"]["id"]

    def test_register_duplicate(self, s):
        r = s.post(f"{API}/auth/register", json={
            "name": "Dup", "email": ADMIN_EMAIL, "password": "teste123"})
        assert r.status_code == 409

    def test_login_success(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json().get("token")

    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, s):
        r = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {state['admin_token']}"})
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert "password_hash" not in r.json()


# ---------- Drivers ----------
class TestDrivers:
    def test_create_driver(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.post(f"{API}/drivers", json={
            "name": "Motoboy Teste",
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD,
            "phone": "+5511999999999",
            "vehicle": "Moto Honda CG",
        }, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["role"] == "driver"
        assert data["email"] == DRIVER_EMAIL
        state["driver_id"] = data["id"]

    def test_list_drivers_contains_new(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.get(f"{API}/drivers", headers=h)
        assert r.status_code == 200
        emails = [d["email"] for d in r.json()]
        assert DRIVER_EMAIL in emails

    def test_driver_login(self, s):
        r = s.post(f"{API}/auth/login", json={"email": DRIVER_EMAIL, "password": DRIVER_PASSWORD})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "driver"
        state["driver_token"] = r.json()["token"]

    def test_update_driver(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.put(f"{API}/drivers/{state['driver_id']}", json={"vehicle": "Moto Yamaha"}, headers=h)
        assert r.status_code == 200
        assert r.json()["vehicle"] == "Moto Yamaha"

    def test_drivers_forbidden_for_driver(self, s):
        r = s.get(f"{API}/drivers", headers={"Authorization": f"Bearer {state['driver_token']}"})
        assert r.status_code == 403


# ---------- Deliveries ----------
class TestDeliveries:
    def test_create_delivery(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.post(f"{API}/deliveries", json={
            "customer_name": "TEST Cliente 1",
            "address": "Avenida Paulista, 1000, São Paulo, SP",
            "payment_method": "pix",
            "order_value": 55.0,
            "delivery_fee": 8.0,
            "notes": "Interfone 12",
        }, headers=h)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "aguardando"
        assert d["customer_name"] == "TEST Cliente 1"
        # geocoding may take a moment; lat/lng may or may not be present
        state["delivery_id"] = d["id"]
        state["delivery_lat"] = d.get("lat")
        state["delivery_lng"] = d.get("lng")

    def test_create_delivery_assigned(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.post(f"{API}/deliveries", json={
            "customer_name": "TEST Cliente 2",
            "address": "Rua Augusta, 500, São Paulo, SP",
            "payment_method": "dinheiro",
            "order_value": 30.0,
            "delivery_fee": 7.0,
            "driver_id": state["driver_id"],
        }, headers=h)
        assert r.status_code == 200
        state["delivery_id2"] = r.json()["id"]

    def test_list_deliveries_admin(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.get(f"{API}/deliveries", headers=h)
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()]
        assert state["delivery_id"] in ids
        assert state["delivery_id2"] in ids

    def test_list_deliveries_driver_only_assigned(self, s):
        h = {"Authorization": f"Bearer {state['driver_token']}"}
        r = s.get(f"{API}/deliveries", headers=h)
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()]
        assert state["delivery_id2"] in ids
        assert state["delivery_id"] not in ids  # not assigned to this driver

    def test_status_transition(self, s):
        h = {"Authorization": f"Bearer {state['driver_token']}"}
        # em_rota
        r = s.put(f"{API}/deliveries/{state['delivery_id2']}/status",
                  json={"status": "em_rota"}, headers=h)
        assert r.status_code == 200
        assert r.json()["status"] == "em_rota"
        # entregue
        r = s.put(f"{API}/deliveries/{state['delivery_id2']}/status",
                  json={"status": "entregue"}, headers=h)
        assert r.status_code == 200
        assert r.json()["status"] == "entregue"
        assert r.json().get("delivered_at") is not None

    def test_status_filter(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.get(f"{API}/deliveries?status_filter=entregue", headers=h)
        assert r.status_code == 200
        for d in r.json():
            assert d["status"] == "entregue"


# ---------- Route optimize ----------
class TestRouteOptimize:
    def test_optimize(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        # create 2 more with coords
        r1 = s.post(f"{API}/deliveries", json={
            "customer_name": "TEST R1", "address": "Rua Consolação, 200, São Paulo, SP",
            "payment_method": "pix", "order_value": 40, "delivery_fee": 6}, headers=h)
        r2 = s.post(f"{API}/deliveries", json={
            "customer_name": "TEST R2", "address": "Rua Oscar Freire, 300, São Paulo, SP",
            "payment_method": "cartao", "order_value": 60, "delivery_fee": 9}, headers=h)
        assert r1.status_code == 200 and r2.status_code == 200
        ids = [state["delivery_id"], r1.json()["id"], r2.json()["id"]]
        r = s.post(f"{API}/routes/optimize", json={
            "driver_id": state["driver_id"],
            "delivery_ids": ids,
        }, headers=h)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 3
        assert "total_km" in data and "est_minutes" in data
        assert len(data["items"]) == 3
        # ensure sequences 1..3
        seqs = sorted([it["sequence"] for it in data["items"]])
        assert seqs == [1, 2, 3]


# ---------- Dashboard/Billing ----------
class TestDashboardBilling:
    def test_dashboard(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.get(f"{API}/dashboard", headers=h)
        assert r.status_code == 200
        d = r.json()
        for k in ["aguardando", "em_rota", "concluidas_hoje", "problema", "drivers_total"]:
            assert k in d
        assert d["drivers_total"] >= 1
        assert d["concluidas_hoje"] >= 1

    def test_billing(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.get(f"{API}/billing", headers=h)
        assert r.status_code == 200
        b = r.json()
        for k in ["taxa_realizada", "taxa_aberto", "total_previsto", "valor_pedidos", "motoboys_ativos"]:
            assert k in b
        assert b["taxa_realizada"] >= 7.0  # entregue delivery had fee 7


# ---------- Location ----------
class TestLocation:
    def test_update_and_list_location(self, s):
        # driver posts location
        r = s.post(f"{API}/location", json={"lat": -23.55, "lng": -46.63},
                   headers={"Authorization": f"Bearer {state['driver_token']}"})
        assert r.status_code == 200
        # admin fetches locations
        r = s.get(f"{API}/drivers/locations",
                  headers={"Authorization": f"Bearer {state['admin_token']}"})
        assert r.status_code == 200
        locs = r.json()
        found = [l for l in locs if l["id"] == state["driver_id"]]
        assert found and abs(found[0]["lat"] + 23.55) < 0.01


# ---------- Notifications ----------
class TestNotifications:
    def test_get_and_unread(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.get(f"{API}/notifications", headers=h)
        assert r.status_code == 200
        # admin should have notifications from status updates
        assert len(r.json()) >= 1
        r = s.get(f"{API}/notifications/unread_count", headers=h)
        assert r.status_code == 200
        assert r.json()["count"] >= 1

    def test_read_all(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.put(f"{API}/notifications/read_all", headers=h)
        assert r.status_code == 200
        r = s.get(f"{API}/notifications/unread_count", headers=h)
        assert r.json()["count"] == 0


# ---------- Scan (Groq vision) ----------
def _make_receipt_jpeg_b64() -> str:
    """Try to build a small JPEG with text using PIL; fall back to a sample photo."""
    try:
        from PIL import Image, ImageDraw, ImageFont
        import io
        img = Image.new("RGB", (480, 640), "white")
        d = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
            small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
        except Exception:
            font = ImageFont.load_default()
            small = font
        lines = [
            "PIZZARIA BELLA",
            "COMANDA #123",
            "Cliente: Joao Silva",
            "Endereco: Rua das Flores 150",
            "Bairro Centro - Sao Paulo/SP",
            "Pagamento: PIX",
            "Pedido: 2 Pizzas Grandes",
            "Valor do pedido: R$ 89,90",
            "Taxa de entrega: R$ 10,00",
            "Obs: Sem cebola",
        ]
        y = 20
        for i, line in enumerate(lines):
            d.text((20, y), line, fill="black", font=font if i == 0 else small)
            y += 40
        # add some shapes for visual variance
        d.rectangle([10, 10, 470, 630], outline="black", width=3)
        d.line([20, 60, 460, 60], fill="black", width=2)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ""


class TestScan:
    def test_scan_receipt(self, s):
        b64 = _make_receipt_jpeg_b64()
        if not b64:
            pytest.skip("PIL not available")
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.post(f"{API}/deliveries/scan",
                   json={"image_base64": b64, "mime_type": "image/jpeg"},
                   headers=h, timeout=90)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        d = r.json()
        for k in ["customer_name", "address", "payment_method", "order_value", "delivery_fee"]:
            assert k in d
        assert d["payment_method"] in ("dinheiro", "cartao", "pix")


# ---------- Cleanup ----------
class TestCleanup:
    def test_delete_delivery(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.delete(f"{API}/deliveries/{state['delivery_id']}", headers=h)
        assert r.status_code == 200

    def test_delete_driver(self, s):
        h = {"Authorization": f"Bearer {state['admin_token']}"}
        r = s.delete(f"{API}/drivers/{state['driver_id']}", headers=h)
        assert r.status_code == 200
