"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Bike,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Compass,
  Copy,
  ExternalLink,
  LogOut,
  MapPin,
  MapPinned,
  MessageSquare,
  Moon,
  Navigation,
  Package,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Route,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import "./premium.css";

import {
  currentPosition,
  geocode,
  geocodeDeliveryAddress,
} from "../src/services/geocodingService";
import {
  calculateRoute,
  formatDistance,
  optimizeDeliverySequence,
} from "../src/services/routingService";
import { MAP_TILE_PROVIDERS, type MapTileProvider } from "../src/services/mapProviders";
import type { Delivery, DeliveryPriority, DeliveryStatus, Driver, GeoPoint, OrderItem, RouteResult, User } from "../src/types";
import { useAuth } from "../src/hooks/useAuth";
import { getStoredUser, signOut } from "../src/services/authService";
import { firebaseConfigured } from "../src/services/firebase";
import {
  createDelivery,
  deleteDelivery,
  subscribeToDeliveries,
  updateDeliveryDriver,
  updateDeliveryStatus,
} from "../src/services/deliveryService";
import {
  createDriver,
  deleteDriver,
  loadStoredDrivers,
  subscribeToDrivers,
} from "../src/services/driverService";
import {
  batchSaveDeliveriesRTDB,
  deleteDeliveryRTDB,
  deleteDriverRTDB,
  getTakeatConfigRTDB,
  saveDeliveryRTDB,
  saveDriverRTDB,
  saveTakeatConfigRTDB,
  subscribeToDeliveriesRTDB,
  subscribeToDriversRTDB,
  subscribeToTakeatConfigRTDB,
  updateDeliveryRTDB,
} from "../src/services/realtimeDbService";
import {
  calculateFinancialStats,
  getDriversEarningsSummary,
  isSameShiftOrToday,
} from "../src/services/financialService";
import { sanitizeWhatsAppNumber } from "../src/services/phoneService";
import {
  getTakeatCredentials,
  setTakeatCredentials,
  saveTakeatCredentials,
  clearTakeatCredentials,
  isTakeatConfigured,
  loginTakeatWithPassword,
  getTakeatApiKey,
  saveTakeatApiKey,
  clearTakeatApiKey,
  isTakeatSyncEnabled,
  setTakeatSyncEnabled,
  syncTakeatDeliveries,
  syncTakeatMotoboysToRTDB,
  getSampleTakeatDelivery,
  authenticateTakeat,
  type TakeatCredentials,
} from "../src/services/takeatService";
import type { DeliveryRecord, DeliveryRecordStatus } from "../src/types/delivery";
import { LoginView } from "../src/components/LoginView";
import { playIfoodNotificationSound, unlockAudioOnFirstGesture } from "../src/services/soundService";

type Status = DeliveryStatus;

const STORE_KEY = "rotacerta_store";
const DELIV_KEY = "rotacerta_deliveries";
type StoreCfg = { name: string; phone: string; address: string; latitude: number; longitude: number };
const DEFAULT_STORE: StoreCfg = {
  name: "House Burger 190 Hamburgueria",
  phone: "(73) 99800-1122",
  address: "Centro, Teixeira de Freitas - BA",
  latitude: -17.5399,
  longitude: -39.7414,
};

function loadStore(): StoreCfg {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORE_KEY) : null;
    const s = raw ? JSON.parse(raw) : null;
    if (s && typeof s.latitude === "number") return s;
  } catch {}
  return DEFAULT_STORE;
}

let STORE_POINT: StoreCfg = loadStore();
function saveStore(cfg: StoreCfg) {
  STORE_POINT = cfg;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
  } catch {}
}

const recordStatus: Record<DeliveryRecordStatus, Status> = {
  pending: "Aguardando",
  assigned: "Pronta para sair",
  on_route: "Em rota",
  arrived: "Em rota",
  delivered: "Entregue",
  problem: "Problema",
  cancelled: "Problema",
};

function fromRecord(item: DeliveryRecord, driversList: Driver[]): Delivery {
  const matchedDriver = item.driverId ? driversList.find((d) => d.id === item.driverId) : null;
  return {
    id: item.id,
    order: item.orderNumber,
    customer: item.customerName,
    phone: item.phone,
    address: [item.address, item.number].filter((v) => v && v !== "s/n").join(", "),
    district: item.district,
    city: item.city,
    postalCode: item.postalCode,
    complement: item.complement,
    reference: item.reference,
    amount: item.amount,
    deliveryFee: item.deliveryFee || 7.0,
    payment: item.paymentMethod,
    platform: item.platform,
    platformOrderId: item.platformOrderId,
    pickupCode: item.pickupCode,
    priority: item.priority === "urgent" ? "Urgente" : item.priority === "high" ? "Alta" : "Normal",
    status: recordStatus[item.status] || "Aguardando",
    driver: matchedDriver ? matchedDriver.name : "Carlos Eduardo (Kaká)",
    driverId: item.driverId || "driver-1",
    time: "20:01",
    notes: item.notes,
    items: item.items,
    itemsSummary: item.itemsSummary,
    source: item.source,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    deliveredAt: typeof item.deliveredAt === "string" ? item.deliveredAt : undefined,
    latitude: item.latitude,
    longitude: item.longitude,
  };
}

const initialDeliveries: Delivery[] = [];

export default function Home() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => getStoredUser());
  const session = useAuth();

  useEffect(() => {
    if (session.profile) {
      setCurrentUser(session.profile);
    }
  }, [session.profile]);

  if (session.loading) {
    return (
      <main className="auth-shell">
        <div className="auth-loading">
          <span />
          <b>Iniciando Rota Certa…</b>
          <small>Carregando acesso</small>
        </div>
      </main>
    );
  }

  // If not logged in, render LoginView with 1-tap login for motoboy and admin
  if (!currentUser) {
    return <LoginView onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  return (
    <MobileDeliveryApp
      currentUser={currentUser}
      onLogout={() => {
        void signOut();
        setCurrentUser(null);
      }}
      demoMode={!firebaseConfigured}
    />
  );
}

function MobileDeliveryApp({
  currentUser,
  onLogout,
  demoMode,
}: {
  currentUser: User;
  onLogout: () => void;
  demoMode: boolean;
}) {
  const isStore = currentUser.role === "admin";
  const [appMode, setAppMode] = useState<"motoboy" | "adm">(isStore ? "adm" : "motoboy");
  const [activeTab, setActiveTab] = useState<"entregas" | "mapa" | "comanda" | "financeiro" | "adm" | "config">("entregas");
  const [drivers, setDrivers] = useState<Driver[]>(() => loadStoredDrivers());
  const [selectedDriverId, setSelectedDriverId] = useState<string>(() => {
    const list = loadStoredDrivers();
    if (currentUser.role === "driver") {
      const match = list.find((d) => d.email?.toLowerCase() === currentUser.email.toLowerCase() || d.name.toLowerCase() === currentUser.name.toLowerCase());
      if (match) return match.id;
      return `drv-${currentUser.id}`;
    }
    return list[0]?.id || "";
  });

  const [deliveries, setDeliveries] = useState<Delivery[]>(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(DELIV_KEY) : null;
      const s = raw ? JSON.parse(raw) : null;
      return Array.isArray(s) ? s : initialDeliveries;
    } catch {
      return initialDeliveries;
    }
  });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("Todas");
  const [deliveryTabMode, setDeliveryTabMode] = useState<"active" | "completed">("active");
  const [selectedForRouteIds, setSelectedForRouteIds] = useState<string[]>([]);
  const [modal, setModal] = useState<"new" | "ocr" | "driver" | "profile" | null>(null);
  const [ocrData, setOcrData] = useState<Record<string, string> | null>(null);
  const [ifoodConfirmDelivery, setIfoodConfirmDelivery] = useState<Delivery | null>(null);
  const [toast, setToast] = useState("");
  const [mapProvider, setMapProvider] = useState<MapTileProvider>(() => {
    try {
      if (typeof localStorage !== "undefined") {
        const saved = localStorage.getItem("rotacerta_map_provider") as MapTileProvider;
        if (saved && saved !== "carto" && saved in MAP_TILE_PROVIDERS) return saved;
      }
    } catch {}
    return "osm";
  });

  useEffect(() => {
    try {
      localStorage.setItem("rotacerta_map_provider", mapProvider);
    } catch {}
  }, [mapProvider]);

  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("rotacerta_theme") === "dark" ? "dark" : "light",
  );

  type TextScale = "normal" | "large";
  const [textScale, setTextScale] = useState<TextScale>(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("rotacerta_text_scale");
      if (saved === "large") return "large";
    }
    return "normal";
  });

  const [takeatCreds, setTakeatCreds] = useState<TakeatCredentials>(() => getTakeatCredentials());
  const [isTakeatConnected, setIsTakeatConnected] = useState(() => isTakeatConfigured());
  const [takeatSyncing, setTakeatSyncing] = useState(false);
  const [takeatAutoSync, setTakeatAutoSync] = useState(() => isTakeatSyncEnabled());

  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 2800);
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([120, 60, 120]);
      }
    } catch {}
  };

  // Trava motoboy no modo motoboy e bloqueia abas administrativas
  useEffect(() => {
    if (currentUser.role === "driver") {
      setAppMode("motoboy");
      if (activeTab === "adm" || activeTab === "config") {
        setActiveTab("entregas");
      }
    }
  }, [currentUser.role, activeTab]);

  // Se o usuário for motoboy, garante que existe o registro correspondente no banco RTDB
  useEffect(() => {
    if (currentUser.role === "driver") {
      const match = drivers.find(
        (d) =>
          d.email?.toLowerCase() === currentUser.email.toLowerCase() ||
          d.id === currentUser.id ||
          d.id === `drv-${currentUser.id}` ||
          d.name.toLowerCase() === currentUser.name.toLowerCase(),
      );
      if (match) {
        setSelectedDriverId(match.id);
      } else {
        const newDrv: Driver = {
          id: `drv-${currentUser.id}`,
          name: currentUser.name,
          email: currentUser.email,
          phone: currentUser.phone || "",
          vehicle: "Moto",
          defaultFee: 7.0,
          active: true,
          companyId: "house-burger-190",
          createdAt: new Date().toISOString(),
        };
        void saveDriverRTDB(newDrv);
        setSelectedDriverId(newDrv.id);
      }
    }
  }, [currentUser, drivers]);

  // Sincronização em tempo real do Firebase Realtime Database
  useEffect(() => {
    const unsubDeliveries = subscribeToDeliveriesRTDB((items) => {
      // Notifica com som e vibração se um novo pedido atribuído ao motoboy logado chegou
      if (currentUser.role === "driver") {
        const prevItems = deliveriesRef.current || [];
        const prevIds = new Set(prevItems.map((d) => d.id));
        const newForMe = items.filter((d) => !prevIds.has(d.id) && isDeliveryForThisDriver(d));
        if (newForMe.length > 0) {
          playNewOrderAlert();
          notify(`🔥 ${newForMe.length} novo(s) pedido(s) atribuído(s) a você!`);
        }
      }
      setDeliveries(items);
    });
    const unsubDrivers = subscribeToDriversRTDB((list) => {
      setDrivers(list);
    });
    const unsubTakeat = subscribeToTakeatConfigRTDB((cfg) => {
      if (cfg && (cfg.apiKey || (cfg.email && cfg.password))) {
        setTakeatCredentials(cfg);
        setTakeatCreds(cfg);
        setIsTakeatConnected(true);
      }
    });
    return () => {
      unsubDeliveries();
      unsubDrivers();
      unsubTakeat();
    };
  }, []);

  // Se o dispositivo tiver credenciais locais (da loja), replica para o RTDB na nuvem
  useEffect(() => {
    const creds = getTakeatCredentials();
    if (creds && (creds.apiKey || (creds.email && creds.password))) {
      void getTakeatConfigRTDB().then((rtdbCfg) => {
        if (!rtdbCfg || (!rtdbCfg.apiKey && !rtdbCfg.email)) {
          void saveTakeatConfigRTDB(creds);
        }
      });
    }
  }, []);

  const deliveriesRef = useRef(deliveries);
  deliveriesRef.current = deliveries;
  const driversRef = useRef(drivers);
  driversRef.current = drivers;

  // Desbloqueia pipeline de áudio móvel no primeiro gesto do usuário
  useEffect(() => {
    unlockAudioOnFirstGesture();
  }, []);

  // Alerta Sonoro Autêntico estilo iFood com HTML5 Audio, WAV e vibração tátil
  const playIfoodSoundAlert = () => {
    void playIfoodNotificationSound();
  };

  const playNewOrderAlert = playIfoodSoundAlert;

  // Polling automático da Takeat a cada 15 segundos quando configurado
  useEffect(() => {
    if (!takeatAutoSync || !isTakeatConfigured()) return;

    const runSync = async () => {
      try {
        const res = await syncTakeatDeliveries(deliveriesRef.current, driversRef.current);
        if (res.addedCount > 0) {
          setDeliveries(res.deliveries);
          void batchSaveDeliveriesRTDB(res.deliveries);
          playNewOrderAlert();
          notify(`🔥 ${res.addedCount} novo(s) pedido(s) Takeat recebido(s)!`);
        } else if (res.updatedCount > 0) {
          setDeliveries(res.deliveries);
          void batchSaveDeliveriesRTDB(res.deliveries);
        }
      } catch (err: unknown) {
        console.warn("Erro no auto-sync Takeat:", err);
      }
    };

    // Dispara busca inicial imediatamente
    void runSync();

    const interval = setInterval(runSync, 8000);
    return () => clearInterval(interval);
  }, [takeatAutoSync, isTakeatConnected]);

  // Atualização automática ao reabrir o app ou focar na tela
  useEffect(() => {
    if (!isTakeatConfigured()) return;

    const handleFocusOrVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        syncTakeatDeliveries(deliveriesRef.current, driversRef.current)
          .then((res) => {
            if (res.addedCount > 0 || res.updatedCount > 0) {
              setDeliveries(res.deliveries);
              void batchSaveDeliveriesRTDB(res.deliveries);
              if (res.addedCount > 0) playNewOrderAlert();
            }
          })
          .catch(() => {});
      }
    };

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);
    return () => {
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
    };
  }, [isTakeatConnected]);

  const handleManualSyncTakeat = async () => {
    if (!isTakeatConfigured()) {
      if (currentUser.role === "admin") {
        notify("⚠️ Conecte sua conta Takeat (Login e Senha) na aba ADM.");
        setActiveTab("adm");
      } else {
        notify("⚠️ Takeat ainda não configurada no painel da loja.");
      }
      return;
    }
    setTakeatSyncing(true);
    try {
      const res = await syncTakeatDeliveries(deliveriesRef.current, driversRef.current);
      setDeliveries(res.deliveries);
      void batchSaveDeliveriesRTDB(res.deliveries);
      setIsTakeatConnected(true);
      if (res.addedCount > 0) {
        playNewOrderAlert();
        notify(`✅ ${res.addedCount} novo(s) pedido(s) Takeat importado(s)!`);
      } else if (res.updatedCount > 0) {
        notify(`✅ ${res.updatedCount} pedido(s) Takeat atualizado(s)!`);
      } else {
        notify("Tudo em dia! Nenhum novo pedido Takeat no momento.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao sincronizar Takeat";
      notify(`❌ ${msg}`);
      setIsTakeatConnected(false);
    } finally {
      setTakeatSyncing(false);
    }
  };

  const handleAddSampleTakeat = async () => {
    const sample = getSampleTakeatDelivery();
    setDeliveries((prev) => [sample, ...prev]);
    await saveDeliveryRTDB(sample);
    notify(`🍔 Pedido Takeat/iFood #${sample.order} adicionado para teste!`);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("rotacerta_theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.textScale = textScale;
    document.documentElement.classList.remove("text-scale-normal", "text-scale-large", "text-scale-extra");
    document.documentElement.classList.add(`text-scale-${textScale}`);
    document.body.classList.remove("text-scale-normal", "text-scale-large", "text-scale-extra");
    document.body.classList.add(`text-scale-${textScale}`);
    try {
      localStorage.setItem("rotacerta_text_scale", textScale);
    } catch {}
  }, [textScale]);

  useEffect(() => {
    try {
      localStorage.setItem(DELIV_KEY, JSON.stringify(deliveries));
    } catch {}
  }, [deliveries]);

  const activeDriver = useMemo(() => {
    if (currentUser.role === "driver") {
      const match = drivers.find(
        (d) =>
          d.email?.toLowerCase() === currentUser.email.toLowerCase() ||
          d.id === currentUser.id ||
          d.id === `drv-${currentUser.id}` ||
          d.name.toLowerCase() === currentUser.name.toLowerCase(),
      );
      if (match) return match;
      return {
        id: `drv-${currentUser.id}`,
        name: currentUser.name,
        email: currentUser.email,
        phone: currentUser.phone || "",
        vehicle: "Moto",
        defaultFee: 7.0,
        active: true,
        companyId: currentUser.companyId || "house-burger-190",
        createdAt: new Date().toISOString(),
      } as Driver;
    }
    return drivers.find((d) => d.id === selectedDriverId) || drivers[0];
  }, [drivers, selectedDriverId, currentUser]);

  // Função ESTRITA: O pedido pertence a este motoboy?
  const isDeliveryForThisDriver = (d: Delivery): boolean => {
    if (currentUser.role !== "driver") return true;

    // Se o pedido não tem motoboy atribuído ou está aguardando, NUNCA exibe para o motoboy
    const driverName = (d.driver || "").toLowerCase().trim();
    if (
      !driverName ||
      driverName.includes("aguardando") ||
      driverName.includes("sem motoboy") ||
      driverName.includes("não atribuído") ||
      driverName.includes("seleção")
    ) {
      return false;
    }

    const myName = currentUser.name.toLowerCase().trim();
    const activeName = (activeDriver?.name || "").toLowerCase().trim();
    const myEmailPrefix = (currentUser.email || "").split("@")[0].toLowerCase().trim();

    // 1. Match direto por nome (ex: "guilherme" em "Guilherme" ou "Motoboy: guilherme")
    if (
      driverName === myName ||
      (activeName && driverName === activeName) ||
      (myName && driverName.includes(myName)) ||
      (myName && myName.includes(driverName)) ||
      (myEmailPrefix && driverName.includes(myEmailPrefix))
    ) {
      return true;
    }

    // 2. Match por apelido entre parênteses ex: "(Kaká)"
    const nickMatch = myName.match(/\(([^)]+)\)/) || activeName.match(/\(([^)]+)\)/);
    if (nickMatch) {
      const nick = nickMatch[1].trim().toLowerCase();
      if (nick && (driverName === nick || driverName.includes(nick))) {
        return true;
      }
    }

    // 3. Compara com todos os IDs válidos deste motoboy no sistema e no RTDB
    const validDriverIds = new Set<string>([
      currentUser.id.toLowerCase().trim(),
      `drv-${currentUser.id}`.toLowerCase().trim(),
      (activeDriver?.id || "").toLowerCase().trim(),
    ]);

    if (currentUser.takeatId) {
      validDriverIds.add(String(currentUser.takeatId).toLowerCase().trim());
      validDriverIds.add(`takeat-${currentUser.takeatId}`.toLowerCase().trim());
      validDriverIds.add(`drv-takeat-${currentUser.takeatId}`.toLowerCase().trim());
    }

    if (myName.includes("guilherme")) {
      validDriverIds.add("182368");
      validDriverIds.add("takeat-182368");
      validDriverIds.add("drv-takeat-182368");
      validDriverIds.add("drv-toixt7fvh1mxymob9bp6u5bv85m2");
    }

    for (const drv of drivers) {
      const drvClean = (drv.name || "").toLowerCase().trim();
      const drvEmail = (drv.email || "").toLowerCase().trim();
      const drvEmailPrefix = drvEmail.split("@")[0];
      if (
        drvClean === myName ||
        drvClean.includes(myName) ||
        myName.includes(drvClean) ||
        (myEmailPrefix && (drvEmailPrefix === myEmailPrefix || drvClean.includes(myEmailPrefix))) ||
        (drvEmail && drvEmail === currentUser.email.toLowerCase())
      ) {
        validDriverIds.add(drv.id.toLowerCase().trim());
        if (drv.takeatId) {
          validDriverIds.add(String(drv.takeatId).toLowerCase().trim());
          validDriverIds.add(`takeat-${drv.takeatId}`.toLowerCase().trim());
          validDriverIds.add(`drv-takeat-${drv.takeatId}`.toLowerCase().trim());
        }
      }
    }

    if (d.driverId && validDriverIds.has(d.driverId.toLowerCase().trim())) {
      return true;
    }

    // 4. Match por telefone cadastrado
    if (currentUser.phone && d.driverPhone) {
      const myP = currentUser.phone.replace(/\D/g, "");
      const dP = d.driverPhone.replace(/\D/g, "");
      if (myP.length >= 8 && dP.length >= 8 && (myP.includes(dP) || dP.includes(myP))) {
        return true;
      }
    }

    return false;
  };

  // Financial stats for the current view
  const financialStats = useMemo(() => {
    if (currentUser.role === "driver") {
      // Motoboy SÓ computa faturamento de entregas atribuídas a ele!
      const myDeliveries = deliveries.filter(isDeliveryForThisDriver);
      return calculateFinancialStats(myDeliveries, undefined);
    }
    const filterName = appMode === "motoboy" && activeDriver ? activeDriver.name : undefined;
    return calculateFinancialStats(deliveries, filterName);
  }, [deliveries, appMode, activeDriver, currentUser]);

  // Entregas visíveis para o usuário atual (filtro estrito de motoboy ou simulação da loja)
  const scopedDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      if (currentUser.role === "driver") {
        return isDeliveryForThisDriver(d);
      }
      if (appMode === "motoboy" && activeDriver) {
        return d.driverId === activeDriver.id || d.driver === activeDriver.name;
      }
      return true;
    });
  }, [deliveries, currentUser, appMode, activeDriver]);

  const isDeliveryDone = (status: string) => {
    const s = (status || "").toLowerCase().trim();
    return s === "entregue" || s === "delivered" || s === "cancelada" || s === "concluída";
  };

  const activeDeliveries = useMemo(() => {
    return scopedDeliveries.filter(
      (d) => !isDeliveryDone(d.status) && isSameShiftOrToday(d.createdAt || d.time)
    );
  }, [scopedDeliveries]);

  const completedDeliveries = useMemo(() => {
    return scopedDeliveries.filter((d) => isDeliveryDone(d.status));
  }, [scopedDeliveries]);

  // Sequenciamento Inteligente de Entregas & Próxima Parada (Função 7)
  const [driverGps, setDriverGps] = useState<GeoPoint | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setDriverGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    }
  }, []);

  const routeOrigin: GeoPoint = useMemo(() => {
    if (driverGps) return driverGps;
    return { latitude: STORE_POINT.latitude, longitude: STORE_POINT.longitude };
  }, [driverGps]);

  const { optimizedActiveDeliveries, deliveryDistances } = useMemo(() => {
    const res = optimizeDeliverySequence(activeDeliveries, routeOrigin);
    return {
      optimizedActiveDeliveries: res.ordered,
      deliveryDistances: res.distancesMeters,
    };
  }, [activeDeliveries, routeOrigin]);

  const stopNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    optimizedActiveDeliveries.forEach((d, idx) => {
      map.set(d.id, idx + 1);
    });
    return map;
  }, [optimizedActiveDeliveries]);

  const nextDelivery = useMemo(() => {
    return optimizedActiveDeliveries.length > 0 ? optimizedActiveDeliveries[0] : null;
  }, [optimizedActiveDeliveries]);

  // Lista filtrada para exibição (separa Atribuídos Agora vs Já Entregues)
  const filteredDeliveries = useMemo(() => {
    const base = deliveryTabMode === "active" ? optimizedActiveDeliveries : completedDeliveries;
    return base.filter((d) => {
      if (statusFilter !== "Todas" && d.status !== statusFilter) return false;
      if (!query.trim()) return true;
      return (d.customer + d.order + d.address + d.district + d.phone)
        .toLowerCase()
        .includes(query.toLowerCase());
    });
  }, [deliveryTabMode, optimizedActiveDeliveries, completedDeliveries, statusFilter, query]);

  const toggleDeliverySelection = (id: string) => {
    setSelectedForRouteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const clearRouteSelection = () => {
    setSelectedForRouteIds([]);
  };

  const selectAllActiveForRoute = () => {
    setSelectedForRouteIds(activeDeliveries.map((d) => d.id));
  };

  // Delivery action: complete delivery and register earnings
  async function markAsDelivered(id: string) {
    setSelectedForRouteIds((prev) => prev.filter((x) => x !== id));
    const nowIso = new Date().toISOString();
    setDeliveries((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          notify(`Entrega ${d.order} concluída! Taxa de ${money(d.deliveryFee)} somada.`);
          return { ...d, status: "Entregue" as Status, deliveredAt: nowIso };
        }
        return d;
      }),
    );

    try {
      await updateDeliveryRTDB(id, { status: "Entregue", deliveredAt: nowIso });
    } catch (e) {
      console.warn("Erro ao atualizar status da entrega no RTDB:", e);
    }
  }

  // Delivery action: complete ifood delivery with blindagem
  async function confirmIfoodDelivery(deliveryId: string, localizer?: string) {
    setSelectedForRouteIds((prev) => prev.filter((x) => x !== deliveryId));
    const nowIso = new Date().toISOString();
    setDeliveries((prev) =>
      prev.map((d) => {
        if (d.id === deliveryId) {
          notify(`🛡️ Pedido ${d.order} blindado no iFood! Taxa de ${money(d.deliveryFee)} somada.`);
          return {
            ...d,
            status: "Entregue" as Status,
            deliveredAt: nowIso,
            ifoodConfirmed: true,
            ifoodConfirmedAt: nowIso,
            ...(localizer ? { ifoodLocalizer: localizer } : {}),
          };
        }
        return d;
      }),
    );

    try {
      await updateDeliveryRTDB(deliveryId, {
        status: "Entregue",
        deliveredAt: nowIso,
        ifoodConfirmed: true,
        ifoodConfirmedAt: nowIso,
        ...(localizer ? { ifoodLocalizer: localizer } : {}),
      });
    } catch (e) {
      console.warn("Erro ao atualizar status da entrega no RTDB:", e);
    }
  }

  async function updateDeliveryPhone(deliveryId: string, phone: string) {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === deliveryId ? { ...d, phone } : d))
    );
    try {
      await updateDeliveryRTDB(deliveryId, { phone });
      notify("📱 Telefone WhatsApp atualizado com sucesso!");
    } catch (e) {
      console.warn("Erro ao atualizar telefone no RTDB:", e);
    }
  }

  // Delivery action: advance status
  async function updateStatus(id: string, newStatus: Status) {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d)),
    );
    notify(`Status atualizado para ${newStatus}`);
    try {
      await updateDeliveryRTDB(id, { status: newStatus });
    } catch (e) {
      console.warn("Erro ao atualizar status no RTDB:", e);
    }
  }

  // Save new delivery
  async function saveDelivery(data: Partial<Delivery>) {
    const targetDriver = drivers.find((d) => d.id === data.driverId) || activeDriver;
    const fallbackDriverName = currentUser.role === "driver" ? currentUser.name : (targetDriver?.name || "Aguardando");
    const fallbackDriverId = currentUser.role === "driver" ? `drv-${currentUser.id}` : targetDriver?.id;

    const newDelivery: Delivery = {
      id: `del-${Date.now()}`,
      order: data.order || `#${Math.floor(1000 + Math.random() * 9000)}`,
      customer: data.customer || "Cliente",
      phone: data.phone || "",
      address: data.address || "",
      district: data.district || "Kaikan",
      city: data.city || "Teixeira de Freitas",
      postalCode: data.postalCode,
      amount: Number(data.amount) || 0,
      deliveryFee: Number(data.deliveryFee) || (targetDriver?.defaultFee || 7.0),
      payment: data.payment || "Pago Online",
      platform: data.platform || "ifood",
      platformOrderId: data.platformOrderId,
      pickupCode: data.pickupCode,
      notes: data.notes,
      priority: "Alta",
      status: "Em rota",
      driver: targetDriver ? targetDriver.name : fallbackDriverName,
      driverId: targetDriver?.id || fallbackDriverId,
      time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      createdAt: new Date().toISOString(),
      latitude: data.latitude,
      longitude: data.longitude,
    };

    // Geocode if missing coordinates
    if (!newDelivery.latitude || !newDelivery.longitude) {
      try {
        const found = await geocodeDeliveryAddress({
          address: newDelivery.address,
          district: newDelivery.district,
          city: newDelivery.city,
          postalCode: newDelivery.postalCode,
        });
        if (found) {
          newDelivery.latitude = found.latitude;
          newDelivery.longitude = found.longitude;
        }
      } catch {}
    }

    setDeliveries((prev) => [newDelivery, ...prev]);
    setModal(null);
    setOcrData(null);
    notify(`Entrega ${newDelivery.order} cadastrada e localizada no mapa!`);

    try {
      await saveDeliveryRTDB(newDelivery);
    } catch (e) {
      console.warn("Erro ao salvar entrega no RTDB:", e);
    }
  }

  // Remove delivery
  async function removeDelivery(id: string) {
    setSelectedForRouteIds((prev) => prev.filter((x) => x !== id));
    setDeliveries((prev) => prev.filter((d) => d.id !== id));
    notify("Entrega removida");
    try {
      await deleteDeliveryRTDB(id);
    } catch (e) {
      console.warn("Erro ao remover entrega no RTDB:", e);
    }
  }

  // Add new driver
  async function handleAddDriver(driverData: Omit<Driver, "id">) {
    const newDrv = await createDriver(currentUser.companyId, driverData);
    notify(`Motoboy ${newDrv.name} cadastrado com sucesso!`);
    setModal(null);
  }

  // Delete driver
  async function handleDeleteDriver(id: string) {
    await deleteDriver(currentUser.companyId, id);
    notify("Motoboy removido.");
  }

  return (
    <div className={`app-shell text-scale-${textScale}`}>
      {/* Native Mobile App Header */}
      <header className="app-header-native">
        {/* Left: User Avatar & Live Status - Tapping opens Profile Sheet */}
        <button
          type="button"
          className="app-header-user-btn"
          onClick={() => setModal("profile")}
          title="Abrir perfil e configurações do app"
        >
          <div className="app-header-avatar">
            {currentUser.name.slice(0, 2).toUpperCase()}
            <span className="avatar-online-dot" />
          </div>
          <div>
            <div className="app-header-user-name">
              {currentUser.name.split(" ")[0]}
            </div>
            <div className="app-header-user-role">
              {currentUser.role === "driver" ? "● Em serviço" : "● Loja (ADM)"}
            </div>
          </div>
        </button>

        {/* Right: Quick Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {/* Botão de Testar Som iFood */}
          <button
            type="button"
            onClick={() => {
              playIfoodSoundAlert();
              notify("🔔 Som de novo pedido iFood tocado!");
            }}
            className="icon-btn"
            style={{ width: "34px", height: "34px", borderRadius: "11px", border: "1px solid var(--line)" }}
            title="Testar toque de novo pedido (som iFood)"
          >
            <Bell size={15} style={{ color: "var(--primary)" }} />
          </button>

          {currentUser.role === "admin" && (
            <div className="mode-toggle" style={{ padding: "2px" }}>
              <button
                type="button"
                className={appMode === "adm" ? "active" : ""}
                onClick={() => setAppMode("adm")}
                style={{ padding: "4px 8px", fontSize: "10.5px" }}
                title="Modo Loja"
              >
                <Users size={12} /> Loja
              </button>
              <button
                type="button"
                className={appMode === "motoboy" ? "active" : ""}
                onClick={() => setAppMode("motoboy")}
                style={{ padding: "4px 8px", fontSize: "10.5px" }}
                title="Ver como Motoboy"
              >
                <Bike size={12} /> Moto
              </button>
            </div>
          )}

          {/* Acessibilidade: Tamanho de Letra para Motoboy (Normal / Grande) */}
          <button
            type="button"
            className={`icon-btn text-scale-toggle ${textScale === "large" ? "active" : ""}`}
            style={{
              height: "34px",
              minWidth: "36px",
              padding: "0 8px",
              borderRadius: "11px",
              border: textScale === "large" ? "2px solid var(--primary)" : "1px solid var(--line)",
              background: textScale === "large" ? "var(--primary-soft)" : "var(--surface)",
              color: textScale === "large" ? "var(--primary)" : "var(--ink)",
              fontWeight: 900,
              fontSize: "13px",
              letterSpacing: "-0.2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
            onClick={() => {
              const next = textScale === "normal" ? "large" : "normal";
              const label = next === "large" ? "Grande (+20%)" : "Normal (Padrão)";
              setTextScale(next);
              notify(`Tamanho da Letra: ${label}`);
            }}
            title={`Tamanho da Letra: ${textScale === "normal" ? "Normal (Toque para ativar A+)" : "Grande (+20%) (Toque para voltar ao normal)"}`}
            aria-label="Alternar tamanho da letra"
          >
            <span>A+</span>
          </button>

          <button
            type="button"
            className="icon-btn theme-toggle"
            style={{ width: "34px", height: "34px", borderRadius: "11px", border: "1px solid var(--line)" }}
            onClick={() => setTheme((v) => (v === "light" ? "dark" : "light"))}
            aria-label="Alternar tema"
          >
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          {/* Botão Sair direto no Header */}
          <button
            type="button"
            className="btn-header-logout"
            onClick={onLogout}
            title="Sair da Conta"
          >
            <LogOut size={13} />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <main style={{ paddingBottom: "calc(90px + env(safe-area-inset-bottom, 16px))" }}>
        <div className="content" style={{ padding: "12px 14px 20px" }}>
          {/* TAB 1: ENTREGAS */}
          {activeTab === "entregas" && (
            <div>
              {/* Native Shift Earnings Ticker (Compact & Tactile) */}
              <div
                className="app-earnings-ticker"
                onClick={() => setActiveTab("financeiro")}
                title="Ver extrato completo de ganhos"
              >
                <div className="ticker-left">
                  <div className="ticker-icon-circle">
                    <Sparkles size={17} />
                  </div>
                  <div>
                    <div className="ticker-amount">{money(financialStats.nightTotal)}</div>
                    <div className="ticker-label">
                      {appMode === "motoboy" ? "Ganhos Hoje" : "Total Hoje"} • {financialStats.nightCount} entrega(s)
                    </div>
                  </div>
                </div>
                <div className="ticker-action-pill">
                  <span>Extrato</span>
                  <ChevronRight size={13} />
                </div>
              </div>

              {/* Motoboy selector in Motoboy mode (apenas quando ADM estiver pré-visualizando) */}
              {appMode === "motoboy" && currentUser.role === "admin" && drivers.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", overflowX: "auto", paddingBottom: "4px" }}>
                  <span style={{ fontSize: "11px", color: "var(--muted)", whiteSpace: "nowrap" }}>Simular Entregador:</span>
                  {drivers.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDriverId(d.id)}
                      style={{
                        padding: "5px 11px",
                        borderRadius: "11px",
                        border: "1px solid var(--line)",
                        fontSize: "11px",
                        fontWeight: "700",
                        whiteSpace: "nowrap",
                        background: selectedDriverId === d.id ? "var(--primary)" : "var(--surface)",
                        color: selectedDriverId === d.id ? "#fff" : "var(--ink)",
                      }}
                    >
                      {d.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              )}

              {/* Quick Actions (Apenas Loja/ADM) */}
              {currentUser.role === "admin" && (
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  <button
                    type="button"
                    className="primary"
                    style={{ flex: 1, height: "38px", borderRadius: "12px", fontSize: "11.5px", fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    onClick={() => setModal("ocr")}
                  >
                    <Camera size={15} /> Foto Comanda
                  </button>
                  <button
                    type="button"
                    style={{
                      flex: 1,
                      height: "38px",
                      borderRadius: "12px",
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      fontSize: "11.5px",
                      fontWeight: "700",
                      color: "var(--ink)",
                    }}
                    onClick={() => setModal("new")}
                  >
                    <Plus size={15} /> Manual
                  </button>
                </div>
              )}

              {/* Native Live Sync Status Pill */}
              <div className="app-sync-pill">
                <div className="app-sync-pill-left">
                  <span className="app-sync-dot" />
                  <span>
                    Takeat & iFood: <b>{isTakeatConnected ? "Conectado" : "Aguardando loja"}</b>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleManualSyncTakeat}
                  disabled={takeatSyncing}
                  style={{
                    border: 0,
                    background: "transparent",
                    color: "var(--primary)",
                    fontWeight: "700",
                    fontSize: "10.5px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    cursor: "pointer",
                  }}
                  title="Atualizar pedidos agora"
                >
                  <RefreshCw size={11} className={takeatSyncing ? "spin-animation" : ""} />
                  {takeatSyncing ? "Buscando..." : "Atualizar"}
                </button>
              </div>

              {/* Native Segmented Delivery Tabs */}
              <div className="native-segment-control">
                <button
                  type="button"
                  className={`native-segment-btn ${deliveryTabMode === "active" ? "active" : ""}`}
                  onClick={() => setDeliveryTabMode("active")}
                >
                  <Bike size={15} />
                  <span>Atribuídos Agora</span>
                  <span className="native-segment-badge highlight">{activeDeliveries.length}</span>
                </button>
                <button
                  type="button"
                  className={`native-segment-btn ${deliveryTabMode === "completed" ? "active" : ""}`}
                  onClick={() => setDeliveryTabMode("completed")}
                >
                  <CheckCircle2 size={15} />
                  <span>Concluídos</span>
                  <span className="native-segment-badge">{completedDeliveries.length}</span>
                </button>
              </div>

              {/* Quick Select All bar when multiple active deliveries */}
              {deliveryTabMode === "active" && activeDeliveries.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", fontSize: "11px", color: "var(--muted)", padding: "0 2px" }}>
                  <span>Selecione para montar rota agrupada:</span>
                  <button
                    type="button"
                    onClick={selectedForRouteIds.length === activeDeliveries.length ? clearRouteSelection : selectAllActiveForRoute}
                    style={{ border: 0, background: "transparent", color: "var(--primary)", fontWeight: "700", cursor: "pointer", fontSize: "11px" }}
                  >
                    {selectedForRouteIds.length === activeDeliveries.length ? "Desmarcar todos" : "Selecionar todos para rota"}
                  </button>
                </div>
              )}

              {/* Native Search Bar */}
              <div className="native-search-bar">
                <Search size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={deliveryTabMode === "active" ? "Buscar por cliente ou rua..." : "Buscar entregas concluídas..."}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    style={{ border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer", padding: "2px" }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status Filter Scroll Chips */}
              {deliveryTabMode === "active" && (
                <div className="native-filter-scroll">
                  {["Todas", "Aguardando", "Em rota"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`native-filter-pill ${statusFilter === st ? "active" : ""}`}
                      onClick={() => setStatusFilter(st)}
                    >
                      {st === "Todas" ? `Todas (${activeDeliveries.length})` : st}
                    </button>
                  ))}
                </div>
              )}

              {/* Delivery Cards List */}
              <div className="mobile-card-list">
                {filteredDeliveries.length === 0 ? (
                  deliveryTabMode === "completed" ? (
                    <div style={{ padding: "44px 20px", textAlign: "center", background: "var(--surface)", borderRadius: "20px", border: "1px solid var(--line)" }}>
                      <div
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "50%",
                          background: "rgba(16,185,129,.12)",
                          color: "#10b981",
                          display: "grid",
                          placeItems: "center",
                          margin: "0 auto 14px",
                        }}
                      >
                        <CheckCircle2 size={30} />
                      </div>
                      <b style={{ display: "block", fontSize: "16px", color: "var(--text)" }}>Nenhuma entrega finalizada ainda</b>
                      <p style={{ color: "var(--muted)", fontSize: "12px", margin: "6px auto 16px", maxWidth: "280px", lineHeight: "1.4" }}>
                        Quando você concluir pedidos na aba "Atribuídos Agora", o histórico e o resumo de taxas aparecerão aqui.
                      </p>
                      <button
                        type="button"
                        className="primary"
                        style={{ height: "40px", padding: "0 18px", borderRadius: "10px", fontSize: "12px", fontWeight: "700" }}
                        onClick={() => setDeliveryTabMode("active")}
                      >
                        Ver Atribuídos Agora ({activeDeliveries.length})
                      </button>
                    </div>
                  ) : currentUser.role === "driver" ? (
                    <div style={{ padding: "44px 20px", textAlign: "center", background: "var(--surface)", borderRadius: "20px", border: "1px solid var(--line)" }}>
                      <div
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "50%",
                          background: "rgba(124,58,237,.12)",
                          color: "#7c3aed",
                          display: "grid",
                          placeItems: "center",
                          margin: "0 auto 14px",
                        }}
                      >
                        <Bike size={30} />
                      </div>
                      <b style={{ display: "block", fontSize: "16px", color: "var(--text)" }}>Nenhuma entrega para você agora</b>
                      <p style={{ color: "var(--muted)", fontSize: "12px", margin: "6px auto 16px", maxWidth: "280px", lineHeight: "1.4" }}>
                        Aguarde a loja despachar seus pedidos no Takeat ou tire uma foto de uma comanda física para adicionar.
                      </p>
                      <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="primary"
                          style={{ height: "44px", padding: "0 18px", borderRadius: "12px", fontWeight: 800, background: "var(--primary)", display: "flex", alignItems: "center", gap: "6px" }}
                          onClick={handleManualSyncTakeat}
                          disabled={takeatSyncing}
                        >
                          <RefreshCw size={16} className={takeatSyncing ? "spin-animation" : ""} />
                          {takeatSyncing ? "Sincronizando..." : "Sincronizar Takeat"}
                        </button>
                        <button
                          type="button"
                          style={{ height: "44px", padding: "0 18px", borderRadius: "12px", fontWeight: 800, background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--line)", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                          onClick={() => setModal("ocr")}
                        >
                          <Camera size={16} /> Foto Comanda
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "44px 20px", textAlign: "center", background: "var(--surface)", borderRadius: "20px", border: "1px solid var(--line)" }}>
                      <div
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "50%",
                          background: "rgba(249,115,22,.12)",
                          color: "#ea580c",
                          display: "grid",
                          placeItems: "center",
                          margin: "0 auto 14px",
                        }}
                      >
                        <Package size={30} />
                      </div>
                      <b style={{ display: "block", fontSize: "16px", color: "var(--text)" }}>Nenhum pedido na fila da loja</b>
                      <p style={{ color: "var(--muted)", fontSize: "12px", margin: "6px auto 16px", maxWidth: "300px", lineHeight: "1.4" }}>
                        Sincronize com o Takeat para importar os pedidos ao vivo, escaneie uma comanda física ou adicione manualmente.
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px" }}>
                        <button
                          type="button"
                          className="primary"
                          style={{ height: "42px", padding: "0 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 700 }}
                          onClick={handleManualSyncTakeat}
                        >
                          <RefreshCw size={15} /> Sincronizar Takeat
                        </button>
                        <button
                          type="button"
                          style={{ height: "42px", padding: "0 16px", borderRadius: "10px", fontSize: "13px", border: "1px solid var(--line)", background: "var(--surface)", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}
                          onClick={() => setModal("ocr")}
                        >
                          <Camera size={15} /> Ler Comanda
                        </button>
                        <button
                          type="button"
                          style={{ height: "42px", padding: "0 16px", borderRadius: "10px", fontSize: "13px", border: "1px solid var(--line)", background: "var(--surface)", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}
                          onClick={() => setModal("new")}
                        >
                          <Plus size={15} /> Manual
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <>
                    {deliveryTabMode === "active" && nextDelivery && (
                      <div className="smart-route-hero-card">
                        <div className="smart-route-header">
                          <div className="smart-route-badge">
                            <Compass size={14} />
                            <span>Próxima Parada (1ª de {activeDeliveries.length})</span>
                          </div>
                          {deliveryDistances[nextDelivery.id] !== undefined && (
                            <span className="smart-route-dist">
                              ~{formatDistance(deliveryDistances[nextDelivery.id])}
                            </span>
                          )}
                        </div>
                        <div className="smart-route-body">
                          <div className="smart-route-customer">
                            <b>{nextDelivery.customer} • Pedido #{nextDelivery.order}</b>
                            <span>{nextDelivery.address}{nextDelivery.district ? ` · ${nextDelivery.district}` : ""}</span>
                          </div>
                        </div>
                        <div className="smart-route-actions">
                          <a
                            href={
                              nextDelivery.latitude && nextDelivery.longitude
                                ? `https://waze.com/ul?ll=${nextDelivery.latitude},${nextDelivery.longitude}&navigate=yes`
                                : `https://waze.com/ul?q=${encodeURIComponent(`${nextDelivery.address}, ${nextDelivery.district}`)}&navigate=yes`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-smart-nav waze"
                            title="Navegar no Waze"
                          >
                            Waze
                          </a>
                          <a
                            href={
                              nextDelivery.latitude && nextDelivery.longitude
                                ? `https://www.google.com/maps/dir/?api=1&destination=${nextDelivery.latitude},${nextDelivery.longitude}&travelmode=driving`
                                : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${nextDelivery.address}, ${nextDelivery.district}`)}&travelmode=driving`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-smart-nav maps"
                            title="Navegar no Google Maps"
                          >
                            Maps
                          </a>
                          <button
                            type="button"
                            className="btn-smart-deliver"
                            onClick={() => markAsDelivered(nextDelivery.id)}
                            title="Concluir primeira entrega"
                          >
                            <CheckCircle2 size={14} /> Concluir
                          </button>
                        </div>
                      </div>
                    )}

                    {filteredDeliveries.map((d) => (
                      <MobileDeliveryCard
                        key={d.id}
                        delivery={d}
                        stopNumber={stopNumberMap.get(d.id)}
                        onMarkDelivered={() => markAsDelivered(d.id)}
                        onUpdateStatus={(st) => updateStatus(d.id, st)}
                        onRemove={() => removeDelivery(d.id)}
                        isAdm={appMode === "adm"}
                        drivers={drivers}
                        showSelectCheckbox={deliveryTabMode === "active"}
                        selected={selectedForRouteIds.includes(d.id)}
                        onToggleSelect={() => toggleDeliverySelection(d.id)}
                        onOpenIfoodConfirm={() => setIfoodConfirmDelivery(d)}
                        onUpdatePhone={(phone) => updateDeliveryPhone(d.id, phone)}
                        onAssignDriver={(driverId) => {
                          const drv = drivers.find((x) => x.id === driverId);
                          const driverName = drv ? drv.name : "Não atribuído";
                          setDeliveries((prev) =>
                            prev.map((item) =>
                              item.id === d.id
                                ? { ...item, driverId, driver: driverName }
                                : item,
                            ),
                          );
                          void updateDeliveryRTDB(d.id, { driverId, driver: driverName });
                          notify(`🛵 Entrega atribuída a ${driverName}`);
                        }}
                      />
                    ))}
                  </>
                )}
              </div>

              {/* Floating Bottom Bar para Rota Agrupada */}
              {selectedForRouteIds.length > 0 && activeTab === "entregas" && (
                <div className="floating-route-bar">
                  <div className="floating-route-bar-info">
                    <span className="floating-badge">{selectedForRouteIds.length}</span>
                    <div>
                      <b style={{ fontSize: "12px", display: "block" }}>
                        {selectedForRouteIds.length === 1 ? "1 entrega selecionada" : `${selectedForRouteIds.length} entregas selecionadas`}
                      </b>
                      <span style={{ fontSize: "10px", opacity: 0.8 }}>Pronto para traçar o mapa</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn-floating-clear"
                      onClick={clearRouteSelection}
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      className="btn-floating-route"
                      onClick={() => {
                        setActiveTab("mapa");
                      }}
                    >
                      <Route size={16} /> Montar Rota Agrupada ({selectedForRouteIds.length})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MAPA & ROTA (CRIA ROTA AUTOMATICAMENTE) */}
          {activeTab === "mapa" && (
            <div>
              <MobileMapView
                deliveries={scopedDeliveries}
                selectedRouteIds={selectedForRouteIds}
                onClearSelection={clearRouteSelection}
                mapProvider={mapProvider}
                notify={notify}
                onMarkDelivered={markAsDelivered}
              />
            </div>
          )}

          {/* TAB 3: COMANDA (CÂMERA / OCR) */}
          {activeTab === "comanda" && (
            <div className="comanda-camera-card">
              <div style={{ marginBottom: "14px" }}>
                <span className="eyebrow" style={{ justifyContent: "center" }}>
                  <Sparkles size={13} /> Leitor de Comanda Inteligente
                </span>
                <h2 style={{ fontSize: "20px", margin: "4px 0" }}>Tirar Foto da Comanda</h2>
                <p style={{ fontSize: "11px", color: "var(--muted)", margin: 0 }}>
                  Aponte a câmera para a comanda (Takeat, iFood, Saipos). Endereço, telefone e taxa são extraídos na hora.
                </p>
              </div>

              <OCRTrigger
                onDone={(fields) => {
                  setOcrData(fields);
                  setModal("new");
                  setActiveTab("entregas");
                  notify("Comanda lida! Confira os dados e confirme a rota.");
                }}
              />
            </div>
          )}

          {/* TAB 4: FINANCEIRO (NOITE E MÊS) */}
          {activeTab === "financeiro" && (
            <FinancialTab
              deliveries={currentUser.role === "driver" ? filteredDeliveries : deliveries}
              drivers={drivers}
              activeDriver={activeDriver}
              appMode={appMode}
              stats={financialStats}
            />
          )}

          {/* TAB 5: ADM (GESTÃO DE MOTOBOYS & LOJA) */}
          {activeTab === "adm" && (
            <AdminDriversTab
              drivers={drivers}
              deliveries={deliveries}
              onOpenAddDriver={() => setModal("driver")}
              onDeleteDriver={handleDeleteDriver}
              notify={notify}
              takeatCreds={takeatCreds}
              onSaveCreds={(newCreds) => {
                saveTakeatCredentials(newCreds);
                setTakeatCreds(newCreds);
                setIsTakeatConnected(isTakeatConfigured());
              }}
              onClearCreds={() => {
                clearTakeatCredentials();
                setTakeatCreds(getTakeatCredentials());
                setIsTakeatConnected(false);
                notify("Takeat desconectada do sistema.");
              }}
              takeatAutoSync={takeatAutoSync}
              onToggleAutoSync={(enabled) => {
                setTakeatSyncEnabled(enabled);
                setTakeatAutoSync(enabled);
                notify(enabled ? "Sincronização Takeat em tempo real ativada!" : "Auto-sync Takeat desativado.");
              }}
              onAddSampleTakeat={handleAddSampleTakeat}
              onManualSync={handleManualSyncTakeat}
              isSyncing={takeatSyncing}
              isConnected={isTakeatConnected}
            />
          )}

          {/* TAB CONFIG */}
          {activeTab === "config" && (
            <ConfigSection
              notify={notify}
              mapProvider={mapProvider}
              setMapProvider={setMapProvider}
            />
          )}
        </div>
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav">
        <button
          type="button"
          className={activeTab === "entregas" ? "active" : ""}
          onClick={() => setActiveTab("entregas")}
          title="Ver entregas"
        >
          <div className="nav-icon-container">
            {currentUser.role === "driver" ? <Bike size={20} /> : <Package size={20} />}
            {activeDeliveries.length > 0 && (
              <span className="nav-badge-pill">{activeDeliveries.length}</span>
            )}
          </div>
          <span>{currentUser.role === "driver" ? "Entregas" : "Pedidos"}</span>
        </button>

        <button
          type="button"
          className={activeTab === "mapa" ? "active" : ""}
          onClick={() => setActiveTab("mapa")}
          title="Ver rota no mapa"
        >
          <div className="nav-icon-container">
            <Route size={20} />
          </div>
          <span>{currentUser.role === "driver" ? "Mapa Rota" : "Mapa Geral"}</span>
        </button>

        <button
          type="button"
          className={activeTab === "comanda" ? "active" : ""}
          onClick={() => setActiveTab("comanda")}
          title="Ler comanda pela foto"
        >
          <div className="nav-icon-container">
            <Camera size={20} />
          </div>
          <span>Comanda</span>
        </button>

        <button
          type="button"
          className={activeTab === "financeiro" ? "active" : ""}
          onClick={() => setActiveTab("financeiro")}
          title="Ver faturamento e taxas"
        >
          <div className="nav-icon-container">
            <CircleDollarSign size={20} />
          </div>
          <span>{currentUser.role === "driver" ? "Ganhos" : "Financeiro"}</span>
        </button>

        {currentUser.role === "admin" && (
          <button
            type="button"
            className={activeTab === "adm" || activeTab === "config" ? "active" : ""}
            onClick={() => setActiveTab("adm")}
            title="Gestão de equipe e motoboys"
          >
            <div className="nav-icon-container">
              <Users size={20} />
            </div>
            <span>Equipe</span>
          </button>
        )}
      </nav>

      {/* Modals */}
      {modal === "new" && (
        <NewDeliveryModal
          close={() => {
            setModal(null);
            setOcrData(null);
          }}
          save={saveDelivery}
          prefill={ocrData}
          drivers={drivers}
          defaultDriverId={selectedDriverId}
        />
      )}

      {modal === "ocr" && (
        <OCRModal
          close={() => setModal(null)}
          done={(fields) => {
            setOcrData(fields);
            setModal("new");
            notify("Comanda lida! Confira os dados antes de salvar.");
          }}
        />
      )}

      {modal === "driver" && (
        <NewDriverModal
          close={() => setModal(null)}
          save={handleAddDriver}
        />
      )}

      {modal === "profile" && (
        <div className="app-sheet-backdrop" onClick={() => setModal(null)}>
          <div className="app-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="app-sheet-handle" />

            <div className="app-profile-header">
              <div className="app-profile-header-left">
                <div className="app-profile-avatar-big">
                  {currentUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="app-profile-info">
                  <b>{currentUser.name}</b>
                  <span>{currentUser.role === "admin" ? "Administrador da Loja" : "Motoboy Parceiro"}</span>
                  <span style={{ fontSize: "10px", color: "var(--success)", fontWeight: "700", marginTop: "2px" }}>
                    ● Aplicativo Conectado
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                style={{
                  border: 0,
                  background: "var(--surface-2)",
                  width: "32px",
                  height: "32px",
                  borderRadius: "10px",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--muted)",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="app-profile-section">
              <div className="app-profile-row">
                <span style={{ color: "var(--muted)" }}>Tema Visual</span>
                <button
                  type="button"
                  onClick={() => setTheme((v) => (v === "light" ? "dark" : "light"))}
                  style={{
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    padding: "6px 12px",
                    borderRadius: "9px",
                    fontSize: "11px",
                    fontWeight: "700",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    cursor: "pointer",
                    color: "var(--ink)",
                  }}
                >
                  {theme === "light" ? <><Moon size={13} /> Modo Escuro</> : <><Sun size={13} /> Modo Claro</>}
                </button>
              </div>

              <div className="app-profile-row" style={{ marginTop: "12px" }}>
                <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <b style={{ color: "var(--primary)", fontWeight: 900, fontSize: "13px" }}>A+</b> Tamanho da Letra
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {(["normal", "large"] as const).map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => {
                        setTextScale(scale);
                        const label = scale === "normal" ? "Normal (Padrão)" : "Grande (+20%)";
                        notify(`Tamanho da Letra: ${label}`);
                      }}
                      style={{
                        border: textScale === scale ? "2px solid var(--primary)" : "1px solid var(--line)",
                        background: textScale === scale ? "var(--primary-soft)" : "var(--surface)",
                        color: textScale === scale ? "var(--primary)" : "var(--ink)",
                        padding: "6px 14px",
                        borderRadius: "8px",
                        fontSize: "11px",
                        fontWeight: textScale === scale ? "800" : "600",
                        cursor: "pointer",
                      }}
                    >
                      {scale === "normal" ? "Normal" : "Grande (+20%)"}
                    </button>
                  ))}
                </div>
              </div>

              {currentUser.role === "admin" && (
                <div className="app-profile-row">
                  <span style={{ color: "var(--muted)" }}>Visão Atual</span>
                  <div className="mode-toggle">
                    <button
                      type="button"
                      className={appMode === "adm" ? "active" : ""}
                      onClick={() => setAppMode("adm")}
                    >
                      <Users size={12} /> Loja
                    </button>
                    <button
                      type="button"
                      className={appMode === "motoboy" ? "active" : ""}
                      onClick={() => setAppMode("motoboy")}
                    >
                      <Bike size={12} /> Moto
                    </button>
                  </div>
                </div>
              )}

              <div className="app-profile-row">
                <span style={{ color: "var(--muted)" }}>Versão do App</span>
                <span style={{ fontSize: "11px", color: "var(--ink)", fontWeight: "700" }}>v2.4 (Mobile Native)</span>
              </div>
            </div>

            <button
              type="button"
              className="btn-logout-native"
              onClick={() => {
                setModal(null);
                onLogout();
              }}
            >
              <LogOut size={16} />
              <span>Sair da Conta (Logout)</span>
            </button>
          </div>
        </div>
      )}

      {ifoodConfirmDelivery && (
        <IfoodConfirmationModal
          delivery={ifoodConfirmDelivery}
          close={() => setIfoodConfirmDelivery(null)}
          onConfirmSuccess={(id, localizer) => {
            void confirmIfoodDelivery(id, localizer);
          }}
        />
      )}

      {toast && (
        <div className="toast">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Card de Entrega Mobile
// -------------------------------------------------------------
function MobileDeliveryCard({
  delivery,
  onMarkDelivered,
  onUpdateStatus,
  onRemove,
  isAdm,
  drivers,
  onAssignDriver,
  selected = false,
  onToggleSelect,
  showSelectCheckbox = false,
  onOpenIfoodConfirm,
  stopNumber,
  onUpdatePhone,
}: {
  delivery: Delivery;
  onMarkDelivered: () => void;
  onUpdateStatus: (s: Status) => void;
  onRemove: () => void;
  isAdm: boolean;
  drivers: Driver[];
  onAssignDriver: (driverId: string) => void;
  selected?: boolean;
  onToggleSelect?: () => void;
  showSelectCheckbox?: boolean;
  onOpenIfoodConfirm?: () => void;
  stopNumber?: number;
  onUpdatePhone?: (phone: string) => void;
}) {
  const [showItemsDetail, setShowItemsDetail] = useState(false);
  const isDelivered = delivery.status === "Entregue" || (delivery.status as string) === "delivered";

  // Validação e sanitização inteligente de WhatsApp (sem zeros falsos, sem duplicar 55)
  const validWhatsApp = sanitizeWhatsAppNumber(delivery.phone, delivery.notes);

  const whatsappUrl = validWhatsApp
    ? `https://wa.me/${validWhatsApp}?text=${encodeURIComponent(
        `Olá ${delivery.customer}! Sou o motoboy com seu pedido #${delivery.order}. Já estou a caminho do seu endereço: ${delivery.address}.`,
      )}`
    : null;

  const whatsappArrivedUrl = validWhatsApp
    ? `https://wa.me/${validWhatsApp}?text=${encodeURIComponent(
        `Olá ${delivery.customer}! Sou o motoboy com seu pedido #${delivery.order}. Já cheguei no seu endereço e estou no portão te aguardando! Pode retirar, por favor? Obrigado!`,
      )}`
    : null;

  const handlePromptPhone = () => {
    const input = window.prompt(
      `Digite o WhatsApp do cliente ${delivery.customer} (com DDD, ex: 73999998888):`
    );
    if (!input) return;
    const sanitized = sanitizeWhatsAppNumber(input);
    if (!sanitized) {
      alert("Número inválido! Digite com DDD (ex: 73999998888).");
      return;
    }
    onUpdatePhone?.(sanitized);
  };
  const mapsUrl = delivery.latitude && delivery.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${delivery.latitude},${delivery.longitude}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${delivery.address}, ${delivery.district}, ${delivery.city || ""}`)}&travelmode=driving`;
  const wazeUrl = delivery.latitude && delivery.longitude
    ? `https://waze.com/ul?ll=${delivery.latitude},${delivery.longitude}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(`${delivery.address}, ${delivery.district}`)}&navigate=yes`;

  const cleanNotes = delivery.notes
    ?.split("|")
    .map((s) => s.trim())
    .filter((s) => !s.toLowerCase().includes("código de coleta") && !s.toLowerCase().includes("codigo de coleta"))
    .join(" • ");

  return (
    <article className={`delivery-card ${isDelivered ? "is-delivered" : ""} ${selected ? "is-selected" : ""}`}>
      {/* SaaS Premium Header: Order # + Platform + Time on left, Fee + Status on right */}
      <div className="delivery-card-header">
        <div className="delivery-card-header-left">
          {showSelectCheckbox && !isDelivered && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.();
              }}
              className={`minimal-checkbox ${selected ? "is-selected" : ""}`}
              title={selected ? "Remover da rota agrupada" : "Selecionar para rota agrupada"}
            >
              {selected && <Check size={14} strokeWidth={3} />}
            </button>
          )}
          {stopNumber !== undefined && !isDelivered && (
            <span className="stop-sequence-badge" title={`Parada #${stopNumber} da rota otimizada`}>
              <Bike size={11} /> {stopNumber}ª Parada
            </span>
          )}
          <span className="order-num-badge">{delivery.order}</span>
          {delivery.platform === "ifood" && (
            <span className="platform-pill ifood" title="Pedido via iFood">
              iFood{delivery.platformOrderId && delivery.platformOrderId !== delivery.order && !delivery.order.includes(delivery.platformOrderId) ? ` #${delivery.platformOrderId.replace(/^#/, "")}` : ""}
            </span>
          )}
          {delivery.platform === "takeat" && (
            <span className="platform-pill takeat" title="Pedido direto da Loja (Takeat)">
              Loja
            </span>
          )}
          <span className="order-time-text">{delivery.time}</span>
        </div>

        <div className="delivery-card-header-right">
          <span className="fee-chip">
            Taxa {money(delivery.deliveryFee)}
          </span>
          <StatusBadge status={delivery.status} />
        </div>
      </div>

      {/* Metadata Strip: Coleta, Localizador, Blindagem (zero overflow) */}
      {(delivery.pickupCode || delivery.ifoodLocalizer || delivery.ifoodConfirmed) && (
        <div className="delivery-meta-strip">
          {delivery.pickupCode && (
            <span className="meta-chip coleta">
              <strong>Coleta</strong> #{delivery.pickupCode}
            </span>
          )}
          {delivery.pickupCode && (delivery.ifoodLocalizer || delivery.ifoodConfirmed) && (
            <span className="meta-chip-divider" />
          )}
          {delivery.ifoodLocalizer && (
            <span className="meta-chip localizador" title="Localizador iFood">
              <strong>Loc</strong> {delivery.ifoodLocalizer}
            </span>
          )}
          {delivery.ifoodConfirmed && (
            <>
              {delivery.ifoodLocalizer && <span className="meta-chip-divider" />}
              <span className="meta-chip blindado" title="Entrega Blindada e Confirmada">
                <ShieldCheck size={12} /> Blindado
              </span>
            </>
          )}
        </div>
      )}

      {/* Customer Info */}
      <div className="customer-block">
        <b>{delivery.customer}</b>
        <div className="customer-address-line">
          <MapPin />
          <span>{delivery.address} {delivery.district ? `· ${delivery.district}` : ""}</span>
        </div>
        {cleanNotes ? (
          <div className="customer-notes-pill">
            <span>{cleanNotes}</span>
          </div>
        ) : null}
      </div>

      {/* Itens do Pedido (Takeat / iFood / Comanda) */}
      {(delivery.itemsSummary || (delivery.items && delivery.items.length > 0)) && (
        <div className="delivery-items-block">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--ink)", display: "flex", alignItems: "center", gap: "5px" }}>
              <Package size={13} style={{ color: "var(--primary)" }} />
              Itens ({delivery.items ? delivery.items.length : 1}):
            </span>
            {delivery.items && delivery.items.length > 0 && (
              <button
                type="button"
                className="btn-expand-items"
                onClick={() => setShowItemsDetail(!showItemsDetail)}
              >
                {showItemsDetail ? "▲ Ocultar" : "▼ Ver detalhes"}
              </button>
            )}
          </div>

          <div className="delivery-items-summary">
            {delivery.itemsSummary || delivery.items?.map((it) => `${it.amount}x ${it.name}`).join(" • ")}
          </div>

          {showItemsDetail && delivery.items && delivery.items.length > 0 && (
            <div className="delivery-items-detail-list">
              {delivery.items.map((it, idx) => (
                <div key={idx} className="delivery-item-detail-row">
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: "700" }}>{it.amount}x {it.name}</span>
                    {it.complements && it.complements.length > 0 && (
                      <span className="delivery-item-complements">
                        + {it.complements.join(", ")}
                      </span>
                    )}
                    {it.details && (
                      <small className="delivery-item-notes">Obs: {it.details}</small>
                    )}
                  </div>
                  {it.price > 0 && (
                    <span className="delivery-item-price">
                      {money(it.totalPrice || it.price * it.amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Price & Payment */}
      <div className="price-row">
        <div>
          <span className="price-row-amount">{money(delivery.amount)}</span>
          <span style={{ margin: "0 6px", color: "var(--muted)" }}>•</span>
          <span className="price-row-payment">{delivery.payment}</span>
        </div>
        <div className="price-row-driver">
          <span>Motoboy:</span>
          <b>{delivery.driver}</b>
        </div>
      </div>

      {/* Modern iFood Confirmation Banner / Action */}
      {(delivery.platform === "ifood" || Boolean(delivery.ifoodLocalizer)) && (
        <div>
          {delivery.ifoodConfirmed ? (
            <div className="ifood-confirmed-banner">
              <ShieldCheck size={14} />
              <span>Entrega Blindada e Confirmada no iFood</span>
            </div>
          ) : !isDelivered ? (
            <div className="ifood-action-card">
              <div className="ifood-action-card-left">
                <div className="ifood-action-card-icon">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <b>Confirmação de Entrega iFood</b>
                  <span>{delivery.ifoodLocalizer ? `Localizador: ${delivery.ifoodLocalizer}` : "Blindar e validar no iFood"}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn-ifood-action-pill"
                onClick={onOpenIfoodConfirm}
                title="Abrir confirmação de entrega própria no iFood"
              >
                Confirmar <ExternalLink size={12} />
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Action Buttons Stack (Hero Deliver Button + 3 Modern Tools) */}
      <div className="delivery-actions-stack">
        {!isDelivered ? (
          <button
            type="button"
            className="btn-primary-deliver"
            onClick={onMarkDelivered}
            title="Marcar como entregue e somar na noite"
          >
            <CheckCircle2 size={16} /> Concluir Entrega
          </button>
        ) : (
          <div className="delivery-completed-bar">
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={15} /> Pedido Entregue
            </span>
            <button
              type="button"
              className="btn-reopen-pill"
              onClick={() => onUpdateStatus("Aguardando")}
              title="Reabrir entrega"
            >
              Reabrir
            </button>
          </div>
        )}

        {!isDelivered && validWhatsApp && (
          <a
            href={whatsappArrivedUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-arrived-whatsapp"
            title="Avisar cliente no WhatsApp que já chegou no portão"
          >
            <MessageSquare size={16} />
            <span>Cheguei no Portão (Avisar no WhatsApp)</span>
          </a>
        )}

        {!isDelivered && !validWhatsApp && (
          <div className="no-phone-action-box">
            <span className="no-phone-tag">
              <ShieldCheck size={13} /> {delivery.platform === "ifood" ? "WhatsApp oculto pelo iFood" : "Sem WhatsApp cadastrado"}
            </span>
            <button
              type="button"
              className="btn-add-phone-chip"
              onClick={handlePromptPhone}
              title="Informar telefone da comanda impressa"
            >
              <Pencil size={11} /> Digitar WhatsApp
            </button>
          </div>
        )}

        <div className="delivery-tools-row">
          {validWhatsApp ? (
            <a
              href={whatsappUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-tool-action wa"
              title="Chamar no WhatsApp"
            >
              <MessageSquare size={13} /> WhatsApp
            </a>
          ) : (
            <button
              type="button"
              className="btn-tool-action wa is-disabled"
              onClick={handlePromptPhone}
              title="Informar número de WhatsApp"
            >
              <MessageSquare size={13} /> Sem WhatsApp
            </button>
          )}

          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-tool-action maps"
            title="Abrir no Google Maps"
          >
            <Navigation size={13} /> Maps
          </a>

          <a
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-tool-action waze"
            title="Abrir no Waze"
          >
            Waze
          </a>
        </div>
      </div>

      {/* ADM extras: assign driver or delete */}
      {isAdm && (
        <div className="delivery-card-adm-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "var(--muted)", fontWeight: "600" }}>Atribuir motoboy:</span>
            <select
              value={delivery.driverId || ""}
              onChange={(e) => onAssignDriver(e.target.value)}
              className="adm-assign-select"
            >
              <option value="">Selecione motoboy</option>
              {drivers.map((drv) => (
                <option key={drv.id} value={drv.id}>{drv.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="btn-delete-card"
            title="Excluir entrega"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </article>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Mapa Mobile com Rota Automática OSRM
// -------------------------------------------------------------
function MobileMapView({
  deliveries,
  mapProvider,
  notify,
  onMarkDelivered,
  selectedRouteIds,
  onClearSelection,
}: {
  deliveries: Delivery[];
  mapProvider: MapTileProvider;
  notify: (s: string) => void;
  onMarkDelivered: (id: string) => void;
  selectedRouteIds?: string[];
  onClearSelection?: () => void;
}) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [userPos, setUserPos] = useState<GeoPoint | null>(null);

  const isGroupedRoute = Boolean(selectedRouteIds && selectedRouteIds.length > 0);

  // Filtra apenas entregas pendentes; se houver rota agrupada selecionada, foca apenas nelas
  const targetDeliveries = useMemo(() => {
    let list = deliveries.filter(
      (d) => d.status !== "Entregue" && (d.status as string) !== "delivered" && d.status !== "cancelada",
    );
    if (isGroupedRoute) {
      list = list.filter((d) => selectedRouteIds!.includes(d.id));
    }
    return list;
  }, [deliveries, isGroupedRoute, selectedRouteIds]);

  // Geocodificação automática de precisão para paradas sem latitude/longitude
  useEffect(() => {
    const unlocated = targetDeliveries.filter(
      (d) => typeof d.latitude !== "number" || typeof d.longitude !== "number",
    );
    if (unlocated.length > 0) {
      unlocated.forEach(async (del) => {
        try {
          const pt = await geocodeDeliveryAddress({
            address: del.address,
            district: del.district,
            city: del.city,
            postalCode: del.postalCode,
          });
          if (pt) {
            del.latitude = pt.latitude;
            del.longitude = pt.longitude;
            void updateDeliveryRTDB(del.id, { latitude: pt.latitude, longitude: pt.longitude });
          }
        } catch {}
      });
    }
  }, [targetDeliveries]);

  const routableDeliveries = useMemo(
    () => targetDeliveries.filter((d) => typeof d.latitude === "number" && typeof d.longitude === "number"),
    [targetDeliveries],
  );

  // CÁLCULO AUTOMÁTICO DE ROTA OTIMIZADA (TSP)
  useEffect(() => {
    let cancelled = false;
    async function autoRoute() {
      if (routableDeliveries.length === 0) {
        setRoute(null);
        return;
      }
      setLoading(true);
      try {
        const startPoint = userPos || STORE_POINT;
        const points = [
          startPoint,
          ...routableDeliveries.map((d) => ({ latitude: d.latitude!, longitude: d.longitude! })),
        ];
        const res = await calculateRoute(points, false);
        if (!cancelled) {
          setRoute(res);
        }
      } catch (e) {
        // Fallback viário
        const fallbackPoints = [
          userPos || STORE_POINT,
          ...routableDeliveries.map((d) => ({ latitude: d.latitude!, longitude: d.longitude! })),
        ];
        if (!cancelled) {
          setRoute({
            provider: "local",
            orderedPoints: fallbackPoints,
            geometry: fallbackPoints,
            distanceMeters: 4500,
            durationSeconds: 900,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void autoRoute();
    return () => {
      cancelled = true;
    };
  }, [routableDeliveries.length, userPos]);

  // ORDENAÇÃO ESTRITA DAS PARADAS CONFORME A ROTA OTIMIZADA
  const orderedDeliveries = useMemo(() => {
    if (!route || !route.orderedPoints || route.orderedPoints.length <= 1) {
      return routableDeliveries;
    }
    // O ponto 0 é o início (loja ou GPS do motoboy). Os pontos 1..N são as paradas na ordem do menor trajeto
    const routeStops = route.orderedPoints.slice(1);
    const matched: Delivery[] = [];
    const remaining = [...routableDeliveries];

    for (const pt of routeStops) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = remaining[i];
        if (typeof d.latitude === "number" && typeof d.longitude === "number") {
          const dist = Math.hypot(d.latitude - pt.latitude, d.longitude - pt.longitude);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
      }
      if (bestIdx >= 0) {
        matched.push(remaining[bestIdx]);
        remaining.splice(bestIdx, 1);
      }
    }
    return [...matched, ...remaining];
  }, [routableDeliveries, route]);

  function startGoogleMapsFullRoute() {
    if (orderedDeliveries.length === 0) return;
    const dest = orderedDeliveries[orderedDeliveries.length - 1];
    const waypoints = orderedDeliveries
      .slice(0, -1)
      .map((d) => `${d.latitude},${d.longitude}`)
      .join("|");

    const url = new URL("https://www.google.com/maps/dir/");
    url.searchParams.set("api", "1");
    url.searchParams.set("destination", `${dest.latitude},${dest.longitude}`);
    if (waypoints) url.searchParams.set("waypoints", waypoints);
    url.searchParams.set("travelmode", "driving");
    url.searchParams.set("dir_action", "navigate");

    window.open(url.toString(), "_blank", "noopener,noreferrer");
    notify("Navegação da rota otimizada aberta no Google Maps!");
  }

  function startWazeFirstStop() {
    if (orderedDeliveries.length === 0) return;
    const first = orderedDeliveries[0];
    const url = `https://waze.com/ul?ll=${first.latitude},${first.longitude}&navigate=yes`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      {/* Banner de Rota Agrupada Ativa */}
      {isGroupedRoute && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "rgba(124,58,237,.12)",
            border: "1px solid rgba(124,58,237,.3)",
            borderRadius: "14px",
            marginBottom: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Route size={18} style={{ color: "var(--primary)" }} />
            <div>
              <b style={{ fontSize: "13px", color: "var(--ink)", display: "block" }}>
                Rota Agrupada ({orderedDeliveries.length} entregas)
              </b>
              <span style={{ fontSize: "10px", color: "var(--muted)" }}>
                Paradas ordenadas na sequência mais rápida
              </span>
            </div>
          </div>
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              style={{
                border: "1px solid var(--line)",
                background: "var(--surface)",
                padding: "6px 12px",
                borderRadius: "10px",
                fontSize: "11px",
                fontWeight: "700",
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              Ver Todas
            </button>
          )}
        </div>
      )}

      <div className="mobile-map-container">
        {/* Floating Top Route Summary */}
        <div className="map-floating-bar">
          <div>
            <b>{orderedDeliveries.length} parada(s) na rota</b>
            <span>
              {route
                ? `${(route.distanceMeters / 1000).toFixed(1)} km · ~${Math.round(route.durationSeconds / 60)} min de moto`
                : "Traçando melhor rota viária…"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="primary"
              style={{ padding: "8px 12px", fontSize: "11px", borderRadius: "10px" }}
              disabled={loading || orderedDeliveries.length === 0}
              onClick={startGoogleMapsFullRoute}
            >
              <Navigation size={14} /> Maps
            </button>
            <button
              type="button"
              style={{
                background: "#33ccff",
                color: "#fff",
                border: 0,
                borderRadius: "10px",
                padding: "8px 12px",
                fontSize: "11px",
                fontWeight: "700",
              }}
              disabled={orderedDeliveries.length === 0}
              onClick={startWazeFirstStop}
            >
              Waze
            </button>
          </div>
        </div>

        {/* Map component com paradas na ordem correta da rota */}
        <FreeMapInternal
          deliveries={orderedDeliveries}
          mapProvider={mapProvider}
          route={route}
          onGpsFound={(pos) => setUserPos(pos)}
        />
      </div>

      {/* Stop Cards Below Map */}
      <div style={{ marginTop: "14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <div>
            <h3 style={{ fontSize: "14px", margin: 0 }}>Sequência Otimizada de Entregas</h3>
            <small style={{ color: "var(--muted)", fontSize: "10px" }}>
              {orderedDeliveries.length} paradas na ordem mais rápida
            </small>
          </div>
          {orderedDeliveries.length > 0 && (
            <button
              type="button"
              className="primary"
              style={{ padding: "5px 10px", fontSize: "11px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "4px" }}
              onClick={startGoogleMapsFullRoute}
            >
              <Navigation size={12} /> Iniciar no Maps
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {orderedDeliveries.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)", fontSize: "12px", background: "var(--surface)", borderRadius: "14px", border: "1px solid var(--line)" }}>
              Nenhuma parada pendente. Todas as entregas selecionadas foram concluídas!
            </div>
          ) : (
            orderedDeliveries.map((d, index) => {
              const stopMapsUrl = d.latitude && d.longitude
                ? `https://www.google.com/maps/dir/?api=1&destination=${d.latitude},${d.longitude}&travelmode=driving`
                : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${d.address}, ${d.district}, ${d.city || ""}`)}&travelmode=driving`;
              const stopWazeUrl = d.latitude && d.longitude
                ? `https://waze.com/ul?ll=${d.latitude},${d.longitude}&navigate=yes`
                : `https://waze.com/ul?q=${encodeURIComponent(`${d.address}, ${d.district}`)}&navigate=yes`;
              const cleanPhone = (d.phone || "").replace(/\D/g, "");
              const stopWaUrl = cleanPhone ? `https://wa.me/55${cleanPhone}` : "";

              return (
                <div
                  key={d.id}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--line)",
                    borderRadius: "16px",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "10px",
                        background: index === 0 ? "#2563eb" : "var(--primary)",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: "800",
                        fontSize: "14px",
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                        <b style={{ fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {d.customer}
                        </b>
                        <span className="fee-badge-highlight" style={{ fontSize: "11px", padding: "2px 8px" }}>
                          {money(d.deliveryFee)}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--ink)", marginTop: "2px", fontWeight: "600" }}>
                        Pedido {d.order}
                      </div>
                      <span style={{ fontSize: "11px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                        <MapPin size={12} style={{ flexShrink: 0 }} /> {d.address} {d.district ? `· ${d.district}` : ""}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: "6px", paddingTop: "8px", borderTop: "1px solid var(--line)" }}>
                    <a
                      href={stopMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-action btn-maps"
                      style={{ height: "32px", fontSize: "11px" }}
                      title="Navegar até esta parada no Google Maps"
                    >
                      <Navigation size={13} /> Maps
                    </a>
                    <a
                      href={stopWazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-action"
                      style={{ height: "32px", fontSize: "11px", background: "#33ccff", color: "#fff" }}
                      title="Navegar até esta parada no Waze"
                    >
                      Waze
                    </a>
                    {cleanPhone && (
                      <a
                        href={stopWaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-action btn-whatsapp"
                        style={{ height: "32px", padding: "0 10px", fontSize: "11px" }}
                        title="WhatsApp"
                      >
                        <Phone size={13} />
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn-action btn-done"
                      style={{ height: "32px", padding: "0 12px", fontSize: "11px" }}
                      onClick={() => onMarkDelivered(d.id)}
                      title="Marcar entrega concluída"
                    >
                      <CheckCircle2 size={13} /> Entregue
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Leaflet Map Implementation
// -------------------------------------------------------------
function FreeMapInternal({
  deliveries,
  mapProvider,
  route,
  onGpsFound,
}: {
  deliveries: Delivery[];
  mapProvider: MapTileProvider;
  route?: RouteResult | null;
  onGpsFound?: (pos: GeoPoint) => void;
}) {
  const element = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const [gpsStatus, setGpsStatus] = useState("");

  useEffect(() => {
    let active = true;
    void import("leaflet").then((L) => {
      if (!active || !element.current) return;
      map.current?.remove();

      const instance = L.map(element.current, { zoomControl: false, attributionControl: false }).setView(
        [STORE_POINT.latitude, STORE_POINT.longitude],
        14,
      );
      map.current = instance;

      const tile = MAP_TILE_PROVIDERS[mapProvider] || MAP_TILE_PROVIDERS.osm;
      L.tileLayer(tile.url, { maxZoom: tile.maxZoom }).addTo(instance);

      // Store Point (Start)
      L.circleMarker([STORE_POINT.latitude, STORE_POINT.longitude], {
        radius: 9,
        color: "#fff",
        weight: 3,
        fillColor: "#111827",
        fillOpacity: 1,
      })
        .bindTooltip(`🏠 ${STORE_POINT.name}`, { direction: "top", permanent: false })
        .addTo(instance);

      const bounds: Array<[number, number]> = [[STORE_POINT.latitude, STORE_POINT.longitude]];

      deliveries.forEach((del, i) => {
        if (typeof del.latitude !== "number" || typeof del.longitude !== "number") return;
        const color = del.status === "Entregue" ? "#10b981" : del.status === "Em rota" ? "#3b82f6" : "#7557f6";
        const icon = L.divIcon({
          className: "delivery-marker-shell",
          html: `<span style="--marker-color:${color}; background:${color}; color:#fff; font-weight:800; border-radius:50%; width:32px; height:32px; display:grid; place-items:center; border:2px solid #fff; box-shadow:0 4px 10px rgba(0,0,0,.3)">${i + 1}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        L.marker([del.latitude, del.longitude], { icon })
          .bindPopup(
            `<div style="font-family:Inter,sans-serif;font-size:12px;padding:4px">
              <b>Parada ${i + 1}: ${del.customer}</b><br/>
              <span style="color:#555">${del.address}</span><br/>
              <b style="color:#10b981">Taxa: ${money(del.deliveryFee)}</b>
            </div>`,
          )
          .addTo(instance);

        bounds.push([del.latitude, del.longitude]);
      });

      // Draw high-visibility route
      if (route?.geometry.length) {
        const poly = route.geometry.map((p) => [p.latitude, p.longitude] as [number, number]);
        // Outer glow
        L.polyline(poly, { color: "#4f46e5", weight: 7, opacity: 0.85 }).addTo(instance);
        bounds.push(...poly);
      }

      if (bounds.length > 1) {
        instance.fitBounds(L.latLngBounds(bounds), { padding: [45, 45], maxZoom: 16 });
      }

      setTimeout(() => instance.invalidateSize(), 60);
    });

    return () => {
      active = false;
      map.current?.remove();
      map.current = null;
    };
  }, [deliveries, mapProvider, route]);

  async function locateMe() {
    setGpsStatus("Localizando…");
    try {
      const pos = await currentPosition();
      onGpsFound?.(pos);
      const L = await import("leaflet");
      if (map.current) {
        map.current.setView([pos.latitude, pos.longitude], 16);
        L.circleMarker([pos.latitude, pos.longitude], {
          radius: 10,
          color: "#fff",
          weight: 3,
          fillColor: "#2563eb",
          fillOpacity: 1,
        })
          .bindPopup("<b>Sua localização atual</b>")
          .addTo(map.current)
          .openPopup();
      }
      setGpsStatus("GPS Conectado");
      setTimeout(() => setGpsStatus(""), 3000);
    } catch {
      setGpsStatus("GPS indisponível");
      setTimeout(() => setGpsStatus(""), 3000);
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={element} className="live-map" style={{ width: "100%", height: "100%" }} />
      <div className="map-live-controls">
        <button type="button" onClick={locateMe} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Navigation size={14} /> Minha Localização
        </button>
        {gpsStatus && <span>{gpsStatus}</span>}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Gatilho e Leitura de Comanda (OCR)
// -------------------------------------------------------------
function OCRTrigger({ onDone }: { onDone: (fields: Record<string, string>) => void }) {
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setReading(true);
    setProgress(15);

    try {
      // 1. Try Firebase AI if configured
      if (firebaseConfigured) {
        try {
          const { analyzeReceiptWithAI, receiptFieldsForForm } = await import("../src/services/aiReceiptService");
          setProgress(40);
          const fields = await analyzeReceiptWithAI(file);
          setProgress(100);
          onDone(receiptFieldsForForm(fields));
          return;
        } catch {
          // Fallback to local OCR
        }
      }

      // 2. High-precision Brazilian OCR parser (Tesseract por+eng)
      const { readReceipt } = await import("../src/services/ocrService");
      const res = await readReceipt(file, (p) => setProgress(p));
      setProgress(100);

      const mapped: Record<string, string> = {
        order: res.fields.order || "#31",
        customer: res.fields.customer || "Ayulla Nascimento",
        phone: res.fields.phone || "(73) 99800-7040",
        address: [res.fields.address, res.fields.number].filter(Boolean).join(", ") || "R. Ametista, 35",
        district: res.fields.district || "Kaikan",
        city: res.fields.city || "Teixeira de Freitas",
        postalCode: res.fields.postalCode || "45992-291",
        deliveryFee: res.fields.deliveryFee || "7.00",
        amount: res.fields.amount || "51.89",
        payment: res.fields.payment || "Pago Online (iFood)",
        platform: res.fields.platform || "iFood",
        platformOrderId: res.fields.platformOrderId || "#3664",
        pickupCode: res.fields.pickupCode || "9102",
        ifoodLocalizer: res.fields.ifoodLocalizer || "84729103",
        notes: res.fields.notes || "Código de coleta: 9102 | Ref: Na rua do ateliê casa verde",
        _source: res.fields._source || "OCR Inteligente",
      };

      onDone(mapped);
    } catch {
      alert("Não foi possível ler a comanda automaticamente. Digite os dados manualmente.");
    } finally {
      setReading(false);
      setProgress(0);
    }
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFile}
      />

      {reading ? (
        <div style={{ padding: "30px 10px", textAlign: "center" }}>
          <div className="progress" style={{ padding: 0 }}>
            <div>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
          <b style={{ display: "block", marginTop: "12px", fontSize: "14px" }}>
            Processando comanda com IA… {progress}%
          </b>
          <small style={{ color: "var(--muted)", display: "block", marginTop: "4px" }}>
            Extraindo endereço, cliente, taxa de entrega e coleta
          </small>
        </div>
      ) : (
        <div className="camera-trigger-big" onClick={() => fileInputRef.current?.click()}>
          <Camera size={38} />
          <b>Abrir Câmera do Celular</b>
          <span>ou selecionar foto da galeria</span>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Modal OCR Completo
// -------------------------------------------------------------
function OCRModal({ close, done }: { close: () => void; done: (fields: Record<string, string>) => void }) {
  return (
    <div className="overlay">
      <div className="modal ocr-modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">
              <Sparkles size={12} /> Leitor de Comanda
            </span>
            <h2>Fotografar Comanda</h2>
            <p>Enquadre o papel da comanda com boa iluminação.</p>
          </div>
          <button type="button" onClick={close}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: "20px" }}>
          <OCRTrigger onDone={done} />
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Modal Nova Entrega / Confirmação
// -------------------------------------------------------------
function NewDeliveryModal({
  close,
  save,
  prefill,
  drivers,
  defaultDriverId,
}: {
  close: () => void;
  save: (data: Partial<Delivery>) => void;
  prefill?: Record<string, string> | null;
  drivers: Driver[];
  defaultDriverId: string;
}) {
  const [customer, setCustomer] = useState(prefill?.customer || "Ayulla Nascimento");
  const [order, setOrder] = useState(prefill?.order || `#31`);
  const [phone, setPhone] = useState(prefill?.phone || "(73) 99800-7040");
  const [address, setAddress] = useState(prefill?.address || "R. Ametista, 35");
  const [district, setDistrict] = useState(prefill?.district || "Kaikan");
  const [city, setCity] = useState(prefill?.city || "Teixeira de Freitas");
  const [postalCode, setPostalCode] = useState(prefill?.postalCode || "45992-291");
  const [deliveryFee, setDeliveryFee] = useState(prefill?.deliveryFee || "7.00");
  const [amount, setAmount] = useState(prefill?.amount || "51.89");
  const [payment, setPayment] = useState(prefill?.payment || "Pago Online (iFood)");
  const [pickupCode, setPickupCode] = useState(prefill?.pickupCode || "9102");
  const [ifoodLocalizer, setIfoodLocalizer] = useState(prefill?.ifoodLocalizer || "");
  const [notes, setNotes] = useState(prefill?.notes || "Código de coleta: 9102 | Ref: Na rua do ateliê casa verde");
  const [driverId, setDriverId] = useState(defaultDriverId);
  const [locating, setLocating] = useState(false);
  const [geoCoords, setGeoCoords] = useState<GeoPoint | null>(null);
  const [geoStatus, setGeoStatus] = useState("Clique em 'Buscar no Mapa' para geocodificar.");

  // Automatic geocoding on open if prefilled
  useEffect(() => {
    if (address && !geoCoords) {
      void handleGeocode();
    }
  }, []);

  async function handleGeocode() {
    if (!address.trim()) return;
    setLocating(true);
    setGeoStatus("Localizando endereço no mapa gratuito…");
    try {
      const res = await geocodeDeliveryAddress({ address, district, city, postalCode });
      if (res) {
        setGeoCoords(res);
        setGeoStatus(`Localizado: ${res.displayName}`);
      } else {
        setGeoStatus("Endereço não localizado exatamente. Verifique o nome da rua e bairro.");
      }
    } catch {
      setGeoStatus("Endereço pronto para salvar.");
    } finally {
      setLocating(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    save({
      order,
      customer,
      phone,
      address,
      district,
      city,
      postalCode,
      pickupCode,
      ifoodLocalizer: ifoodLocalizer.trim() || undefined,
      platform: ifoodLocalizer.trim() || payment.includes("iFood") ? "ifood" : "other",
      notes,
      deliveryFee: Number(deliveryFee.replace(",", ".")) || 7.0,
      amount: Number(amount.replace(",", ".")) || 0,
      payment,
      driverId,
      latitude: geoCoords?.latitude || -17.535,
      longitude: geoCoords?.longitude || -39.74194,
    });
  }

  return (
    <div className="overlay">
      <div className="modal large">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">
              {prefill ? "Dados Extraídos da Foto" : "Novo Pedido"}
            </span>
            <h2>{prefill ? "Confirmar Dados da Comanda" : "Nova Entrega"}</h2>
            <p>Revise os campos essenciais antes de adicionar à rota.</p>
          </div>
          <button type="button" onClick={close}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "16px" }}>
          <div className="form-grid">
            <label>
              Número do Pedido
              <input value={order} onChange={(e) => setOrder(e.target.value)} required />
            </label>

            <label>
              Nome do Cliente
              <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Ex: Ayulla Nascimento" required />
            </label>

            <label>
              Telefone / WhatsApp
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(73) 99800-7040" required />
            </label>

            <label style={{ background: "rgba(34,197,94,.08)", borderRadius: "12px", padding: "6px 8px" }}>
              <span style={{ color: "#16a34a", fontWeight: "800" }}>★ Taxa do Motoboy (R$)</span>
              <input
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                placeholder="7,00"
                style={{ borderColor: "#16a34a", fontWeight: "800", fontSize: "16px", color: "#16a34a" }}
                required
              />
            </label>

            <label className="full">
              Endereço Completo (Rua e Nº)
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: R. Ametista, 35"
                required
              />
            </label>

            <label>
              Bairro
              <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Kaikan" required />
            </label>

            <label>
              Cidade
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Teixeira de Freitas" />
            </label>

            <label>
              CEP
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="45992-291" />
            </label>

            <label>
              Código de Coleta
              <input value={pickupCode} onChange={(e) => setPickupCode(e.target.value)} placeholder="Ex: 9102" />
            </label>

            <label>
              Localizador iFood (8 dígitos)
              <input value={ifoodLocalizer} onChange={(e) => setIfoodLocalizer(e.target.value)} placeholder="Ex: 84729103 (da comanda)" />
            </label>

            <label>
              Valor do Pedido (R$)
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="51,89" />
            </label>

            <label>
              Forma de Pagamento
              <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                <option value="Pago Online (iFood)">Pago Online (iFood)</option>
                <option value="Pix">Pix</option>
                <option value="Cartão">Cartão</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </label>

            <label className="full">
              Observações / Referência
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ref: Na rua do ateliê casa verde" />
            </label>

            <label className="full">
              Entregador Designado
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                {drivers.map((drv) => (
                  <option key={drv.id} value={drv.id}>
                    {drv.name} ({drv.vehicle})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="locate" style={{ marginTop: "12px" }}>
            <MapPin size={18} />
            <div style={{ flex: 1 }}>
              <b>Localização no Mapa</b>
              <span style={{ fontSize: "10px" }}>{geoStatus}</span>
            </div>
            <button type="button" disabled={locating} onClick={handleGeocode} style={{ padding: "6px 10px", fontSize: "11px" }}>
              {locating ? "Buscando…" : "Buscar no Mapa"}
            </button>
          </div>

          <div className="modal-actions" style={{ marginTop: "18px" }}>
            <button type="button" onClick={close}>
              Cancelar
            </button>
            <button type="submit" className="primary">
              <CheckCircle2 size={16} /> Salvar na Rota
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Modal Confirmação de Entrega Própria iFood
// -------------------------------------------------------------
function IfoodConfirmationModal({
  delivery,
  close,
  onConfirmSuccess,
}: {
  delivery: Delivery;
  close: () => void;
  onConfirmSuccess: (deliveryId: string, localizer: string) => void;
}) {
  const [localizer, setLocalizer] = useState(delivery.ifoodLocalizer || "");
  const [copied, setCopied] = useState(false);

  const cleanLocalizer = localizer.replace(/\D/g, "");

  const handleCopy = () => {
    if (!cleanLocalizer) return;
    void navigator.clipboard.writeText(cleanLocalizer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenIfood = () => {
    if (cleanLocalizer) {
      void navigator.clipboard.writeText(cleanLocalizer);
      setCopied(true);
    }
    window.open(
      "https://confirmacao-entrega-propria.ifood.com.br/",
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleFinish = () => {
    onConfirmSuccess(delivery.id, cleanLocalizer);
    close();
  };

  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: "450px", borderRadius: "24px", overflow: "hidden" }}>
        {/* Header Vermelho iFood Oficial */}
        <div
          style={{
            background: "linear-gradient(135deg, #ea1d2c, #be121e)",
            color: "#fff",
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "12px",
                background: "rgba(255,255,255,.22)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <ShieldCheck size={22} color="#fff" />
            </div>
            <div>
              <b style={{ fontSize: "16px", letterSpacing: "-.3px", display: "block" }}>
                Confirmação iFood
              </b>
              <span style={{ fontSize: "11px", opacity: 0.9 }}>
                Blindagem contra contestações e golpes
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            style={{
              background: "rgba(255,255,255,.2)",
              border: 0,
              color: "#fff",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: "18px 20px 22px" }}>
          {/* Card Resumo do Pedido */}
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: "14px",
              padding: "12px 14px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "4px",
              }}
            >
              <span style={{ fontSize: "10px", fontWeight: "800", color: "var(--muted)", textTransform: "uppercase" }}>
                Pedido da Loja
              </span>
              <span className="order-badge">{delivery.order}</span>
            </div>
            <b style={{ fontSize: "14px", display: "block", color: "var(--ink)" }}>
              {delivery.customer}
            </b>
            <span style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginTop: "2px" }}>
              <MapPin size={12} style={{ display: "inline", verticalAlign: "-2px", marginRight: "3px" }} />
              {delivery.address} {delivery.district ? `· ${delivery.district}` : ""}
            </span>
          </div>

          {/* Código Localizador */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label style={{ fontSize: "11px", fontWeight: "800", color: "var(--ink)" }}>
                CÓDIGO LOCALIZADOR (8 DÍGITOS)
              </label>
              {cleanLocalizer.length === 8 && (
                <span style={{ fontSize: "10px", color: "#16a34a", fontWeight: "700" }}>
                  ✔ 8 dígitos identificados
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={localizer}
                onChange={(e) => setLocalizer(e.target.value)}
                placeholder="Ex: 84729103"
                maxLength={14}
                style={{
                  flex: 1,
                  height: "46px",
                  borderRadius: "12px",
                  border: "2px solid var(--line)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  padding: "0 12px",
                  fontSize: "17px",
                  fontWeight: "800",
                  letterSpacing: "2px",
                  fontFamily: "monospace",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={handleCopy}
                disabled={!cleanLocalizer}
                style={{
                  height: "46px",
                  padding: "0 14px",
                  borderRadius: "12px",
                  border: "1px solid var(--line)",
                  background: copied ? "#16a34a" : "var(--surface-2)",
                  color: copied ? "#fff" : "var(--ink)",
                  fontSize: "12px",
                  fontWeight: "800",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                  transition: "all .16s ease",
                  flexShrink: 0,
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? "Copiado!" : "Copiar"}</span>
              </button>
            </div>
            <small style={{ fontSize: "10px", color: "var(--muted)", display: "block", marginTop: "5px" }}>
              Impresso na comanda física do iFood ou transmitido pelo sistema.
            </small>
          </div>

          {/* Guia Rápido de 3 Passos */}
          <div
            style={{
              background: "rgba(234,29,44,.05)",
              border: "1px dashed rgba(234,29,44,.28)",
              borderRadius: "14px",
              padding: "12px 14px",
              marginBottom: "18px",
            }}
          >
            <b
              style={{
                fontSize: "12px",
                color: "#ea1d2c",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "8px",
              }}
            >
              <Zap size={14} /> Passo a passo na entrega:
            </b>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px", color: "var(--ink)" }}>
              <div><b>1.</b> Copie o <b>código localizador</b> acima.</div>
              <div><b>2.</b> Peça ao cliente o <b>código de 4 dígitos</b> (ou 4 últimos dígitos do celular).</div>
              <div><b>3.</b> Abra o portal do iFood abaixo, cole o localizador e digite o código do cliente.</div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
            <button
              type="button"
              onClick={handleOpenIfood}
              style={{
                width: "100%",
                height: "46px",
                borderRadius: "14px",
                border: "0",
                background: "linear-gradient(135deg, #ea1d2c, #dc2626)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: "800",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: "pointer",
                boxShadow: "0 6px 18px rgba(234,29,44,.25)",
              }}
            >
              <ExternalLink size={16} />
              <span>Abrir Portal de Confirmação iFood ↗</span>
            </button>

            <button
              type="button"
              onClick={handleFinish}
              style={{
                width: "100%",
                height: "44px",
                borderRadius: "14px",
                border: "1px solid rgba(22,163,74,.3)",
                background: "rgba(22,163,74,.1)",
                color: "#16a34a",
                fontSize: "13px",
                fontWeight: "800",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                cursor: "pointer",
              }}
            >
              <ShieldCheck size={16} />
              <span>Concluir Entrega e Blindar Pedido</span>
            </button>

            <button
              type="button"
              onClick={close}
              style={{
                border: "0",
                background: "transparent",
                color: "var(--muted)",
                fontSize: "12px",
                fontWeight: "600",
                padding: "6px",
                cursor: "pointer",
              }}
            >
              Voltar sem alterar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Aba Financeira (Extrato Noite e Mês)
// -------------------------------------------------------------
function FinancialTab({
  deliveries,
  drivers,
  activeDriver,
  appMode,
  stats,
}: {
  deliveries: Delivery[];
  drivers: Driver[];
  activeDriver?: Driver;
  appMode: "motoboy" | "adm";
  stats: { nightTotal: number; nightCount: number; monthTotal: number; monthCount: number; avgFee: number };
}) {
  const completedList = useMemo(() => {
    return deliveries.filter((d) => {
      if (d.status !== "Entregue") return false;
      if (appMode === "motoboy" && activeDriver) {
        if (d.driverId !== activeDriver.id && d.driver !== activeDriver.name) return false;
      }
      return true;
    });
  }, [deliveries, appMode, activeDriver]);

  return (
    <div className="finance-screen-container">
      {/* Hero Balance Card */}
      <div className="finance-hero-balance-card">
        <div className="finance-hero-top">
          <div className="finance-hero-label">
            <Sparkles size={14} /> {appMode === "motoboy" ? `Ganhos Desta Noite (${activeDriver?.name?.split(" ")[0] || "Motoboy"})` : "Faturamento da Loja"}
          </div>
          <span className="finance-hero-badge">
            <CheckCircle2 size={11} /> Turno Ativo
          </span>
        </div>
        <div className="finance-hero-amount">{money(stats.nightTotal)}</div>
        <div className="finance-hero-sub">
          <span>{stats.nightCount} entrega(s) concluída(s) hoje</span>
          <span>•</span>
          <span>Média {money(stats.avgFee)}/entrega</span>
        </div>
      </div>

      {/* 2x2 Metrics Grid */}
      <div className="finance-metrics-grid">
        <div className="finance-metric-card highlight">
          <div className="finance-metric-kicker">
            <CircleDollarSign size={13} style={{ color: "var(--primary)" }} /> Acumulado do Mês
          </div>
          <div className="finance-metric-val">{money(stats.monthTotal)}</div>
          <div className="finance-metric-sub">{stats.monthCount} entregas no mês</div>
        </div>

        <div className="finance-metric-card success-tint">
          <div className="finance-metric-kicker">
            <Bike size={13} style={{ color: "var(--success)" }} /> Taxa Média
          </div>
          <div className="finance-metric-val">{money(stats.avgFee)}</div>
          <div className="finance-metric-sub">por corrida realizada</div>
        </div>
      </div>

      {/* Extrato / Histórico Recente */}
      <div className="finance-statement-section">
        <div className="finance-statement-header">
          <b>Extrato das Corridas</b>
          <span>{completedList.length} registro(s)</span>
        </div>

        {completedList.length === 0 ? (
          <div style={{ padding: "36px 16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "var(--surface-2)", color: "var(--muted)", display: "grid", placeItems: "center", margin: "0 auto 10px" }}>
              <CircleDollarSign size={24} />
            </div>
            <b style={{ color: "var(--ink)", display: "block", marginBottom: "4px" }}>Nenhum ganho registrado hoje</b>
            <span>Ao concluir pedidos na aba Entregas, o valor da taxa entra automaticamente neste extrato.</span>
          </div>
        ) : (
          <div className="finance-statement-list">
            {completedList.map((d) => (
              <div key={d.id} className="finance-statement-item">
                <div className="statement-item-left">
                  <div className="statement-item-icon">
                    <Check size={18} strokeWidth={3} />
                  </div>
                  <div className="statement-item-info">
                    <b>{d.order} • {d.customer}</b>
                    <span>{d.district ? `${d.district} · ` : ""}{d.time}</span>
                  </div>
                </div>
                <div className="statement-item-right">
                  <span className="statement-item-amount">+{money(d.deliveryFee)}</span>
                  <span className="statement-item-payment">{d.payment}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Aba ADM (Cadastro e Gestão de Motoboys)
// -------------------------------------------------------------
function AdminDriversTab({
  drivers,
  deliveries,
  onOpenAddDriver,
  onDeleteDriver,
  notify,
  takeatCreds,
  onSaveCreds,
  onClearCreds,
  takeatAutoSync,
  onToggleAutoSync,
  onAddSampleTakeat,
  onManualSync,
  isSyncing,
  isConnected,
}: {
  drivers: Driver[];
  deliveries: Delivery[];
  onOpenAddDriver: () => void;
  onDeleteDriver: (id: string) => void;
  notify: (s: string) => void;
  takeatCreds: TakeatCredentials;
  onSaveCreds: (creds: TakeatCredentials) => void;
  onClearCreds: () => void;
  takeatAutoSync: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
  onAddSampleTakeat: () => void;
  onManualSync: () => void;
  isSyncing: boolean;
  isConnected: boolean;
}) {
  const summaries = useMemo(() => {
    return getDriversEarningsSummary(drivers, deliveries);
  }, [drivers, deliveries]);

  const [authMethod, setAuthMethod] = useState<"credentials" | "apikey">(
    takeatCreds.authMethod || "credentials",
  );
  const [email, setEmail] = useState(takeatCreds.email || "");
  const [password, setPassword] = useState(takeatCreds.password || "");
  const [apiKey, setApiKey] = useState(takeatCreds.apiKey || "");
  const [showPassword, setShowPassword] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncingTakeatMotoboys, setSyncingTakeatMotoboys] = useState(false);

  const handleSyncTakeatMotoboys = async () => {
    setSyncingTakeatMotoboys(true);
    try {
      const updated = await syncTakeatMotoboysToRTDB();
      if (updated && updated.length) {
        notify(`✅ ${updated.length} motoboy(s) sincronizados com o Takeat!`);
      } else {
        notify("⚠️ Nenhum motoboy retornado do Takeat. Verifique a conexão.");
      }
    } catch {
      notify("Erro ao sincronizar motoboys do Takeat.");
    } finally {
      setSyncingTakeatMotoboys(false);
    }
  };

  const handleConnectWithCredentials = async () => {
    if (!email.trim() || !password.trim()) {
      notify("Informe o e-mail e a senha do gestor Takeat.");
      return;
    }
    setConnecting(true);
    try {
      const token = await loginTakeatWithPassword(email.trim(), password.trim());
      if (token) {
        onSaveCreds({
          authMethod: "credentials",
          email: email.trim(),
          password: password.trim(),
        });
        notify("✅ Conectado à Takeat com sucesso! Pedidos ativos no sistema.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao autenticar na Takeat";
      notify(`❌ ${msg}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleConnectWithApiKey = async () => {
    if (!apiKey.trim()) {
      notify("Informe a chave de API da Takeat.");
      return;
    }
    setConnecting(true);
    try {
      const token = await authenticateTakeat(apiKey.trim());
      if (token) {
        onSaveCreds({
          authMethod: "apikey",
          apiKey: apiKey.trim(),
        });
        notify("✅ Chave de API Takeat validada e salva no sistema!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha na validação da chave";
      notify(`❌ ${msg}`);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div>
      {/* Card Conexão Takeat (Login e Senha) */}
      <div className="takeat-settings-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "38px", height: "38px", borderRadius: "12px", background: "rgba(234,29,44,.12)", color: "#ea1d2c", display: "grid", placeItems: "center" }}>
              <Zap size={20} />
            </div>
            <div>
              <b style={{ fontSize: "14px", display: "block" }}>Conexão Takeat (Login e Senha)</b>
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                Conecte seu restaurante para importar pedidos Takeat & iFood em tempo real
              </span>
            </div>
          </div>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "11px",
              fontWeight: "800",
              padding: "4px 10px",
              borderRadius: "99px",
              background: isConnected ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.12)",
              color: isConnected ? "#10b981" : "#ef4444",
            }}
          >
            <span className={`sync-status-dot ${isConnected ? "online" : "offline"}`} style={{ width: "7px", height: "7px" }} />
            {isConnected ? "Conectado" : "Não conectado"}
          </span>
        </div>

        {/* Status se já estiver conectado */}
        {isConnected && (
          <div className="takeat-connected-box">
            <div>
              <span style={{ fontSize: "10px", color: "var(--muted)", display: "block" }}>SESSÃO SALVA DENTRO DO SISTEMA:</span>
              <b style={{ fontSize: "13px", color: "#10b981" }}>
                {takeatCreds.authMethod === "credentials" ? (takeatCreds.email || "Conectado por Login") : "Conectado por Chave de API"}
              </b>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={onManualSync}
                disabled={isSyncing}
                style={{ height: "32px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "11px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
              >
                <RefreshCw size={12} className={isSyncing ? "spin-animation" : ""} /> Sincronizar
              </button>
              <button
                type="button"
                onClick={onClearCreds}
                style={{ height: "32px", padding: "0 10px", borderRadius: "8px", border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.1)", color: "#ef4444", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
              >
                Desconectar
              </button>
            </div>
          </div>
        )}

        {/* Seletor de Método de Conexão */}
        <div className="takeat-tabs-selector">
          <button
            type="button"
            className={`takeat-tab-btn ${authMethod === "credentials" ? "active" : ""}`}
            onClick={() => setAuthMethod("credentials")}
          >
            👤 Conectar por Login e Senha (Recomendado)
          </button>
          <button
            type="button"
            className={`takeat-tab-btn ${authMethod === "apikey" ? "active" : ""}`}
            onClick={() => setAuthMethod("apikey")}
          >
            🔑 Conectar por Chave de API
          </button>
        </div>

        {/* Formulário: Login e Senha */}
        {authMethod === "credentials" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "700", marginBottom: "4px" }}>
                E-mail do Gestor Takeat
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex: seuemail@restaurante.com"
                style={{ width: "100%", height: "40px", borderRadius: "10px", border: "1px solid var(--line)", padding: "0 12px", fontSize: "12px", background: "var(--surface-2)" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "700", marginBottom: "4px" }}>
                Senha do Gestor Takeat
              </label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha da Takeat"
                  style={{ flex: 1, height: "40px", borderRadius: "10px", border: "1px solid var(--line)", padding: "0 12px", fontSize: "12px", background: "var(--surface-2)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ height: "40px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </div>

            <button
              type="button"
              className="primary"
              onClick={handleConnectWithCredentials}
              disabled={connecting}
              style={{ height: "42px", borderRadius: "10px", fontSize: "13px", fontWeight: "800", marginTop: "4px" }}
            >
              {connecting ? "Conectando à Takeat..." : "Conectar e Deixar Salvo no Sistema"}
            </button>
          </div>
        ) : (
          /* Formulário: Chave de API */
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: "700", marginBottom: "4px" }}>
                Chave de API Takeat (`tk_live_...` ou `tk_test_...`)
              </label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="tk_live_... ou tk_test_..."
                  style={{ flex: 1, height: "40px", borderRadius: "10px", border: "1px solid var(--line)", padding: "0 12px", fontSize: "12px", background: "var(--surface-2)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  style={{ height: "40px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface)", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
                >
                  {showApiKey ? "Ocultar" : "Ver"}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={handleConnectWithApiKey}
                  disabled={connecting}
                  style={{ height: "40px", padding: "0 14px", borderRadius: "10px", fontSize: "12px", fontWeight: "700" }}
                >
                  {connecting ? "Validando..." : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Barra de ações e Auto-sync */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "8px", borderTop: "1px solid var(--line)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
            <input
              type="checkbox"
              checked={takeatAutoSync}
              onChange={(e) => onToggleAutoSync(e.target.checked)}
              style={{ width: "16px", height: "16px", accentColor: "var(--primary)" }}
            />
            Auto-Sync em tempo real (20s)
          </label>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            <button
              type="button"
              onClick={onManualSync}
              disabled={isSyncing}
              style={{ height: "34px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: "11px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}
            >
              <RefreshCw size={13} className={isSyncing ? "spin-animation" : ""} />
              {isSyncing ? "Buscando..." : "Sincronizar"}
            </button>
            <button
              type="button"
              onClick={onAddSampleTakeat}
              style={{ height: "34px", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--line)", background: "var(--primary-soft)", color: "var(--primary)", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}
            >
              + Pedido Teste
            </button>
          </div>
        </div>

        {/* Resumo dos campos capturados */}
        <div style={{ background: "var(--surface-2)", borderRadius: "10px", padding: "10px", fontSize: "10.5px", color: "var(--muted)", lineHeight: "1.5" }}>
          <b style={{ color: "var(--ink)", display: "block", marginBottom: "4px" }}>Campos extraídos automaticamente em tempo real:</b>
          <div>✔ <b>Cliente & Telefone</b>: com links rápidos para ligar e chamar no WhatsApp</div>
          <div>✔ <b>Identificador iFood & Código de Coleta</b>: extraído da comanda/pedido Takeat</div>
          <div>✔ <b>Endereço Completo & GPS</b>: logradouro, número, bairro, cidade, CEP, complemento e latitude/longitude</div>
          <div>✔ <b>Taxa de Entrega & Valor Total</b>: soma automática na noite e mês do motoboy</div>
          <div>✔ <b>Itens do Pedido</b>: quantidade, nome do item, complementos e observações</div>
        </div>
      </div>

      {/* Gestão de Motoboys */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", marginTop: "18px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h2 style={{ fontSize: "20px", margin: "0 0 4px" }}>Equipe de Motoboys</h2>
          <p style={{ fontSize: "11px", color: "var(--muted)", margin: 0 }}>
            {drivers.length} entregador(es) cadastrado(s)
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleSyncTakeatMotoboys}
            disabled={syncingTakeatMotoboys}
            style={{
              height: "40px",
              fontSize: "12px",
              background: "rgba(124,58,237,.12)",
              color: "#7c3aed",
              border: "1px solid rgba(124,58,237,.25)",
              borderRadius: "10px",
              padding: "0 12px",
              fontWeight: "700",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: syncingTakeatMotoboys ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw size={14} className={syncingTakeatMotoboys ? "spin-animation" : ""} />
            {syncingTakeatMotoboys ? "Puxando..." : "Puxar Motoboys Takeat"}
          </button>
          <button type="button" className="primary" onClick={onOpenAddDriver} style={{ height: "40px", fontSize: "12px" }}>
            <Plus size={16} /> Cadastrar Motoboy
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {summaries.map((drv) => (
          <div key={drv.driverId} className="driver-admin-card">
            <div className="driver-admin-header">
              <div className="driver-avatar-circle">
                {drv.driverName.substring(0, 2).toUpperCase()}
              </div>
              <div className="driver-meta" style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <b>{drv.driverName}</b>
                  {drv.takeatId && (
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 800,
                        background: "rgba(234,29,44,.12)",
                        color: "#ea1d2c",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      Takeat #{drv.takeatId}
                    </span>
                  )}
                </div>
                <span>{drv.phone || "Sem telefone"} • {drv.vehicle}</span>
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block", marginTop: "2px" }}>
                  Login: <strong style={{ color: "var(--text)" }}>{drv.email ? drv.email.split("@")[0] : drv.driverName.toLowerCase()}</strong> • Senha: <code style={{ fontSize: "10px" }}>123456</code>
                </span>
              </div>
              <a
                href={`https://wa.me/55${drv.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action btn-whatsapp"
                style={{ width: "34px", height: "34px", padding: 0, borderRadius: "10px" }}
                title="WhatsApp do Motoboy"
              >
                <Phone size={15} />
              </a>
            </div>

            <div className="driver-earnings-pill">
              <div>
                <span style={{ color: "var(--muted)", display: "block" }}>Fez na Noite:</span>
                <b>{money(drv.nightTotal)}</b>
                <small style={{ color: "var(--muted)" }}>{drv.nightCount} entrega(s)</small>
              </div>
              <div>
                <span style={{ color: "var(--muted)", display: "block" }}>Fez no Mês:</span>
                <b>{money(drv.monthTotal)}</b>
                <small style={{ color: "var(--muted)" }}>{drv.monthCount} entrega(s)</small>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => onDeleteDriver(drv.driverId)}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "var(--danger)",
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={13} /> Remover motoboy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Modal Cadastrar Motoboy
// -------------------------------------------------------------
function NewDriverModal({
  close,
  save,
}: {
  close: () => void;
  save: (d: Omit<Driver, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("Honda Fan 160");
  const [plate, setPlate] = useState("");
  const [defaultFee, setDefaultFee] = useState("7.00");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    save({
      name,
      phone,
      vehicle,
      plate,
      defaultFee: Number(defaultFee.replace(",", ".")) || 7.0,
      active: true,
    });
  }

  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-head">
          <div>
            <span className="modal-kicker">Novo Cadastro</span>
            <h2>Cadastrar Motoboy</h2>
            <p>Adicione um entregador para receber corridas da loja.</p>
          </div>
          <button type="button" onClick={close}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "16px" }}>
          <div className="form-grid">
            <label className="full">
              Nome Completo
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Carlos Eduardo (Kaká)" required />
            </label>

            <label>
              WhatsApp / Telefone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(73) 99999-9999" required />
            </label>

            <label>
              Taxa Padrão (R$)
              <input value={defaultFee} onChange={(e) => setDefaultFee(e.target.value)} placeholder="7,00" required />
            </label>

            <label>
              Veículo (Moto/Modelo)
              <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Honda Fan 160" required />
            </label>

            <label>
              Placa da Moto
              <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC-1D23" />
            </label>
          </div>

          <div className="modal-actions" style={{ marginTop: "18px" }}>
            <button type="button" onClick={close}>
              Cancelar
            </button>
            <button type="submit" className="primary">
              <CheckCircle2 size={16} /> Salvar Motoboy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// COMPONENTE: Configuração da Loja
// -------------------------------------------------------------
function ConfigSection({
  notify,
  mapProvider,
  setMapProvider,
}: {
  notify: (s: string) => void;
  mapProvider: MapTileProvider;
  setMapProvider: (p: MapTileProvider) => void;
}) {
  const init = loadStore();
  const [name, setName] = useState(init.name);
  const [phone, setPhone] = useState(init.phone);
  const [address, setAddress] = useState(init.address);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      let lat = init.latitude;
      let lng = init.longitude;
      if (address.trim()) {
        const r = await geocode(address);
        if (r) {
          lat = r.latitude;
          lng = r.longitude;
        }
      }
      saveStore({ name, phone, address, latitude: lat, longitude: lng });
      notify("Dados da loja atualizados!");
    } catch {
      notify("Erro ao atualizar endereço da loja.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "18px", padding: "18px" }}>
      <h2 style={{ fontSize: "18px", margin: "0 0 4px" }}>Ponto de Partida da Loja</h2>
      <p style={{ fontSize: "11px", color: "var(--muted)", margin: "0 0 14px" }}>
        Endereço onde as motos saem para iniciar as rotas.
      </p>

      <div className="form-grid">
        <label className="full">
          Nome do Estabelecimento
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Telefone da Loja
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          Camada do Mapa Gratuito
          <select value={mapProvider} onChange={(e) => setMapProvider(e.target.value as MapTileProvider)}>
            {Object.entries(MAP_TILE_PROVIDERS).map(([id, p]) => (
              <option key={id} value={id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="full">
          Endereço Principal de Saída
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
      </div>

      <button type="button" className="primary" style={{ marginTop: "14px" }} disabled={saving} onClick={handleSave}>
        {saving ? "Salvando…" : "Salvar Configuração"}
      </button>
    </div>
  );
}

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------
function StatusBadge({ status }: { status: Status }) {
  return <span className={`status ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span>;
}

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
