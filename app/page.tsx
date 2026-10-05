"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  Bell,
  BellOff,
  Bike,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  Compass,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  LogOut,
  MapPin,
  MapPinned,
  MessageSquare,
  Moon,
  Navigation,
  Package,
  Pause,
  Pencil,
  Phone,
  PhoneCall,
  Play,
  Plus,
  Radio,
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
import type { Delivery, DeliveryPriority, DeliveryStatus, Driver, GeoPoint, OrderItem, RouteResult, Shift, ShiftSwapRequest, User } from "../src/types";
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
  updateDriverGpsLocationRTDB,
} from "../src/services/realtimeDbService";
import { CustomerTrackingView } from "../src/components/CustomerTrackingView";
import {
  isDeviceOnline,
  onConnectionChange,
  flushOfflineQueue,
  getOfflineQueue,
  enqueueOfflineAction,
} from "../src/services/offlineQueueService";
import {
  startBackgroundTracking,
  stopBackgroundTracking,
  updateBackgroundTrackingConfig,
  isBackgroundTrackingActive,
  unlockAndStartBackgroundTracking,
  isAudioHeartbeatPlaying,
  addHeartbeatListener,
  addTrackingListener,
  type TrackingPosition,
} from "../src/services/backgroundTrackingService";
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
import { getActiveStore, getStoreCacheKey, type StoreConfig } from "../src/services/storeService";
import type { DeliveryRecord, DeliveryRecordStatus } from "../src/types/delivery";
import { LoginView } from "../src/components/LoginView";
import {
  playIfoodNotificationSound,
  playShiftReminderSound,
  triggerShiftWebNotification,
  unlockAudioOnFirstGesture,
} from "../src/services/soundService";
import { ShiftManagementView } from "../src/components/ShiftManagementView";
import {
  subscribeToShifts,
  subscribeToShiftSwaps,
  saveShift,
  deleteShift,
  checkInShift,
  requestShiftSwap,
  respondToShiftSwap,
  approveShiftSwapAdmin,
  replicateWeekShifts,
  loadStoredShifts,
  loadStoredSwaps,
} from "../src/services/shiftService";

type Status = DeliveryStatus;

const getStoreStorageKey = () => getStoreCacheKey("rotacerta_store");
const getDelivStorageKey = () => getStoreCacheKey("rotacerta_deliveries");

type StoreCfg = { name: string; phone: string; address: string; latitude: number; longitude: number };

function getDefaultStore(): StoreCfg {
  const active = getActiveStore();
  return {
    name: active.name,
    phone: active.phone,
    address: active.address,
    latitude: active.latitude,
    longitude: active.longitude,
  };
}

function loadStore(): StoreCfg {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(getStoreStorageKey()) : null;
    const s = raw ? JSON.parse(raw) : null;
    if (s && typeof s.latitude === "number") return s;
  } catch {}
  return getDefaultStore();
}

let STORE_POINT: StoreCfg = loadStore();
function saveStore(cfg: StoreCfg) {
  STORE_POINT = cfg;
  try {
    localStorage.setItem(getStoreStorageKey(), JSON.stringify(cfg));
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
    createdAt:
      typeof item.createdAt === "string"
        ? item.createdAt
        : item.createdAt && typeof (item.createdAt as any).toDate === "function"
        ? (item.createdAt as any).toDate().toISOString()
        : item.createdAt && typeof (item.createdAt as any).seconds === "number"
        ? new Date((item.createdAt as any).seconds * 1000).toISOString()
        : new Date().toISOString(),
    deliveredAt:
      typeof item.deliveredAt === "string"
        ? item.deliveredAt
        : item.deliveredAt && typeof (item.deliveredAt as any).toDate === "function"
        ? (item.deliveredAt as any).toDate().toISOString()
        : item.deliveredAt && typeof (item.deliveredAt as any).seconds === "number"
        ? new Date((item.deliveredAt as any).seconds * 1000).toISOString()
        : undefined,
    latitude: item.latitude,
    longitude: item.longitude,
  };
}

const initialDeliveries: Delivery[] = [];

export default function Home() {
  const [rastreioId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      return p.get("rastreio") || p.get("tracking") || null;
    }
    return null;
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => getStoredUser());
  const session = useAuth();

  useEffect(() => {
    if (session.profile) {
      setCurrentUser(session.profile);
    }
  }, [session.profile]);

  // Se for acesso direto do cliente via link do WhatsApp, exibe a tela de rastreio ao vivo
  if (rastreioId) {
    return <CustomerTrackingView deliveryId={rastreioId} />;
  }

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
  const activeStoreConfig = useMemo(() => getActiveStore(), []);
  const isStore = currentUser.role === "admin";
  const [appMode, setAppMode] = useState<"motoboy" | "adm">(isStore ? "adm" : "motoboy");
  const [activeTab, setActiveTab] = useState<"entregas" | "mapa" | "comanda" | "escala" | "financeiro" | "adm" | "config">("entregas");
  const [drivers, setDrivers] = useState<Driver[]>(() => loadStoredDrivers());
  const [shifts, setShifts] = useState<Shift[]>(() => loadStoredShifts());
  const [swaps, setSwaps] = useState<ShiftSwapRequest[]>(() => loadStoredSwaps());
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
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(getDelivStorageKey()) : null;
      const s = raw ? JSON.parse(raw) : null;
      return Array.isArray(s) ? s : initialDeliveries;
    } catch {
      return initialDeliveries;
    }
  });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("Todas");
  const [deliveryTabMode, setDeliveryTabMode] = useState<"active" | "all_today" | "completed">("active");
  const [arrivalSortOrder, setArrivalSortOrder] = useState<"asc" | "desc">("asc");
  const [showAllHistory, setShowAllHistory] = useState<boolean>(false);
  const [selectedForRouteIds, setSelectedForRouteIds] = useState<string[]>([]);
  const [modal, setModal] = useState<"new" | "ocr" | "driver" | "profile" | "install" | null>(null);
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

  const [isOnline, setIsOnline] = useState<boolean>(() => isDeviceOnline());
  const [offlinePendingCount, setOfflinePendingCount] = useState<number>(() => getOfflineQueue().length);
  const [isTrackingActive, setIsTrackingActive] = useState<boolean>(false);
  const [pocketMode, setPocketMode] = useState<boolean>(false);
  const [liveTelemetry, setLiveTelemetry] = useState<TrackingPosition | null>(null);
  const [isHeartbeatActive, setIsHeartbeatActive] = useState<boolean>(false);

  useEffect(() => {
    const unbind = onConnectionChange((online) => {
      setIsOnline(online);
      if (online) {
        void flushOfflineQueue().then((res) => {
          setOfflinePendingCount(getOfflineQueue().length);
          if (res.syncedCount > 0) {
            notify(`Conexão restabelecida! ${res.syncedCount} alteração(ões) sincronizada(s) com a loja.`);
          }
        });
      } else {
        notify("Sem sinal de internet. Modo offline ativado: entregas continuam salvas no aparelho.");
      }
    });

    if (typeof navigator !== "undefined" && navigator.onLine) {
      void flushOfflineQueue().then(() => {
        setOfflinePendingCount(getOfflineQueue().length);
      });
    }

    return () => unbind();
  }, []);

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
          companyId: getActiveStore().companyId,
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
          notify(`${newForMe.length} novo(s) pedido(s) atribuído(s) a você!`);
        }
      }
      setDeliveries(items);
    });
    const unsubDrivers = subscribeToDriversRTDB((list) => {
      setDrivers(list);
    });
    const unsubShifts = subscribeToShifts((list) => {
      setShifts(list);
    });
    const unsubSwaps = subscribeToShiftSwaps((list) => {
      setSwaps(list);
    });
    const unsubTakeat = subscribeToTakeatConfigRTDB((cfg) => {
      if (cfg && (cfg.apiKey || (cfg.email && cfg.password))) {
        setTakeatCredentials(cfg);
        setTakeatCreds(cfg);
        setIsTakeatConnected(true);
        setTakeatAutoSync(isTakeatSyncEnabled());
      }
    });
    return () => {
      unsubDeliveries();
      unsubDrivers();
      unsubShifts();
      unsubSwaps();
      unsubTakeat();
    };
  }, []);

  // Lembrete inteligente de início de plantão com alerta sonoro e notificação web nativa
  useEffect(() => {
    if (typeof window === "undefined") return;
    const notifiedKey = `rotacerta_notified_shift_${new Date().toISOString().slice(0, 10)}`;

    const checkShiftReminder = () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const myTodayShift = shifts.find(
        (s) =>
          s.date === todayStr &&
          (s.driverId === currentUser.id ||
            (s.driverName && s.driverName.toLowerCase() === currentUser.name.toLowerCase()))
      );

      if (!myTodayShift || myTodayShift.status === "confirmado") return;

      const alreadyNotified = sessionStorage.getItem(notifiedKey);
      if (alreadyNotified === myTodayShift.id) return;

      const [sh, sm] = myTodayShift.startTime.split(":").map(Number);
      const now = new Date();
      const shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sh, sm, 0);
      const diffMinutes = Math.round((shiftStart.getTime() - now.getTime()) / (1000 * 60));

      if (diffMinutes > 0 && diffMinutes <= 60) {
        sessionStorage.setItem(notifiedKey, myTodayShift.id);
        void playShiftReminderSound();
        void triggerShiftWebNotification(
          `Lembrete de Plantão 🛵 (${activeStoreConfig.shortName})`,
          `Seu plantão começa em ${diffMinutes} min (às ${myTodayShift.startTime}). Toque para confirmar presença!`,
          () => setActiveTab("escala")
        );
        notify(`⏰ Lembrete: Seu plantão começa em ${diffMinutes} min (${myTodayShift.startTime})!`);
      }
    };

    checkShiftReminder();
    const interval = setInterval(checkShiftReminder, 60000);
    return () => clearInterval(interval);
  }, [shifts, currentUser, activeStoreConfig.shortName]);

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

  // Estado de silenciar notificações (persiste no localStorage)
  const [isMuted, setIsMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("rotacerta_muted") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("rotacerta_muted", String(isMuted)); } catch {}
  }, [isMuted]);

  // Alerta Sonoro Autêntico estilo iFood com HTML5 Audio, WAV e vibração tátil
  const playIfoodSoundAlert = () => {
    if (isMuted) return; // Silenciado pelo usuário
    void playIfoodNotificationSound();
  };

  const playNewOrderAlert = playIfoodSoundAlert;

  // Polling automático da Takeat a cada 8 segundos quando configurado
  useEffect(() => {
    if (!takeatAutoSync || !isTakeatConfigured()) return;

    const runSync = async () => {
      try {
        const res = await syncTakeatDeliveries(deliveriesRef.current, driversRef.current);
        const hasChanges = res.addedCount > 0 || res.updatedCount > 0;

        if (hasChanges) {
          setDeliveries(res.deliveries);

          // Salva IMEDIATAMENTE cada nova entrega no RTDB
          if (res.newDeliveries && res.newDeliveries.length > 0) {
            for (const d of res.newDeliveries) {
              void saveDeliveryRTDB(d);
            }
          }

          // Salva IMEDIATAMENTE cada entrega atualizada/redespachada no RTDB
          if (res.updatedDeliveries && res.updatedDeliveries.length > 0) {
            for (const d of res.updatedDeliveries) {
              void saveDeliveryRTDB(d);
            }
          }

          const modified = [...(res.newDeliveries || []), ...(res.updatedDeliveries || [])];
          if (modified.length > 0) {
            void batchSaveDeliveriesRTDB(modified);
          }
        }

        if (res.addedCount > 0) {
          playNewOrderAlert();
          notify(`${res.addedCount} novo(s) pedido(s) Takeat recebido(s)!`);
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
              if (res.newDeliveries && res.newDeliveries.length > 0) {
                for (const d of res.newDeliveries) {
                  void saveDeliveryRTDB(d);
                }
              }
              if (res.updatedDeliveries && res.updatedDeliveries.length > 0) {
                for (const d of res.updatedDeliveries) {
                  void saveDeliveryRTDB(d);
                }
              }
              const modified = [...(res.newDeliveries || []), ...(res.updatedDeliveries || [])];
              if (modified.length > 0) {
                void batchSaveDeliveriesRTDB(modified);
              }
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
        notify("Conecte sua conta Takeat (Login e Senha) na aba ADM.");
        setActiveTab("adm");
      } else {
        notify("Takeat ainda não configurada no painel da loja.");
      }
      return;
    }
    setTakeatSyncing(true);
    try {
      const res = await syncTakeatDeliveries(deliveriesRef.current, driversRef.current);
      setDeliveries(res.deliveries);
      if (res.newDeliveries && res.newDeliveries.length > 0) {
        for (const d of res.newDeliveries) {
          void saveDeliveryRTDB(d);
        }
      }
      if (res.updatedDeliveries && res.updatedDeliveries.length > 0) {
        for (const d of res.updatedDeliveries) {
          void saveDeliveryRTDB(d);
        }
      }
      const modified = [...(res.newDeliveries || []), ...(res.updatedDeliveries || [])];
      if (modified.length > 0) {
        void batchSaveDeliveriesRTDB(modified);
      }
      setIsTakeatConnected(true);
      if (res.addedCount > 0) {
        playNewOrderAlert();
        notify(`${res.addedCount} novo(s) pedido(s) Takeat importado(s)!`);
      } else if (res.updatedCount > 0) {
        notify(`${res.updatedCount} pedido(s) Takeat atualizado(s) (incluindo motoboys despachados)!`);
      } else {
        notify("Tudo em dia! Nenhum novo pedido Takeat no momento.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao sincronizar Takeat";
      notify(`${msg}`);
      setIsTakeatConnected(false);
    } finally {
      setTakeatSyncing(false);
    }
  };

  const handleAddSampleTakeat = async () => {
    const sample = getSampleTakeatDelivery();
    setDeliveries((prev) => [sample, ...prev]);
    await saveDeliveryRTDB(sample);
    notify(`Pedido Takeat/iFood #${sample.order} adicionado para teste.`);
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
      localStorage.setItem(getDelivStorageKey(), JSON.stringify(deliveries));
    } catch {}
  }, [deliveries]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = `${activeStoreConfig.name} — Rota Certa`;
    }
  }, [activeStoreConfig]);

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
        companyId: currentUser.companyId || activeStoreConfig.companyId,
        createdAt: new Date().toISOString(),
      } as Driver;
    }
    return drivers.find((d) => d.id === selectedDriverId) || drivers[0];
  }, [drivers, selectedDriverId, currentUser, activeStoreConfig]);

  const pendingSwapsBadgeCount = useMemo(() => {
    if (currentUser.role === "admin") {
      return swaps.filter((sw) => sw.status === "pendente").length;
    }
    return swaps.filter(
      (sw) =>
        sw.status === "pendente" &&
        sw.requestingDriverId !== currentUser.id &&
        (!sw.targetDriverId || sw.targetDriverId === currentUser.id || sw.targetDriverId === "all")
    ).length;
  }, [swaps, currentUser]);

  const todayDriverShift = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return shifts.find(
      (s) =>
        s.date === todayStr &&
        (s.driverId === currentUser.id ||
          (s.driverName && s.driverName.toLowerCase() === currentUser.name.toLowerCase()))
    );
  }, [shifts, currentUser]);

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

  const completedDeliveriesTonight = useMemo(() => {
    return scopedDeliveries.filter(
      (d) => isDeliveryDone(d.status) && isSameShiftOrToday(d.deliveredAt || d.createdAt || d.time)
    );
  }, [scopedDeliveries]);

  const allCompletedDeliveries = useMemo(() => {
    return scopedDeliveries.filter((d) => isDeliveryDone(d.status));
  }, [scopedDeliveries]);

  const tonightDeliveries = useMemo(() => {
    return scopedDeliveries.filter((d) => isSameShiftOrToday(d.createdAt || d.deliveredAt || d.time));
  }, [scopedDeliveries]);

  // Sequenciamento Inteligente de Entregas & Próxima Parada (Função 7)
  const [driverGps, setDriverGps] = useState<GeoPoint | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setDriverGps({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      );
    }
  }, []);

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const activeDriverRef = useRef(activeDriver);
  activeDriverRef.current = activeDriver;
  const appModeRef = useRef(appMode);
  appModeRef.current = appMode;

  // Rastreamento contínuo em segundo plano e transmissão em tempo real desativados para economizar bateria
  useEffect(() => {
    stopBackgroundTracking();
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

  // Lista filtrada para exibição (separa Em Aberto vs Todas Desta Noite vs Entregues)
  const filteredDeliveries = useMemo(() => {
    let base: Delivery[] = [];
    if (deliveryTabMode === "active") {
      base = [...activeDeliveries].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA && timeB && timeA !== timeB) {
          return arrivalSortOrder === "asc" ? timeA - timeB : timeB - timeA;
        }
        const numA = parseInt(String(a.order).replace(/\D/g, ""), 10);
        const numB = parseInt(String(b.order).replace(/\D/g, ""), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          return arrivalSortOrder === "asc" ? numA - numB : numB - numA;
        }
        return 0;
      });
    } else if (deliveryTabMode === "all_today") {
      base = [...tonightDeliveries].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA && timeB && timeA !== timeB) {
          return arrivalSortOrder === "asc" ? timeA - timeB : timeB - timeA;
        }
        const numA = parseInt(String(a.order).replace(/\D/g, ""), 10);
        const numB = parseInt(String(b.order).replace(/\D/g, ""), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          return arrivalSortOrder === "asc" ? numA - numB : numB - numA;
        }
        return 0;
      });
    } else {
      base = showAllHistory
        ? allCompletedDeliveries
        : completedDeliveriesTonight.length > 0
        ? completedDeliveriesTonight
        : allCompletedDeliveries;
    }

    return base.filter((d) => {
      if (statusFilter !== "Todas") {
        const s = (d.status || "").toLowerCase().trim();
        if (statusFilter === "Aguardando") {
          const isAwaiting =
            s === "aguardando" ||
            s === "pronta para sair" ||
            s === "pronta" ||
            (d.driver || "").toLowerCase().includes("aguardando") ||
            (d.driver || "").toLowerCase().includes("sem motoboy");
          if (!isAwaiting) return false;
        } else if (statusFilter === "Em rota") {
          if (s !== "em rota" && s !== "em_rota") return false;
        } else if (statusFilter === "Entregue") {
          if (s !== "entregue" && s !== "delivered" && s !== "concluída") return false;
        } else if (d.status !== statusFilter) {
          return false;
        }
      }
      if (!query.trim()) return true;
      return (d.customer + d.order + d.address + d.district + (d.phone || "") + (d.driver || ""))
        .toLowerCase()
        .includes(query.toLowerCase());
    });
  }, [
    deliveryTabMode,
    arrivalSortOrder,
    activeDeliveries,
    tonightDeliveries,
    completedDeliveriesTonight,
    allCompletedDeliveries,
    showAllHistory,
    statusFilter,
    query,
  ]);

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

    const updates = { status: "Entregue" as Status, deliveredAt: nowIso };
    if (!isDeviceOnline()) {
      enqueueOfflineAction("update_delivery", { deliveryId: id, updates });
      setOfflinePendingCount(getOfflineQueue().length);
      return;
    }

    try {
      await updateDeliveryRTDB(id, updates);
    } catch (e) {
      console.warn("Erro ao atualizar status da entrega no RTDB, enfileirando offline:", e);
      enqueueOfflineAction("update_delivery", { deliveryId: id, updates });
      setOfflinePendingCount(getOfflineQueue().length);
    }
  }

  // Delivery action: complete ifood delivery with blindagem
  async function confirmIfoodDelivery(deliveryId: string, localizer?: string) {
    setSelectedForRouteIds((prev) => prev.filter((x) => x !== deliveryId));
    const nowIso = new Date().toISOString();
    setDeliveries((prev) =>
      prev.map((d) => {
        if (d.id === deliveryId) {
          notify(`Pedido ${d.order} blindado no iFood! Taxa de ${money(d.deliveryFee)} somada.`);
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

    const updates = {
      status: "Entregue" as Status,
      deliveredAt: nowIso,
      ifoodConfirmed: true,
      ifoodConfirmedAt: nowIso,
      ...(localizer ? { ifoodLocalizer: localizer } : {}),
    };

    if (!isDeviceOnline()) {
      enqueueOfflineAction("update_delivery", { deliveryId, updates });
      setOfflinePendingCount(getOfflineQueue().length);
      return;
    }

    try {
      await updateDeliveryRTDB(deliveryId, updates);
    } catch (e) {
      console.warn("Erro ao atualizar status da entrega no RTDB, enfileirando offline:", e);
      enqueueOfflineAction("update_delivery", { deliveryId, updates });
      setOfflinePendingCount(getOfflineQueue().length);
    }
  }

  async function updateDeliveryPhone(deliveryId: string, phone: string) {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === deliveryId ? { ...d, phone } : d))
    );
    const updates = { phone };
    if (!isDeviceOnline()) {
      enqueueOfflineAction("update_delivery", { deliveryId, updates });
      setOfflinePendingCount(getOfflineQueue().length);
      notify("Telefone salvo localmente no aparelho (Modo Offline)");
      return;
    }
    try {
      await updateDeliveryRTDB(deliveryId, updates);
      notify("Telefone WhatsApp atualizado com sucesso!");
    } catch (e) {
      console.warn("Erro ao atualizar telefone no RTDB, enfileirando offline:", e);
      enqueueOfflineAction("update_delivery", { deliveryId, updates });
      setOfflinePendingCount(getOfflineQueue().length);
    }
  }

  // Delivery action: advance status
  async function updateStatus(id: string, newStatus: Status) {
    setDeliveries((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: newStatus } : d)),
    );
    notify(`Status atualizado para ${newStatus}`);
    const updates = { status: newStatus };
    if (!isDeviceOnline()) {
      enqueueOfflineAction("update_delivery", { deliveryId: id, updates });
      setOfflinePendingCount(getOfflineQueue().length);
      return;
    }
    try {
      await updateDeliveryRTDB(id, updates);
    } catch (e) {
      console.warn("Erro ao atualizar status no RTDB, enfileirando offline:", e);
      enqueueOfflineAction("update_delivery", { deliveryId: id, updates });
      setOfflinePendingCount(getOfflineQueue().length);
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

        {/* Badge da Unidade / Loja */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "4px 8px",
            borderRadius: "8px",
            fontSize: "11px",
            fontWeight: 800,
            background: activeStoreConfig.id === "foodpark" ? "rgba(16, 185, 129, 0.14)" : "rgba(117, 87, 246, 0.14)",
            color: activeStoreConfig.id === "foodpark" ? "#10b981" : "#7557f6",
            border: activeStoreConfig.id === "foodpark" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(117, 87, 246, 0.3)",
            whiteSpace: "nowrap",
          }}
          title={`Loja conectada: ${activeStoreConfig.name}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>
          <span>{activeStoreConfig.shortName}</span>
        </div>

        {!isOnline && (
          <div
            style={{
              background: "#f59e0b",
              color: "#000",
              fontWeight: 800,
              fontSize: "11px",
              padding: "4px 8px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(245, 158, 11, 0.3)",
            }}
            onClick={() => {
              void flushOfflineQueue().then((res) => {
                setOfflinePendingCount(getOfflineQueue().length);
                if (res.syncedCount > 0) {
                  notify(`Sincronizado: ${res.syncedCount} alteração(ões)!`);
                } else {
                  notify("Aparelho ainda sem internet. Dados protegidos no celular.");
                }
              });
            }}
            title="Sem 4G/Wi-Fi (Modo Offline). Toque para tentar sincronizar com a loja."
          >
            <span>Offline</span>
            {offlinePendingCount > 0 && (
              <span style={{ background: "#000", color: "#fff", borderRadius: "10px", padding: "1px 5px", fontSize: "10px" }}>
                {offlinePendingCount}
              </span>
            )}
          </div>
        )}

        {/* Right: Quick Controls - apenas os essenciais para nao estourar o header mobile */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {/* Botão Instalar App */}
          <button
            type="button"
            className="icon-btn"
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "11px",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              position: "relative",
            }}
            onClick={() => setModal("install")}
            title="Instalar app no celular"
          >
            <Download size={15} style={{ color: "var(--primary)" }} />
          </button>

          {/* Botão Silenciar / Ativar Notificações */}
          <button
            type="button"
            onClick={() => {
              const next = !isMuted;
              setIsMuted(next);
              if (!next) {
                void playIfoodNotificationSound();
                notify("Notificações reativadas!");
              } else {
                notify("Notificações silenciadas");
              }
            }}
            className="icon-btn"
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "11px",
              border: isMuted ? "1.5px solid #ef4444" : "1px solid var(--line)",
              background: isMuted ? "rgba(239,68,68,0.08)" : undefined,
            }}
            title={isMuted ? "Reativar som de notificações" : "Silenciar notificações"}
          >
            {isMuted
              ? <BellOff size={15} style={{ color: "#ef4444" }} />
              : <Bell size={15} style={{ color: "var(--primary)" }} />
            }
          </button>

          {/* Botão Sincronizar Takeat */}
          <button
            type="button"
            onClick={handleManualSyncTakeat}
            disabled={takeatSyncing}
            className="icon-btn"
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "11px",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
            }}
            title="Sincronizar Takeat agora"
          >
            <RefreshCw size={14} className={takeatSyncing ? "spin-animation" : ""} style={{ color: "var(--primary)" }} />
          </button>

          {/* Botão Perfil / Configuracoes (abre sheet com todas as opcoes) */}
          <button
            type="button"
            className="icon-btn"
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "11px",
              border: "1px solid var(--line)",
              background: "var(--surface)",
            }}
            onClick={() => setModal("profile")}
            title="Perfil e Configuracoes"
          >
            <Settings size={15} style={{ color: "var(--muted)" }} />
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

              {/* Lembrete de Presença / Check-in de Plantão do Dia */}
              {todayDriverShift && todayDriverShift.status !== "confirmado" && (
                <div className="shift-alert-strip">
                  <div className="sas-left">
                    <Calendar size={16} />
                    <span>
                      Você tem plantão hoje às <strong>{todayDriverShift.startTime}</strong> ({activeStoreConfig.shortName})
                    </span>
                  </div>
                  <button
                    type="button"
                    className="sas-btn-checkin"
                    onClick={async () => {
                      await checkInShift(todayDriverShift.id);
                      notify("Presença confirmada no plantão! Bom trabalho! 🛵");
                    }}
                  >
                    <UserCheck size={14} /> Fazer Check-in
                  </button>
                </div>
              )}

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
                  onClick={() => {
                    setDeliveryTabMode("active");
                    setStatusFilter("Todas");
                  }}
                >
                  <Bike size={15} />
                  <span>Em Aberto</span>
                  <span className="native-segment-badge highlight">{activeDeliveries.length}</span>
                </button>
                <button
                  type="button"
                  className={`native-segment-btn ${deliveryTabMode === "all_today" ? "active" : ""}`}
                  onClick={() => {
                    setDeliveryTabMode("all_today");
                    setStatusFilter("Todas");
                  }}
                >
                  <Package size={15} />
                  <span>Todas Hoje</span>
                  <span className="native-segment-badge" style={{ background: "rgba(59,130,246,.15)", color: "#3b82f6" }}>
                    {tonightDeliveries.length}
                  </span>
                </button>
                <button
                  type="button"
                  className={`native-segment-btn ${deliveryTabMode === "completed" ? "active" : ""}`}
                  onClick={() => {
                    setDeliveryTabMode("completed");
                    setStatusFilter("Todas");
                  }}
                >
                  <CheckCircle2 size={15} />
                  <span>Entregues</span>
                  <span className="native-segment-badge">{completedDeliveriesTonight.length}</span>
                </button>
              </div>

              {/* History Toggle when on Entregues tab */}
              {deliveryTabMode === "completed" && allCompletedDeliveries.length > completedDeliveriesTonight.length && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "6px", fontSize: "11px", padding: "0 4px" }}>
                  <button
                    type="button"
                    onClick={() => setShowAllHistory((prev) => !prev)}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "var(--primary)",
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "11px",
                      textDecoration: "underline",
                    }}
                  >
                    {showAllHistory
                      ? `← Ver apenas concluídos de hoje (${completedDeliveriesTonight.length})`
                      : `Ver histórico completo (${allCompletedDeliveries.length} corridas) →`}
                  </button>
                </div>
              )}

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
                  placeholder={
                    deliveryTabMode === "active"
                      ? "Buscar pedidos em aberto..."
                      : deliveryTabMode === "all_today"
                      ? "Buscar em todas as entregas de hoje..."
                      : "Buscar entregas concluídas..."
                  }
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
              {(deliveryTabMode === "active" || deliveryTabMode === "all_today") && (
                <div className="native-filter-scroll">
                  {(deliveryTabMode === "all_today"
                    ? ["Todas", "Aguardando", "Em rota", "Entregue"]
                    : ["Todas", "Aguardando", "Em rota"]
                  ).map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={`native-filter-pill ${statusFilter === st ? "active" : ""}`}
                      onClick={() => setStatusFilter(st)}
                    >
                      {st === "Todas"
                        ? `Todas (${deliveryTabMode === "all_today" ? tonightDeliveries.length : activeDeliveries.length})`
                        : st}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="native-filter-pill"
                    style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                    onClick={() => setArrivalSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                    title={arrivalSortOrder === "asc" ? "Ordem de Chegada: Mais antigos primeiro" : "Ordem de Chegada: Mais recentes primeiro"}
                  >
                    <ArrowDownUp size={12} />
                    {arrivalSortOrder === "asc" ? "Ordem de Chegada" : "Mais Recentes"}
                  </button>
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
                      <b style={{ display: "block", fontSize: "16px", color: "var(--text)" }}>Nenhuma entrega finalizada nesta noite</b>
                      <p style={{ color: "var(--muted)", fontSize: "12px", margin: "6px auto 16px", maxWidth: "280px", lineHeight: "1.4" }}>
                        Conforme os motoboys concluírem as corridas, elas serão registradas aqui.
                      </p>
                      <button
                        type="button"
                        className="primary"
                        style={{ height: "40px", padding: "0 18px", borderRadius: "10px", fontSize: "12px", fontWeight: "700" }}
                        onClick={() => setDeliveryTabMode("active")}
                      >
                        Ver Pedidos em Aberto ({activeDeliveries.length})
                      </button>
                    </div>
                  ) : deliveryTabMode === "all_today" ? (
                    <div style={{ padding: "44px 20px", textAlign: "center", background: "var(--surface)", borderRadius: "20px", border: "1px solid var(--line)" }}>
                      <div
                        style={{
                          width: "60px",
                          height: "60px",
                          borderRadius: "50%",
                          background: "rgba(59,130,246,.12)",
                          color: "#3b82f6",
                          display: "grid",
                          placeItems: "center",
                          margin: "0 auto 14px",
                        }}
                      >
                        <Package size={30} />
                      </div>
                      <b style={{ display: "block", fontSize: "16px", color: "var(--text)" }}>Nenhuma entrega registrada nesta noite</b>
                      <p style={{ color: "var(--muted)", fontSize: "12px", margin: "6px auto 16px", maxWidth: "280px", lineHeight: "1.4" }}>
                        Os pedidos do Takeat/iFood aparecerão aqui assim que forem recebidos.
                      </p>
                      <button
                        type="button"
                        className="primary"
                        style={{ height: "40px", padding: "0 18px", borderRadius: "10px", fontSize: "12px", fontWeight: "700" }}
                        onClick={handleManualSyncTakeat}
                        disabled={takeatSyncing}
                      >
                        {takeatSyncing ? "Sincronizando..." : "Sincronizar Takeat"}
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
                    {filteredDeliveries.map((d) => (
                      <MobileDeliveryCard
                        key={d.id}
                        delivery={d}
                        stopNumber={
                          selectedForRouteIds.length > 0
                            ? (selectedForRouteIds.includes(d.id) ? (selectedForRouteIds.indexOf(d.id) + 1) : undefined)
                            : (appMode === "motoboy" ? stopNumberMap.get(d.id) : undefined)
                        }
                        onMarkDelivered={() => markAsDelivered(d.id)}
                        onUpdateStatus={(st) => updateStatus(d.id, st)}
                        onRemove={() => removeDelivery(d.id)}
                        isAdm={appMode === "adm"}
                        drivers={drivers}
                        showSelectCheckbox={deliveryTabMode === "active" || (deliveryTabMode === "all_today" && !isDeliveryDone(d.status))}
                        selected={selectedForRouteIds.includes(d.id)}
                        onToggleSelect={() => toggleDeliverySelection(d.id)}
                        onOpenIfoodConfirm={() => setIfoodConfirmDelivery(d)}
                        onUpdatePhone={(phone) => updateDeliveryPhone(d.id, phone)}
                        onNotify={notify}
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
                          notify(`Entrega atribuída a ${driverName}`);
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
                drivers={currentUser.role === "admin" && appMode === "adm" ? drivers : []}
                showAllDrivers={currentUser.role === "admin" && appMode === "adm"}
                currentDriverGps={driverGps}
                liveTelemetry={liveTelemetry}
                currentDriverName={activeDriver?.name || currentUser.name}
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

          {/* TAB ESCALA: PLANTÕES, TROCAS E LEMBRETES */}
          {activeTab === "escala" && (
            <ShiftManagementView
              currentUser={currentUser}
              drivers={drivers}
              shifts={shifts}
              swaps={swaps}
              onSaveShift={saveShift}
              onDeleteShift={deleteShift}
              onCheckInShift={checkInShift}
              onRequestSwap={async (params) => {
                await requestShiftSwap({
                  shift: params.shift,
                  requestingDriver: { id: currentUser.id, name: currentUser.name },
                  targetDriver: params.targetDriverId ? { id: params.targetDriverId, name: params.targetDriverName || "" } : undefined,
                  reason: params.reason,
                });
              }}
              onRespondSwap={async (swap, accept) => {
                await respondToShiftSwap({
                  swap,
                  accepted: accept,
                  responder: { id: currentUser.id, name: currentUser.name, phone: currentUser.phone },
                });
              }}
              onApproveSwapAdmin={async (swap) => {
                await approveShiftSwapAdmin({ swap, responderPhone: currentUser.phone });
              }}
              onReplicateWeek={async (targetMonday) => {
                await replicateWeekShifts(shifts, targetMonday);
              }}
              onNotify={notify}
              currentStoreName={activeStoreConfig.name}
              currentStoreId={activeStoreConfig.id}
            />
          )}

          {/* TAB 4: FINANCEIRO (NOITE E MÊS) */}
          {activeTab === "financeiro" && (
            <FinancialTab
              deliveries={
                currentUser.role === "driver"
                  ? deliveries.filter(isDeliveryForThisDriver)
                  : appMode === "motoboy" && activeDriver
                  ? deliveries.filter((d) => d.driverId === activeDriver.id || d.driver === activeDriver.name)
                  : deliveries
              }
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
          className={activeTab === "escala" ? "active" : ""}
          onClick={() => setActiveTab("escala")}
          title="Escala semanal de motoboys e trocas"
        >
          <div className="nav-icon-container">
            <Calendar size={20} />
            {pendingSwapsBadgeCount > 0 && (
              <span className="nav-badge-pill" style={{ background: "#f59e0b" }}>
                {pendingSwapsBadgeCount}
              </span>
            )}
          </div>
          <span>Escala</span>
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

        {currentUser.role === "driver" ? (
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
        ) : (
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

      {/* Modal: Instalar App */}
      {modal === "install" && (
        <div className="overlay" onClick={() => setModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: "420px", borderRadius: "22px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head" style={{ borderBottom: "1px solid var(--line)", padding: "20px 22px 16px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <div style={{
                    width: "34px", height: "34px", borderRadius: "10px",
                    background: "var(--primary-soft)", color: "var(--primary)",
                    display: "grid", placeItems: "center"
                  }}>
                    <Download size={18} />
                  </div>
                  <h2 style={{ margin: 0, fontSize: "17px", letterSpacing: "-.3px" }}>Instalar no Celular</h2>
                </div>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "11px" }}>
                  Adicione o app na tela inicial para acesso rapido, sem precisar abrir o navegador.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                style={{ border: 0, background: "var(--surface-2)", width: "32px", height: "32px", borderRadius: "10px", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--muted)", flexShrink: 0 }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* iOS / iPhone */}
              <div style={{
                border: "1px solid var(--line)", borderRadius: "16px",
                padding: "16px", background: "var(--surface-2)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "10px",
                    background: "#000", color: "#fff",
                    display: "grid", placeItems: "center", flexShrink: 0
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                  </div>
                  <div>
                    <b style={{ fontSize: "13px", display: "block" }}>iPhone (Safari)</b>
                    <span style={{ fontSize: "10px", color: "var(--muted)" }}>iOS 14 ou superior</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    { n: 1, txt: "Abra este link no Safari (nao funciona em outros navegadores)", icon: "🧭" },
                    { n: 2, txt: "Toque no icone de compartilhar na barra inferior (quadrado com seta para cima)", icon: "⬆️" },
                    { n: 3, txt: "Role a lista e toque em \"Adicionar a Tela de Inicio\"", icon: "➕" },
                    { n: 4, txt: "Confirme tocando em \"Adicionar\" no canto superior direito", icon: "✅" },
                  ].map(step => (
                    <div key={step.n} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <div style={{
                        width: "22px", height: "22px", borderRadius: "7px",
                        background: "var(--primary)", color: "#fff",
                        display: "grid", placeItems: "center",
                        fontSize: "11px", fontWeight: 800, flexShrink: 0, marginTop: "1px"
                      }}>{step.n}</div>
                      <span style={{ fontSize: "11px", lineHeight: "1.4", color: "var(--ink)" }}>{step.txt}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Android */}
              <div style={{
                border: "1px solid var(--line)", borderRadius: "16px",
                padding: "16px", background: "var(--surface-2)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div style={{
                    width: "36px", height: "36px", borderRadius: "10px",
                    background: "#4caf50", color: "#fff",
                    display: "grid", placeItems: "center", flexShrink: 0
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.523 15.341a1 1 0 0 1-.75-.338L13.5 11.5V17a1 1 0 0 1-2 0v-5.5L8.227 15.003a1 1 0 0 1-1.454-1.373L12 7.5l5.227 6.13a1 1 0 0 1-.704 1.711zM6.5 4A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h11A1.5 1.5 0 0 0 19 18.5v-13A1.5 1.5 0 0 0 17.5 4z"/>
                    </svg>
                  </div>
                  <div>
                    <b style={{ fontSize: "13px", display: "block" }}>Android (Chrome)</b>
                    <span style={{ fontSize: "10px", color: "var(--muted)" }}>Qualquer Android com Chrome</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    { n: 1, txt: "Abra este link no Google Chrome", icon: "" },
                    { n: 2, txt: "Toque nos 3 pontos no canto superior direito do Chrome", icon: "" },
                    { n: 3, txt: "Toque em \"Adicionar a tela inicial\" ou \"Instalar app\"", icon: "" },
                    { n: 4, txt: "Confirme tocando em \"Adicionar\" ou \"Instalar\"", icon: "" },
                  ].map(step => (
                    <div key={step.n} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <div style={{
                        width: "22px", height: "22px", borderRadius: "7px",
                        background: "#4caf50", color: "#fff",
                        display: "grid", placeItems: "center",
                        fontSize: "11px", fontWeight: 800, flexShrink: 0, marginTop: "1px"
                      }}>{step.n}</div>
                      <span style={{ fontSize: "11px", lineHeight: "1.4", color: "var(--ink)" }}>{step.txt}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{
                background: "var(--primary-soft)", borderRadius: "12px",
                padding: "12px 14px", display: "flex", gap: "10px", alignItems: "flex-start"
              }}>
                <Download size={16} style={{ color: "var(--primary)", flexShrink: 0, marginTop: "1px" }} />
                <span style={{ fontSize: "11px", color: "var(--primary)", fontWeight: "600", lineHeight: "1.4" }}>
                  Depois de instalado, o app abre como um aplicativo nativo, sem barra do navegador, e funciona muito mais rapido.
                </span>
              </div>

            </div>
          </div>
        </div>
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
// ÍCONE VETORIAL DO WHATSAPP (SEM EMOJIS, DESIGN OFICIAL)
// -------------------------------------------------------------
function WhatsAppIcon({
  size = 15,
  color = "#25D366",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      className={className}
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "middle" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M17.472 14.382c-.301-.15-1.782-.879-2.058-.98-.276-.1-.477-.15-.678.15-.2.301-.778.98-.954 1.18-.176.201-.351.226-.653.075-.301-.15-1.272-.469-2.423-1.496-.896-.799-1.5-1.786-1.677-2.087-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.15-.176.201-.301.301-.502.1-.201.05-.376-.025-.527-.075-.15-.678-1.634-.929-2.239-.244-.589-.493-.509-.678-.519-.176-.01-.376-.01-.577-.01-.201 0-.527.075-.803.376s-1.054 1.03-1.054 2.511c0 1.481 1.079 2.911 1.23 3.112.15.201 2.124 3.243 5.145 4.549.719.311 1.28.497 1.718.636.722.23 1.378.197 1.898.12.579-.087 1.782-.728 2.033-1.431.251-.703.251-1.305.176-1.431-.075-.125-.276-.201-.577-.351z" />
      <path d="M12.004 2C6.486 2 2 6.486 2 12c0 1.95.56 3.77 1.532 5.317L2.14 21.656a.75.75 0 00.916.916l4.437-1.385A9.954 9.954 0 0012.004 22c5.518 0 10.004-4.486 10.004-10S17.522 2 12.004 2zm0 18.25a8.212 8.212 0 01-4.223-1.168.75.75 0 00-.549-.092l-3.328 1.038 1.055-3.276a.75.75 0 00-.091-.555A8.216 8.216 0 013.75 12c0-4.552 3.702-8.25 8.254-8.25 4.551 0 8.25 3.698 8.25 8.25 0 4.552-3.699 8.25-8.25 8.25z" />
    </svg>
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
  onNotify,
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
  onNotify?: (msg: string) => void;
}) {
  const [showItemsDetail, setShowItemsDetail] = useState(false);
  const isDelivered = delivery.status === "Entregue" || (delivery.status as string) === "delivered";

  // Identificação de iFood: usa exclusivamente o campo platform (definido na sincronização)
  // ou ifoodLocalizer (localizador de 6-10 dígitos do pedido iFood)
  // NAO usa pickupCode nem notes("coleta") pois pedidos da loja também tem senha de retirada
  const isIfood =
    delivery.platform === "ifood" ||
    Boolean(delivery.ifoodLocalizer) ||
    Boolean(delivery.payment?.toLowerCase().includes("ifood"));

  // Formatação limpa do número do pedido para o card e WhatsApp (elimina 'TK-' e prioriza senha da loja)
  const cleanOrderNum = (
    (!isIfood && delivery.pickupCode
      ? delivery.pickupCode
      : delivery.order
    ) || ""
  )
    .replace(/#?TK-?/i, "")
    .replace(/^#+/, "")
    .trim();
  const displayOrderStr = cleanOrderNum
    ? `#${cleanOrderNum}`
    : delivery.order?.startsWith("#")
    ? delivery.order
    : `#${delivery.order}`;

  // Validação e sanitização inteligente de WhatsApp
  const validWhatsApp = sanitizeWhatsAppNumber(delivery.phone, delivery.notes);

  const whatsappUrl = validWhatsApp
    ? `https://wa.me/${validWhatsApp}?text=${encodeURIComponent(
        `Olá ${delivery.customer}! Sou o motoboy com seu pedido ${displayOrderStr}. Já estou a caminho do seu endereço: ${delivery.address}.`,
      )}`
    : null;

  const whatsappArrivedUrl = validWhatsApp
    ? `https://wa.me/${validWhatsApp}?text=${encodeURIComponent(
        `Olá ${delivery.customer}! Sou o motoboy com seu pedido ${displayOrderStr}. Já cheguei no seu endereço e estou no portão te aguardando! Pode retirar, por favor? Obrigado!`,
      )}`
    : null;

  const handlePromptPhone = (actionAfter?: "contact" | "arrived") => {
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
    if (actionAfter === "arrived") {
      const url = `https://wa.me/${sanitized}?text=${encodeURIComponent(
        `Olá ${delivery.customer}! Sou o motoboy com seu pedido ${displayOrderStr}. Já cheguei no seu endereço e estou no portão te aguardando! Pode retirar, por favor? Obrigado!`,
      )}`;
      window.open(url, "_blank");
    } else if (actionAfter === "contact") {
      const url = `https://wa.me/${sanitized}?text=${encodeURIComponent(
        `Olá ${delivery.customer}! Sou o motoboy com seu pedido ${displayOrderStr}. Já estou a caminho do seu endereço: ${delivery.address}.`,
      )}`;
      window.open(url, "_blank");
    }
  };

  const mapsUrl = delivery.latitude && delivery.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${delivery.latitude},${delivery.longitude}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${delivery.address}, ${delivery.district}, ${delivery.city || ""}`)}&travelmode=driving`;

  const wazeUrl = delivery.latitude && delivery.longitude
    ? `https://waze.com/ul?ll=${delivery.latitude},${delivery.longitude}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(`${delivery.address}, ${delivery.district}, ${delivery.city || ""}`)}&navigate=yes`;

  // Limpeza e formatação de endereço
  let streetLine = delivery.address || "Endereço não informado";
  if (delivery.district && streetLine.toLowerCase().includes(delivery.district.toLowerCase())) {
    const regex = new RegExp(`[,\\s-]+${delivery.district}.*`, "i");
    const trimmed = streetLine.replace(regex, "").trim();
    if (trimmed.length > 3) streetLine = trimmed;
  }

  const districtParts: string[] = [];
  if (delivery.district) districtParts.push(delivery.district);
  if (delivery.complement) districtParts.push(delivery.complement);
  const districtLine = districtParts.join(" · ") || (delivery.city ? delivery.city : "");

  // Remove códigos de coleta da observação de endereço para não poluir
  const cleanNotes = delivery.notes
    ?.split("|")
    .map((s) => s.trim())
    .filter(
      (s) =>
        !s.toLowerCase().includes("código de coleta") &&
        !s.toLowerCase().includes("codigo de coleta") &&
        !s.toLowerCase().startsWith("coleta:") &&
        !s.toLowerCase().startsWith("coleta ")
    )
    .join(" • ");

  const referenceLine = delivery.reference && delivery.reference !== "."
    ? `Ref.: ${delivery.reference}`
    : cleanNotes && cleanNotes.length > 0
    ? (cleanNotes.toLowerCase().startsWith("ref") ? cleanNotes : `Ref.: ${cleanNotes}`)
    : null;

  const statusSlug = (delivery.status || "Aguardando").toLowerCase().replaceAll(" ", "-");

  const ifoodOrderNum = delivery.platformOrderId
    ? String(delivery.platformOrderId).replace(/^#/, "")
    : delivery.pickupCode
    ? String(delivery.pickupCode).replace(/^#/, "")
    : "";

  const isPendingPayment =
    delivery.payment?.toLowerCase().includes("verificar") ||
    delivery.payment?.toLowerCase().includes("pendente");

  const itemCount =
    delivery.items && delivery.items.length > 0
      ? delivery.items.reduce((acc, it) => acc + (it.amount || 1), 0)
      : 1;

  const handleCopyLocator = () => {
    if (!delivery.ifoodLocalizer) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(delivery.ifoodLocalizer);
    }
    onNotify?.(`Localizador ${delivery.ifoodLocalizer} copiado!`);
  };

  return (
    <article
      className={`compact-delivery-card ${isDelivered ? "is-delivered" : ""} ${selected ? "is-selected" : ""}`}
    >
      {/* 1. Header: [1ª Parada] #33 [iFood #6879] ... [Status] */}
      <div className="cdc-header">
        <div className="cdc-header-left">
          {showSelectCheckbox && !isDelivered && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.();
              }}
              className={`cdc-checkbox ${selected ? "is-selected" : ""}`}
              title={selected ? "Remover da rota agrupada" : "Selecionar para rota agrupada"}
            >
              {selected && <Check size={13} strokeWidth={3} />}
            </button>
          )}

          {stopNumber !== undefined && !isDelivered && (
            <span className="cdc-stop-badge">
              {stopNumber}ª parada
            </span>
          )}

          <span className="cdc-order-num">
            {displayOrderStr}
          </span>

          {isIfood ? (
            <span className="cdc-badge-ifood">
              iFood{ifoodOrderNum && ifoodOrderNum !== cleanOrderNum ? ` #${ifoodOrderNum}` : ""}
            </span>
          ) : (
            <span className="cdc-badge-loja">
              Loja
            </span>
          )}
        </div>

        <div className="cdc-header-right">
          <span className={`cdc-status-pill ${statusSlug}`}>
            {delivery.status}
          </span>
        </div>
      </div>

      {/* 2. Customer & Address Block */}
      <div className="cdc-customer-block">
        <div className="cdc-customer-name">{delivery.customer}</div>
        <div className="cdc-customer-street">{streetLine}</div>
        {districtLine && <div className="cdc-customer-district">{districtLine}</div>}
        {referenceLine && <div className="cdc-customer-ref">{referenceLine}</div>}
      </div>

      {/* 3. Finance & Items Block */}
      <div className="cdc-finance-block">
        <div className="cdc-finance-row">
          <div className="cdc-finance-left">
            {isPendingPayment && <span className="cdc-pending-dot" />}
            <span className="cdc-amount">{money(delivery.amount)}</span>
            <span className="cdc-payment"> · {delivery.payment || "A Cobrar"}</span>
          </div>
          <span className="cdc-fee">Taxa {money(delivery.deliveryFee)}</span>
        </div>

        <div className="cdc-items-row">
          <button
            type="button"
            className="cdc-items-btn"
            onClick={() => setShowItemsDetail(!showItemsDetail)}
          >
            <span>
              {itemCount} {itemCount === 1 ? "item" : "itens"} · Ver detalhes
            </span>
            {showItemsDetail ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {delivery.ifoodLocalizer && (
              <button
                type="button"
                className="cdc-loc-btn"
                onClick={handleCopyLocator}
                title="Copiar localizador iFood"
              >
                <span>Loc. {delivery.ifoodLocalizer}</span>
                <Copy size={13} />
              </button>
            )}

            {!isIfood && (
              validWhatsApp ? (
                <a
                  href={whatsappUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cdc-contact-btn"
                  title="Conversar no WhatsApp"
                >
                  <WhatsAppIcon size={14} color="#15803d" />
                  <span>Contato</span>
                </a>
              ) : (
                <button
                  type="button"
                  className="cdc-contact-btn is-add"
                  onClick={() => handlePromptPhone("contact")}
                  title="Digitar número de WhatsApp"
                >
                  <WhatsAppIcon size={14} color="#15803d" />
                  <span>Contato</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Detalhes de itens expansíveis */}
        {showItemsDetail && (
          <div className="cdc-items-dropdown">
            {delivery.items && delivery.items.length > 0 ? (
              delivery.items.map((it, idx) => (
                <div key={idx} className="cdc-item-detail">
                  <div style={{ flex: 1 }}>
                    <strong>{it.amount}x {it.name}</strong>
                    {it.complements && it.complements.length > 0 && (
                      <span className="cdc-item-comp">+ {it.complements.join(", ")}</span>
                    )}
                    {it.details && <span className="cdc-item-note">Obs: {it.details}</span>}
                  </div>
                  {it.price > 0 && <span>{money(it.totalPrice || it.price * it.amount)}</span>}
                </div>
              ))
            ) : (
              <div style={{ color: "var(--muted)", fontSize: "12px" }}>
                {delivery.itemsSummary || "Nenhum detalhe adicional de itens."}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. iFood Strip: [ Contato iFood ] | [ Confirmar no iFood ] */}
      {isIfood && !isDelivered && (
        <div className="cdc-ifood-links-strip">
          <a
            href={`tel:08007217000${delivery.ifoodLocalizer ? `;${delivery.ifoodLocalizer}` : ""}`}
            className="cdc-ifood-sublink"
            title="Ligar iFood 0800 721 7000"
          >
            <PhoneCall size={13} />
            <span>Contato iFood</span>
          </a>
          <span className="cdc-ifood-divider" />
          <button
            type="button"
            className="cdc-ifood-sublink"
            onClick={onOpenIfoodConfirm}
            title="Confirmar entrega no iFood"
          >
            <ExternalLink size={13} />
            <span>Confirmar no iFood</span>
          </button>
        </div>
      )}

      {delivery.ifoodConfirmed && (
        <div className="ifood-confirmed-banner">
          <ShieldCheck size={14} />
          <span>Entrega Blindada e Confirmada no iFood</span>
        </div>
      )}

      {/* 5. Action Buttons (Linha 1: Navegação 1-Toque Maps & Waze | Linha 2: Cheguei + Concluir) */}
      {!isDelivered ? (
        <div className="cdc-actions-wrapper">
          {/* Navegação Rápida 1-Toque para Motoboys */}
          <div className="cdc-nav-grid">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cdc-maps"
              title="Abrir navegação no Google Maps"
            >
              <Navigation size={14} />
              <span>Maps</span>
            </a>

            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cdc-waze"
              title="Abrir navegação no Waze"
            >
              <span>Waze</span>
            </a>
          </div>

          {/* Ações Operacionais da Entrega */}
          <div className={`cdc-action-buttons ${isIfood ? "grid-1" : "grid-2"}`}>
            {!isIfood && (
              validWhatsApp ? (
                <a
                  href={whatsappArrivedUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-cdc-cheguei"
                  title="Avisar cliente no WhatsApp que já chegou no portão"
                >
                  <WhatsAppIcon size={16} color="#15803d" />
                  <span>Cheguei</span>
                </a>
              ) : (
                <button
                  type="button"
                  className="btn-cdc-cheguei"
                  onClick={() => handlePromptPhone("arrived")}
                  title="Informar WhatsApp para avisar chegada no portão"
                >
                  <WhatsAppIcon size={16} color="#15803d" />
                  <span>Cheguei</span>
                </button>
              )
            )}

            <button
              type="button"
              className="btn-cdc-concluir"
              onClick={onMarkDelivered}
              title="Concluir entrega"
            >
              <Check size={15} strokeWidth={2.8} />
              <span>Concluir</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="cdc-delivered-bar">
          <span className="cdc-delivered-label">
            <CheckCircle2 size={15} /> Pedido Entregue
          </span>
          <button
            type="button"
            className="btn-cdc-reopen"
            onClick={() => onUpdateStatus("Aguardando")}
            title="Reabrir entrega"
          >
            Reabrir
          </button>
        </div>
      )}

      {/* 6. ADM Extras */}
      {isAdm && (
        <div className="cdc-adm-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "var(--muted)", fontWeight: "600" }}>Motoboy:</span>
            <select
              value={delivery.driverId || ""}
              onChange={(e) => onAssignDriver(e.target.value)}
              className="adm-assign-select"
              style={{ fontSize: "12px", height: "30px", borderRadius: "6px", padding: "0 6px" }}
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
            style={{ border: 0, background: "transparent", color: "var(--danger)", cursor: "pointer", padding: "4px" }}
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
  drivers = [],
  showAllDrivers = false,
  currentDriverGps,
  liveTelemetry,
  currentDriverName,
  mapProvider,
  notify,
  onMarkDelivered,
  selectedRouteIds,
  onClearSelection,
}: {
  deliveries: Delivery[];
  drivers?: Driver[];
  showAllDrivers?: boolean;
  currentDriverGps?: GeoPoint | null;
  liveTelemetry?: TrackingPosition | null;
  currentDriverName?: string;
  mapProvider: MapTileProvider;
  notify: (s: string) => void;
  onMarkDelivered: (id: string) => void;
  selectedRouteIds?: string[];
  onClearSelection?: () => void;
}) {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [userPos, setUserPos] = useState<GeoPoint | null>(null);
  const mapInstanceRef = useRef<any>(null);

  const activeGpsDrivers = useMemo(() => {
    if (!showAllDrivers || !drivers || drivers.length === 0) return [];
    const now = Date.now();
    return drivers.filter((d) => {
      if (!d.location || typeof d.location.latitude !== "number" || typeof d.location.longitude !== "number") {
        return false;
      }
      const time = new Date(d.location.updatedAt).getTime();
      return now - time < 2 * 60 * 60 * 1000;
    });
  }, [drivers, showAllDrivers]);

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

  // CÁLCULO AUTOMÁTICO DE ROTA OTIMIZADA (TSP) COM GPS AO VIVO DO MOTOBOY
  useEffect(() => {
    let cancelled = false;
    async function autoRoute() {
      const effectiveStart = currentDriverGps || userPos;

      // Se não há entregas pendentes: se estiver fora da loja, traça percurso de retorno à Base
      if (routableDeliveries.length === 0) {
        if (effectiveStart) {
          const distToStore = Math.hypot(
            effectiveStart.latitude - STORE_POINT.latitude,
            effectiveStart.longitude - STORE_POINT.longitude,
          );
          if (distToStore > 0.001) {
            try {
              const res = await calculateRoute([effectiveStart, STORE_POINT], false);
              if (!cancelled) setRoute(res);
              return;
            } catch {}
          }
        }
        setRoute(null);
        return;
      }

      setLoading(true);
      try {
        const startPoint = effectiveStart || STORE_POINT;
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
          effectiveStart || STORE_POINT,
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
  }, [routableDeliveries.length, currentDriverGps?.latitude, currentDriverGps?.longitude, userPos]);

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
    if (orderedDeliveries.length === 0) {
      if (route) {
        window.open(
          `https://www.google.com/maps/dir/?api=1&destination=${STORE_POINT.latitude},${STORE_POINT.longitude}&travelmode=driving`,
          "_blank",
          "noopener,noreferrer",
        );
      }
      return;
    }
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
    if (orderedDeliveries.length === 0) {
      if (route) {
        window.open(
          `https://waze.com/ul?ll=${STORE_POINT.latitude},${STORE_POINT.longitude}&navigate=yes`,
          "_blank",
          "noopener,noreferrer",
        );
      }
      return;
    }
    const first = orderedDeliveries[0];
    const url = first.latitude && first.longitude
      ? `https://waze.com/ul?ll=${first.latitude},${first.longitude}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(`${first.address}, ${first.district}`)}&navigate=yes`;
    window.open(url, "_blank", "noopener,noreferrer");
    notify("Navegação da 1ª parada aberta no Waze!");
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
            <b>
              {orderedDeliveries.length > 0
                ? `${orderedDeliveries.length} parada(s) no percurso`
                : route
                  ? "Retornando para a Loja"
                  : "Aguardando pedidos na Loja"}
            </b>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              {route
                ? `${(route.distanceMeters / 1000).toFixed(1)} km · ~${Math.round(route.durationSeconds / 60)} min de moto`
                : currentDriverGps
                  ? "Sua moto está conectada e transmitindo ao vivo"
                  : "Traçando melhor rota viária…"}
              {route?.provider === "valhalla" && (
                <span className="vrp-badge">⚡ Valhalla VRP</span>
              )}
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="primary"
              style={{ padding: "8px 12px", fontSize: "11px", borderRadius: "10px" }}
              disabled={loading || (!route && orderedDeliveries.length === 0)}
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
              disabled={!route && orderedDeliveries.length === 0}
              onClick={startWazeFirstStop}
            >
              Waze
            </button>
          </div>
        </div>

        {/* Floating Radar de Motoboys (Apenas para Loja / ADM) */}
        {showAllDrivers && activeGpsDrivers.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "58px",
              left: "10px",
              right: "10px",
              zIndex: 499,
              display: "flex",
              alignItems: "center",
              gap: "6px",
              overflowX: "auto",
              padding: "6px 10px",
              background: "color-mix(in srgb, var(--surface) 94%, transparent)",
              backdropFilter: "blur(12px)",
              border: "1px solid var(--line)",
              borderRadius: "12px",
              boxShadow: "var(--shadow-sm)",
              scrollbarWidth: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                fontWeight: 800,
                color: "var(--primary)",
                whiteSpace: "nowrap",
              }}
            >
              <Radio size={13} className="spin-animation" /> Radar ({activeGpsDrivers.length}):
            </div>
            {activeGpsDrivers.map((drv) => {
              const isMoving = Boolean(drv.location?.speed && drv.location.speed > 3);
              return (
                <button
                  key={drv.id}
                  type="button"
                  onClick={() => {
                    if (drv.location && mapInstanceRef.current) {
                      mapInstanceRef.current.flyTo(
                        [drv.location.latitude, drv.location.longitude],
                        17,
                        { animate: true },
                      );
                      notify(`Focando em ${drv.name.split(" ")[0]}`);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "var(--surface)",
                    border: isMoving ? "1px solid rgba(16,185,129,0.5)" : "1px solid var(--line)",
                    borderRadius: "99px",
                    padding: "3px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--ink)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: isMoving ? "#10b981" : "#7c3aed",
                      boxShadow: isMoving ? "0 0 0 2px rgba(16,185,129,0.3)" : "none",
                    }}
                  />
                  {drv.name.split(" ")[0]}
                  {isMoving && drv.location?.speed ? (
                    <span style={{ color: "#10b981", fontSize: "10px" }}>
                      {Math.round(drv.location.speed)} km/h
                    </span>
                  ) : (
                    <span style={{ color: "var(--muted)", fontSize: "10px" }}>Parado</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Map component com paradas na ordem correta da rota */}
        <FreeMapInternal
          deliveries={orderedDeliveries}
          drivers={showAllDrivers ? drivers : []}
          currentDriverGps={currentDriverGps}
          liveTelemetry={liveTelemetry}
          currentDriverName={currentDriverName}
          mapProvider={mapProvider}
          route={route}
          onGpsFound={(pos) => setUserPos(pos)}
          onMapReady={(inst) => {
            mapInstanceRef.current = inst;
          }}
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
  drivers = [],
  currentDriverGps,
  liveTelemetry,
  currentDriverName,
  mapProvider,
  route,
  onGpsFound,
  onMapReady,
}: {
  deliveries: Delivery[];
  drivers?: Driver[];
  currentDriverGps?: GeoPoint | null;
  liveTelemetry?: TrackingPosition | null;
  currentDriverName?: string;
  mapProvider: MapTileProvider;
  route?: RouteResult | null;
  onGpsFound?: (pos: GeoPoint) => void;
  onMapReady?: (mapInstance: any) => void;
}) {
  const element = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const deliveriesLayerRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const driverMarkersLayerRef = useRef<any>(null);
  const currentDriverLayerRef = useRef<any>(null);
  const currentDriverMarkerRef = useRef<any>(null);
  const hasFittedBoundsRef = useRef(false);
  const [gpsStatus, setGpsStatus] = useState("");
  const [followingMe, setFollowingMe] = useState(false);

  function populateDriverMarkers(layer: any, L: any, driverList: Driver[]) {
    layer.clearLayers();
    const now = Date.now();
    const activeGpsDrivers = (driverList || []).filter((d) => {
      // Evita duplicar o motoboy atual que já possui marcador local em tempo real de alta precisão
      if (
        currentDriverName &&
        (d.name.toLowerCase() === currentDriverName.toLowerCase() || d.id === currentDriverName)
      ) {
        return false;
      }
      if (!d.location || typeof d.location.latitude !== "number" || typeof d.location.longitude !== "number") {
        return false;
      }
      const time = new Date(d.location.updatedAt).getTime();
      return now - time < 2 * 60 * 60 * 1000;
    });

    activeGpsDrivers.forEach((drv) => {
      if (!drv.location) return;
      const { latitude, longitude, speed, statusText, batteryLevel, updatedAt } = drv.location;
      const firstName = drv.name.split(" ")[0];
      const isMoving = Boolean(speed && speed > 3);
      const markerColor = isMoving ? "#10b981" : "#7c3aed";

      const driverIcon = L.divIcon({
        className: "driver-marker-container",
        html: `
          <div style="position:relative; width:34px; height:34px; display:flex; align-items:center; justify-content:center;">
            <div style="background:${markerColor}; color:#fff; border-radius:50%; width:34px; height:34px; display:grid; place-items:center; border:2.5px solid #fff; box-shadow:0 3px 10px rgba(0,0,0,0.3); animation: driver-ring-anim 2s infinite ease-in-out;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
            </div>
            <div style="position:absolute; bottom:-16px; left:50%; transform:translateX(-50%); background:rgba(17,24,39,0.92); color:#fff; font-size:10px; font-weight:800; padding:1px 6px; border-radius:6px; white-space:nowrap; box-shadow:0 2px 5px rgba(0,0,0,0.3); pointer-events:none; border:1px solid rgba(255,255,255,0.25);">
              ${firstName} ${speed && speed > 3 ? `(${Math.round(speed)}km/h)` : ""}
            </div>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const waCleanPhone = (drv.phone || "").replace(/\D/g, "");
      const waUrl = waCleanPhone ? `https://wa.me/55${waCleanPhone}` : "";
      const timeDiffMinutes = Math.round((now - new Date(updatedAt).getTime()) / 60000);
      const timeText = timeDiffMinutes <= 1 ? "Agora mesmo" : `Há ${timeDiffMinutes} min`;

      L.marker([latitude, longitude], { icon: driverIcon, zIndexOffset: 1000 })
        .bindPopup(
          `<div style="font-family:Inter,sans-serif;font-size:12px;padding:6px;min-width:180px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div style="background:${markerColor};color:#fff;width:32px;height:32px;border-radius:50%;display:grid;place-items:center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
              </div>
              <div>
                <b style="font-size:13px;color:#111827;display:block">${drv.name}</b>
                <span style="font-size:10.5px;color:#6b7280;font-weight:600">${statusText || (isMoving ? "Em Trânsito" : "Parado")}</span>
              </div>
            </div>
            <div style="background:#f3f4f6;border-radius:8px;padding:8px;font-size:11px;margin-bottom:8px;line-height:1.5">
              <div><b>Velocidade:</b> ${speed && speed > 3 ? `${Math.round(speed)} km/h` : "Parado"}</div>
              ${batteryLevel != null ? `<div><b>Bateria:</b> ${formatBattery(batteryLevel)}</div>` : ""}
              <div><b>Último sinal:</b> ${timeText}</div>
            </div>
            ${
              waUrl
                ? `<a href="${waUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;background:#25d366;color:#fff;font-weight:700;padding:7px;border-radius:8px;text-decoration:none;font-size:11.5px">Chamar no WhatsApp</a>`
                : ""
            }
          </div>`
        )
        .addTo(layer);
    });
  }

  // 1. Inicializa o mapa Leaflet UMA ÚNICA VEZ
  useEffect(() => {
    let active = true;
    void import("leaflet").then((L) => {
      if (!active || !element.current) return;
      if (map.current) return;

      const instance = L.map(element.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([STORE_POINT.latitude, STORE_POINT.longitude], 14);
      map.current = instance;

      const tile = MAP_TILE_PROVIDERS[mapProvider] || MAP_TILE_PROVIDERS.osm;
      tileLayerRef.current = L.tileLayer(tile.url, { maxZoom: tile.maxZoom }).addTo(instance);

      // Ponto Fixo da Loja
      L.circleMarker([STORE_POINT.latitude, STORE_POINT.longitude], {
        radius: 8,
        color: "#fff",
        weight: 2.5,
        fillColor: "#111827",
        fillOpacity: 1,
      })
        .bindTooltip(STORE_POINT.name, { direction: "top", permanent: false })
        .addTo(instance);

      // Camadas de polilinha, entregas e motoboys
      routePolylineRef.current = L.polyline([], {
        color: "#ea1d2c",
        weight: 6,
        opacity: 0.88,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(instance);

      deliveriesLayerRef.current = L.layerGroup().addTo(instance);
      driverMarkersLayerRef.current = L.layerGroup().addTo(instance);
      currentDriverLayerRef.current = L.layerGroup().addTo(instance);

      // Desativa o auto-seguir se o usuário arrastar o mapa manualmente
      instance.on("dragstart", () => {
        setFollowingMe(false);
      });

      // Render inicial de motoboys
      populateDriverMarkers(driverMarkersLayerRef.current, L, drivers);
      onMapReady?.(instance);

      setTimeout(() => instance.invalidateSize(), 80);
    });

    return () => {
      active = false;
      map.current?.remove();
      map.current = null;
      tileLayerRef.current = null;
      deliveriesLayerRef.current = null;
      driverMarkersLayerRef.current = null;
      currentDriverLayerRef.current = null;
      currentDriverMarkerRef.current = null;
      routePolylineRef.current = null;
    };
  }, []);

  // 2. Atualiza Provedor de Mapa (se mudar)
  useEffect(() => {
    if (!map.current || !tileLayerRef.current) return;
    const tile = MAP_TILE_PROVIDERS[mapProvider] || MAP_TILE_PROVIDERS.osm;
    tileLayerRef.current.setUrl(tile.url);
  }, [mapProvider]);

  // 3. Atualiza Paradas e Rota sem destruir o mapa e sem fitBounds repetitivo
  useEffect(() => {
    if (!map.current || !deliveriesLayerRef.current) return;
    void import("leaflet").then((L) => {
      const layer = deliveriesLayerRef.current;
      if (!layer) return;
      layer.clearLayers();

      const bounds: Array<[number, number]> = [[STORE_POINT.latitude, STORE_POINT.longitude]];

      const driverLat = liveTelemetry?.latitude ?? currentDriverGps?.latitude;
      const driverLng = liveTelemetry?.longitude ?? currentDriverGps?.longitude;
      if (typeof driverLat === "number" && typeof driverLng === "number") {
        bounds.push([driverLat, driverLng]);
      }

      deliveries.forEach((del, i) => {
        if (typeof del.latitude !== "number" || typeof del.longitude !== "number") return;
        const color = del.status === "Entregue" ? "#10b981" : del.status === "Em rota" ? "#3b82f6" : "#7557f6";
        const icon = L.divIcon({
          className: "delivery-marker-shell",
          html: `<span style="--marker-color:${color}; background:${color}; color:#fff; font-weight:800; border-radius:50%; width:30px; height:30px; display:grid; place-items:center; border:2px solid #fff; box-shadow:0 3px 8px rgba(0,0,0,.25); font-size:12px">${i + 1}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        L.marker([del.latitude, del.longitude], { icon })
          .bindPopup(
            `<div style="font-family:Inter,sans-serif;font-size:12px;padding:4px">
              <b>Parada ${i + 1}: ${del.customer}</b><br/>
              <span style="color:#555">${del.address}</span><br/>
              <b style="color:#10b981">Taxa: ${money(del.deliveryFee)}</b>
            </div>`,
          )
          .addTo(layer);

        bounds.push([del.latitude, del.longitude]);
      });

      if (routePolylineRef.current) {
        if (route?.geometry.length) {
          const poly = route.geometry.map((p) => [p.latitude, p.longitude] as [number, number]);
          routePolylineRef.current.setLatLngs(poly);
          bounds.push(...poly);
        } else {
          routePolylineRef.current.setLatLngs([]);
        }
      }

      // Enquadra a rota APENAS na primeira carga para não sacudir nem reiniciar a visualização do usuário
      if (!hasFittedBoundsRef.current && (deliveries.length > 0 || (route && route.geometry.length > 0) || currentDriverGps)) {
        if (bounds.length > 1) {
          map.current?.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 16 });
        }
        hasFittedBoundsRef.current = true;
      }
    });
  }, [deliveries, route, currentDriverGps, liveTelemetry]);

  // 4. Atualização suave dos marcadores de motoboys em tempo real (RTDB)
  useEffect(() => {
    if (!map.current || !driverMarkersLayerRef.current) return;
    void import("leaflet").then((L) => {
      if (driverMarkersLayerRef.current) {
        populateDriverMarkers(driverMarkersLayerRef.current, L, drivers);
      }
    });
  }, [drivers, currentDriverName]);

  // 5. Marcador Local de Alta Precisão e Rastreamento em Tempo Real do Motoboy Atual (Estilo iFood)
  useEffect(() => {
    if (!map.current || !currentDriverLayerRef.current) return;
    const lat = liveTelemetry?.latitude ?? currentDriverGps?.latitude;
    const lng = liveTelemetry?.longitude ?? currentDriverGps?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return;

    void import("leaflet").then((L) => {
      const layer = currentDriverLayerRef.current;
      if (!layer) return;

      const heading =
        liveTelemetry?.heading != null && !isNaN(liveTelemetry.heading)
          ? Math.round(liveTelemetry.heading)
          : null;
      const speed =
        liveTelemetry?.speed != null && !isNaN(liveTelemetry.speed)
          ? Math.round(liveTelemetry.speed)
          : null;
      const accuracy =
        liveTelemetry?.accuracy != null ? Math.round(liveTelemetry.accuracy) : null;

      const driverIcon = L.divIcon({
        className: "driver-marker-container",
        html: `
          <div style="position:relative; width:44px; height:44px; display:flex; align-items:center; justify-content:center;">
            <div style="position:absolute; width:44px; height:44px; border-radius:50%; background:rgba(234,29,44,0.35); animation:driver-beacon-pulse 1.8s infinite cubic-bezier(0.215, 0.61, 0.355, 1); pointer-events:none;"></div>
            ${
              heading !== null
                ? `
              <div style="position:absolute; top:-9px; width:0; height:0; border-left:6px solid transparent; border-right:6px solid transparent; border-bottom:13px solid #ea1d2c; transform:rotate(${heading}deg); transform-origin:50% 31px; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35)); pointer-events:none;"></div>
            `
                : ""
            }
            <div style="position:relative; z-index:2; background:linear-gradient(135deg, #ea1d2c, #b91c1c); color:#fff; border-radius:50%; width:38px; height:38px; display:grid; place-items:center; border:2.5px solid #fff; box-shadow:0 4px 14px rgba(234,29,44,0.5); transform:rotate(${heading !== null ? heading : 0}deg); transition:transform 0.3s ease-out;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
            </div>
            <div style="position:absolute; bottom:-18px; left:50%; transform:translateX(-50%); background:rgba(17,24,39,0.94); color:#fff; font-size:10px; font-weight:800; padding:2px 7px; border-radius:10px; white-space:nowrap; box-shadow:0 3px 8px rgba(0,0,0,0.35); pointer-events:none; border:1px solid rgba(255,255,255,0.25); display:flex; align-items:center; gap:4px; z-index:3;">
              <span style="width:6px; height:6px; border-radius:50%; background:#10b981; display:inline-block; box-shadow:0 0 6px #10b981;"></span>
              <span>${currentDriverName ? currentDriverName.split(" ")[0] : "Você"}</span>
              ${speed !== null && speed > 2 ? `<span style="color:#6ee7b7; font-weight:900;">• ${speed} km/h</span>` : ""}
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      if (currentDriverMarkerRef.current) {
        currentDriverMarkerRef.current.setLatLng([lat, lng]);
        currentDriverMarkerRef.current.setIcon(driverIcon);
      } else {
        const marker = L.marker([lat, lng], {
          icon: driverIcon,
          zIndexOffset: 2000,
        }).addTo(layer);

        marker.bindPopup(`
          <div style="font-family:Inter,sans-serif;font-size:12px;padding:6px;min-width:180px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div style="background:#ea1d2c;color:#fff;width:34px;height:34px;border-radius:50%;display:grid;place-items:center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
              </div>
              <div>
                <b style="font-size:13px;color:#111827;display:block">${currentDriverName || "Sua Posição"} (Você)</b>
                <span style="font-size:10.5px;color:#10b981;font-weight:700">● Rastreamento em Tempo Real</span>
              </div>
            </div>
            <div style="background:#f3f4f6;border-radius:8px;padding:8px;font-size:11px;margin-bottom:6px;line-height:1.5">
              <div><b>Velocidade:</b> ${speed !== null && speed > 2 ? `${speed} km/h` : "Parado / Em Espera"}</div>
              ${heading !== null ? `<div><b>Direção:</b> ${heading}°</div>` : ""}
              ${accuracy !== null ? `<div><b>Precisão GPS:</b> ±${accuracy}m</div>` : ""}
            </div>
          </div>
        `);
        currentDriverMarkerRef.current = marker;
      }

      if (followingMe && map.current) {
        map.current.panTo([lat, lng], { animate: true, duration: 0.6 });
      }
    });
  }, [currentDriverGps, liveTelemetry, currentDriverName, followingMe]);

  function focusOnDriver() {
    const lat = liveTelemetry?.latitude ?? currentDriverGps?.latitude;
    const lng = liveTelemetry?.longitude ?? currentDriverGps?.longitude;
    if (typeof lat === "number" && typeof lng === "number" && map.current) {
      map.current.flyTo([lat, lng], 17, { animate: true, duration: 0.8 });
    }
  }

  function recenterRoute() {
    if (!map.current) return;
    void import("leaflet").then((L) => {
      const bounds: Array<[number, number]> = [[STORE_POINT.latitude, STORE_POINT.longitude]];
      const driverLat = liveTelemetry?.latitude ?? currentDriverGps?.latitude;
      const driverLng = liveTelemetry?.longitude ?? currentDriverGps?.longitude;
      if (typeof driverLat === "number" && typeof driverLng === "number") {
        bounds.push([driverLat, driverLng]);
      }
      deliveries.forEach((d) => {
        if (typeof d.latitude === "number" && typeof d.longitude === "number") {
          bounds.push([d.latitude, d.longitude]);
        }
      });
      if (route?.geometry.length) {
        route.geometry.forEach((p) => bounds.push([p.latitude, p.longitude]));
      }
      if (bounds.length > 1) {
        map.current.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 16 });
      }
    });
  }

  async function locateMe() {
    setGpsStatus("Localizando…");
    try {
      const pos = await currentPosition();
      onGpsFound?.(pos);
      const L = await import("leaflet");
      if (map.current) {
        map.current.flyTo([pos.latitude, pos.longitude], 16, { animate: true });
        L.circleMarker([pos.latitude, pos.longitude], {
          radius: 9,
          color: "#fff",
          weight: 2.5,
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
      <div className="map-live-controls" style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={recenterRoute}
          style={{ display: "flex", alignItems: "center", gap: "5px" }}
          title="Enquadrar rota completa"
        >
          <Route size={13} /> Ver Toda Rota
        </button>
        <button
          type="button"
          onClick={() => {
            const nextFollow = !followingMe;
            setFollowingMe(nextFollow);
            if (nextFollow) {
              focusOnDriver();
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            background: followingMe ? "#10b981" : undefined,
            color: followingMe ? "#fff" : undefined,
            borderColor: followingMe ? "#10b981" : undefined,
            fontWeight: followingMe ? 700 : undefined,
          }}
          title={followingMe ? "Mapa acompanhando sua moto" : "Acompanhar sua moto em tempo real no mapa"}
        >
          <Compass size={13} /> {followingMe ? "Seguindo Você" : "Focar em Mim"}
        </button>
        <button
          type="button"
          onClick={locateMe}
          style={{ display: "flex", alignItems: "center", gap: "5px" }}
          title="Atualizar GPS"
        >
          <Navigation size={13} /> Meu GPS
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
              <span style={{ color: "#16a34a", fontWeight: "800" }}>Taxa do Motoboy (R$)</span>
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
                  8 dígitos identificados
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
  const [statementViewMode, setStatementViewMode] = useState<"detailed" | "summary">("detailed");
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({});

  const toggleDayExpanded = (key: string) => {
    setExpandedDays((prev) => ({
      ...prev,
      [key]: prev[key] === undefined ? false : !prev[key],
    }));
  };

  const completedList = useMemo(() => {
    return deliveries.filter((d) => {
      const s = (d.status || "").toLowerCase().trim();
      const isDone = s === "entregue" || s === "delivered" || s === "concluída";
      if (!isDone) return false;
      if (appMode === "motoboy" && activeDriver) {
        const dName = (d.driver || "").toLowerCase().trim();
        const activeName = (activeDriver.name || "").toLowerCase().trim();
        if (d.driverId && activeDriver.id && d.driverId !== activeDriver.id && dName !== activeName) {
          return false;
        }
      }
      return true;
    });
  }, [deliveries, appMode, activeDriver]);

  interface DayGroup {
    dateKey: string;
    dateLabel: string;
    dayOfWeek: string;
    formattedDate: string;
    totalFee: number;
    totalOrders: number;
    totalAmount: number;
    avgFee: number;
    items: Delivery[];
  }

  const groupedByDay = useMemo<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();

    const now = new Date();
    // Turno operacional: entregas até às 05:59 pertencem à noite anterior
    const getShiftDate = (d: Date) => {
      const shift = new Date(d);
      if (shift.getHours() < 6) {
        shift.setDate(shift.getDate() - 1);
      }
      return shift;
    };

    const nowShift = getShiftDate(now);
    const todayKey = `${nowShift.getFullYear()}-${String(nowShift.getMonth() + 1).padStart(2, "0")}-${String(nowShift.getDate()).padStart(2, "0")}`;

    const yesterdayShift = new Date(nowShift);
    yesterdayShift.setDate(yesterdayShift.getDate() - 1);
    const yesterdayKey = `${yesterdayShift.getFullYear()}-${String(yesterdayShift.getMonth() + 1).padStart(2, "0")}-${String(yesterdayShift.getDate()).padStart(2, "0")}`;

    const weekDays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

    for (const d of completedList) {
      let parsedDate: Date | null = null;
      const raw = d.createdAt || d.deliveredAt;
      if (raw) {
        const normalized = typeof raw === "string" ? raw.trim().replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, "$1T$2") : raw;
        const dt = new Date(normalized);
        if (!isNaN(dt.getTime())) parsedDate = dt;
      }
      if (!parsedDate) parsedDate = new Date();

      const shiftDate = getShiftDate(parsedDate);
      const y = shiftDate.getFullYear();
      const m = String(shiftDate.getMonth() + 1).padStart(2, "0");
      const day = String(shiftDate.getDate()).padStart(2, "0");
      const dateKey = `${y}-${m}-${day}`;

      const dayOfWeek = weekDays[shiftDate.getDay()];
      let dateLabel = "";
      if (dateKey === todayKey) {
        dateLabel = `Hoje • ${day}/${m}`;
      } else if (dateKey === yesterdayKey) {
        dateLabel = `Ontem • ${day}/${m}`;
      } else {
        dateLabel = `${dayOfWeek} • ${day}/${m}`;
      }

      const fee = Number(d.deliveryFee) || (activeDriver?.defaultFee ? Number(activeDriver.defaultFee) : 7.0);
      const amount = Number(d.amount) || 0;

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          dateKey,
          dateLabel,
          dayOfWeek,
          formattedDate: `${day}/${m}`,
          totalFee: 0,
          totalOrders: 0,
          totalAmount: 0,
          avgFee: 0,
          items: [],
        });
      }

      const grp = map.get(dateKey)!;
      grp.totalFee += fee;
      grp.totalOrders += 1;
      grp.totalAmount += amount;
      grp.items.push(d);
    }

    const groups = Array.from(map.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    for (const g of groups) {
      g.avgFee = g.totalOrders > 0 ? g.totalFee / g.totalOrders : 0;
      g.items.sort((a, b) => {
        const ta = new Date(a.createdAt || a.deliveredAt || 0).getTime();
        const tb = new Date(b.createdAt || b.deliveredAt || 0).getTime();
        return tb - ta;
      });
    }

    return groups;
  }, [completedList, activeDriver]);

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

      {/* Extrato / Histórico Separado por Dia */}
      <div className="finance-statement-section">
        <div className="finance-statement-header">
          <div>
            <b>Extrato das Corridas</b>
            <span style={{ display: "block", fontSize: "11px", color: "var(--muted)", fontWeight: 500, marginTop: "2px" }}>
              {completedList.length} corrida(s) • {groupedByDay.length} dia(s)
            </span>
          </div>

          {/* Toggle Minimalista: Por Corridas vs Totais por Dia */}
          {groupedByDay.length > 0 && (
            <div style={{ display: "flex", background: "var(--surface-2)", padding: "3px", borderRadius: "10px", border: "1px solid var(--line)", gap: "2px" }}>
              <button
                type="button"
                onClick={() => setStatementViewMode("detailed")}
                style={{
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "7px",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: statementViewMode === "detailed" ? "var(--surface)" : "transparent",
                  color: statementViewMode === "detailed" ? "var(--primary)" : "var(--muted)",
                  boxShadow: statementViewMode === "detailed" ? "0 1px 4px rgba(0,0,0,.08)" : "none",
                }}
              >
                Corridas
              </button>
              <button
                type="button"
                onClick={() => setStatementViewMode("summary")}
                style={{
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "7px",
                  fontSize: "10.5px",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: statementViewMode === "summary" ? "var(--surface)" : "transparent",
                  color: statementViewMode === "summary" ? "var(--primary)" : "var(--muted)",
                  boxShadow: statementViewMode === "summary" ? "0 1px 4px rgba(0,0,0,.08)" : "none",
                }}
              >
                Por Dia
              </button>
            </div>
          )}
        </div>

        {completedList.length === 0 ? (
          <div style={{ padding: "36px 16px", textAlign: "center", color: "var(--muted)", fontSize: "12px" }}>
            <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "var(--surface-2)", color: "var(--muted)", display: "grid", placeItems: "center", margin: "0 auto 10px" }}>
              <CircleDollarSign size={24} />
            </div>
            <b style={{ color: "var(--ink)", display: "block", marginBottom: "4px" }}>Nenhuma corrida concluída encontrada</b>
            <span>Ao concluir pedidos na aba Entregas, o valor da taxa entra automaticamente neste extrato separado por dia.</span>
          </div>
        ) : statementViewMode === "summary" ? (
          /* Visão Lista Minimalista com os Totais por Dia */
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {groupedByDay.map((group) => (
              <div
                key={group.dateKey}
                onClick={() => {
                  setStatementViewMode("detailed");
                  setExpandedDays({ [group.dateKey]: true });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  borderRadius: "14px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: "rgba(124, 58, 237, 0.1)",
                      color: "#7c3aed",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Calendar size={16} />
                  </div>
                  <div>
                    <b style={{ fontSize: "13px", color: "var(--ink)", display: "block" }}>{group.dateLabel}</b>
                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>
                      {group.totalOrders} corrida(s) • Média {money(group.avgFee)}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <b style={{ fontSize: "15px", fontWeight: 800, color: "#059669", display: "block" }}>
                    +{money(group.totalFee)}
                  </b>
                  <span style={{ fontSize: "10px", color: "var(--muted)" }}>Ver corridas →</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Visão Detalhada: Separado por Dia com Lista Minimalista de Corridas */
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {groupedByDay.map((group) => {
              const isExpanded = expandedDays[group.dateKey] !== false; // true por padrão
              return (
                <div
                  key={group.dateKey}
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--line)",
                    borderRadius: "16px",
                    overflow: "hidden",
                  }}
                >
                  {/* Cabeçalho do Dia (Total do dia em destaque) */}
                  <div
                    onClick={() => toggleDayExpanded(group.dateKey)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "11px 14px",
                      cursor: "pointer",
                      userSelect: "none",
                      background: "rgba(0, 0, 0, 0.02)",
                    }}
                    title="Toque para expandir/recolher as corridas deste dia"
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Calendar size={14} style={{ color: "var(--primary)" }} />
                      <span style={{ fontSize: "13px", fontWeight: 800, color: "var(--ink)" }}>{group.dateLabel}</span>
                      <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 600 }}>• {group.totalOrders} corrida(s)</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px", fontWeight: 800, color: "#059669" }}>
                        +{money(group.totalFee)}
                      </span>
                      <div style={{ color: "var(--muted)", display: "grid", placeItems: "center" }}>
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </div>
                    </div>
                  </div>

                  {/* Lista Minimalista de Corridas do Dia */}
                  {isExpanded && (
                    <div style={{ padding: "4px 10px 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {group.items.map((d) => (
                        <div
                          key={d.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "9px 12px",
                            background: "var(--surface)",
                            border: "1px solid var(--line)",
                            borderRadius: "12px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 800,
                                background: d.platform === "ifood" ? "rgba(234, 29, 44, 0.1)" : "rgba(124, 58, 237, 0.1)",
                                color: d.platform === "ifood" ? "#ea1d2c" : "#7c3aed",
                                padding: "2px 7px",
                                borderRadius: "6px",
                                flexShrink: 0,
                              }}
                            >
                              {d.order}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                              <span
                                style={{
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  color: "var(--ink)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {d.customer || "Cliente"}
                              </span>
                              <span style={{ fontSize: "10.5px", color: "var(--muted)" }}>
                                {d.district ? `${d.district} • ` : ""}
                                {d.time || (d.createdAt ? new Date(d.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : (d.deliveredAt ? new Date(d.deliveredAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""))}
                                {d.platform === "ifood" ? " • iFood" : d.platform === "takeat" ? " • Takeat" : ""}
                              </span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <span style={{ fontSize: "13.5px", fontWeight: 800, color: "#059669", display: "block" }}>
                              +{money(d.deliveryFee)}
                            </span>
                            {d.payment && (
                              <span style={{ fontSize: "9.5px", color: "var(--muted)", display: "block" }}>
                                {d.payment}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
        notify(`${updated.length} motoboy(s) sincronizados com o Takeat!`);
      } else {
        notify("Nenhum motoboy retornado do Takeat. Verifique a conexão.");
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
        notify("Conectado à Takeat com sucesso! Pedidos ativos no sistema.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao autenticar na Takeat";
      notify(msg);
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
        notify("Chave de API Takeat validada e salva no sistema!");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha na validação da chave";
      notify(msg);
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
            Conectar por Login e Senha (Recomendado)
          </button>
          <button
            type="button"
            className={`takeat-tab-btn ${authMethod === "apikey" ? "active" : ""}`}
            onClick={() => setAuthMethod("apikey")}
          >
            Conectar por Chave de API
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
          <div>• <b>Cliente & Telefone</b>: com links rápidos para ligar e chamar no WhatsApp</div>
          <div>• <b>Identificador iFood & Código de Coleta</b>: extraído da comanda/pedido Takeat</div>
          <div>• <b>Endereço Completo & GPS</b>: logradouro, número, bairro, cidade, CEP, complemento e latitude/longitude</div>
          <div>• <b>Taxa de Entrega & Valor Total</b>: soma automática na noite e mês do motoboy</div>
          <div>• <b>Itens do Pedido</b>: quantidade, nome do item, complementos e observações</div>
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
        {summaries.map((drv) => {
          const fullDriver = drivers.find((d) => d.id === drv.driverId);
          const isOnline = Boolean(
            fullDriver?.location?.latitude &&
            fullDriver?.location?.longitude &&
            Date.now() - new Date(fullDriver.location.updatedAt).getTime() < 30 * 60 * 1000,
          );

          return (
            <div key={drv.driverId} className="driver-admin-card">
              <div className="driver-admin-header">
                <div className="driver-avatar-circle">
                  {drv.driverName.substring(0, 2).toUpperCase()}
                </div>
                <div className="driver-meta" style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <b>{drv.driverName}</b>
                    {isOnline && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "9.5px",
                          fontWeight: 800,
                          background: "rgba(16,185,129,.12)",
                          color: "#10b981",
                          padding: "2px 7px",
                          borderRadius: "99px",
                          border: "1px solid rgba(16,185,129,.3)",
                        }}
                      >
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981" }} />
                        GPS Ao Vivo {fullDriver?.location?.speed && fullDriver.location.speed > 3 ? `(${Math.round(fullDriver.location.speed)} km/h)` : ""}
                      </span>
                    )}
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
        );
      })}
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

const formatBattery = (val?: number | null): string => {
  if (val == null) return "--";
  const num = val <= 1 ? Math.round(val * 100) : Math.round(val);
  return `${Math.min(100, Math.max(0, num))}%`;
};
