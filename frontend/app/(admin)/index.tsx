import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/config/api";
import { Card } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";
import { STATUS_META } from "@/src/utils/helpers";

type Dash = {
  aguardando: number;
  em_rota: number;
  concluidas_hoje: number;
  problema: number;
  drivers_total: number;
};

const CARDS: { key: keyof Dash; label: string; icon: any; color: string; bg: string }[] = [
  { key: "aguardando", label: "Aguardando saída", icon: "time", color: STATUS_META.aguardando.color, bg: STATUS_META.aguardando.bg },
  { key: "em_rota", label: "Em rota", icon: "bicycle", color: STATUS_META.em_rota.color, bg: STATUS_META.em_rota.bg },
  { key: "concluidas_hoje", label: "Concluídas hoje", icon: "checkmark-done", color: STATUS_META.entregue.color, bg: STATUS_META.entregue.bg },
  { key: "problema", label: "Com problema", icon: "alert-circle", color: STATUS_META.problema.color, bg: STATUS_META.problema.bg },
];

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<Dash | null>(null);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, u] = await Promise.all([
        api.get("/dashboard"),
        api.get("/notifications/unread_count"),
      ]);
      setData(d);
      setUnread(u.count);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.hello}>Olá, {user?.name?.split(" ")[0] || "Gestor"}</Text>
          <Text style={styles.business}>{user?.business_name || "Sua operação"}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.bell}
            onPress={() => router.push("/notificacoes")}
            testID="notifications-button"
          >
            <Ionicons name="notifications" size={22} color={colors.text} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            style={styles.bell}
            onPress={() => router.push("/configuracoes")}
            testID="settings-button"
          >
            <Ionicons name="person-circle-outline" size={24} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.grid}>
          {CARDS.map((c) => (
            <Card
              key={c.key}
              style={styles.statCard}
              onPress={() => router.push("/(admin)/entregas")}
              testID={`stat-${c.key}`}
            >
              <View style={[styles.statIcon, { backgroundColor: c.bg }]}>
                <Ionicons name={c.icon} size={20} color={c.color} />
              </View>
              <Text style={styles.statValue}>{data ? data[c.key] : "—"}</Text>
              <Text style={styles.statLabel}>{c.label}</Text>
            </Card>
          ))}
        </View>

        <Pressable
          style={styles.scanCta}
          onPress={() => router.push("/scan")}
          testID="scan-comanda-cta"
        >
          <View style={styles.scanIcon}>
            <Ionicons name="scan" size={24} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Ler comanda por foto</Text>
            <Text style={styles.scanSub}>A IA extrai cliente, endereço e valor</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.white} />
        </Pressable>

        <View style={styles.quickRow}>
          <QuickAction icon="map" label="Mapa ao vivo" onPress={() => router.push("/mapa")} testID="quick-map" />
          <QuickAction icon="cash" label="Faturamento" onPress={() => router.push("/faturamento")} testID="quick-billing" />
        </View>
        <View style={styles.quickRow}>
          <QuickAction icon="git-network" label="Montar rota" onPress={() => router.push("/(admin)/rotas")} testID="quick-routes" />
          <QuickAction icon="person-add" label="Novo motoboy" onPress={() => router.push("/motoboy-form")} testID="quick-driver" />
        </View>

        <Card style={styles.driversCard} onPress={() => router.push("/(admin)/motoboys")}>
          <View style={styles.driversRow}>
            <Ionicons name="people" size={20} color={colors.primary} />
            <Text style={styles.driversText}>
              {data?.drivers_total ?? 0} motoboy(s) cadastrado(s)
            </Text>
            <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function QuickAction({ icon, label, onPress, testID }: any) {
  return (
    <Pressable style={styles.quick} onPress={onPress} testID={testID}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  hello: { color: colors.text, fontSize: font.h2, fontWeight: "900" },
  business: { color: colors.textMuted, fontSize: font.body, marginTop: 2 },
  bell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerActions: { flexDirection: "row", gap: spacing.sm },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: "800" },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 32 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  statCard: { width: "48.5%", marginBottom: spacing.md },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  statValue: { color: colors.text, fontSize: 30, fontWeight: "900" },
  statLabel: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  scanCta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  scanIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  scanTitle: { color: colors.white, fontSize: font.title, fontWeight: "800" },
  scanSub: { color: "rgba(255,255,255,0.85)", fontSize: font.small, marginTop: 2 },
  quickRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  quick: {
    width: "48.5%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    alignItems: "center",
    gap: 8,
  },
  quickLabel: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  driversCard: { marginTop: spacing.sm },
  driversRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  driversText: { flex: 1, color: colors.text, fontSize: font.body, fontWeight: "600" },
});
