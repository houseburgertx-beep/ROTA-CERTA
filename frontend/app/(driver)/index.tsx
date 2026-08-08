import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/config/api";
import { useAuth } from "@/src/context/AuthContext";
import { useLocationSharing } from "@/src/hooks/use-location-sharing";
import { Card, StatusBadge, EmptyState } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";
import { brl, PAYMENT_META, DeliveryStatus, nextStatus } from "@/src/utils/helpers";

export default function DriverDeliveries() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { sharing, perm, start, stop } = useLocationSharing();
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await api.get("/deliveries"));
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function advance(item: any) {
    const next = nextStatus(item.status as DeliveryStatus);
    if (!next) return;
    try {
      await api.put(`/deliveries/${item.id}/status`, { status: next });
      load();
    } catch {}
  }

  async function toggleGps() {
    if (sharing) stop();
    else await start();
  }

  const pending = items.filter((i) => i.status !== "entregue");

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.hello}>Olá, {user?.name?.split(" ")[0]}</Text>
          <Text style={styles.sub}>{pending.length} entrega(s) para hoje</Text>
        </View>
        <Pressable style={styles.bell} onPress={() => router.push("/notificacoes")} testID="driver-notifications">
          <Ionicons name="notifications" size={20} color={colors.text} />
        </Pressable>
      </View>

      <Pressable
        style={[styles.gps, sharing && styles.gpsOn]}
        onPress={toggleGps}
        testID="driver-gps-toggle"
      >
        <View style={[styles.gpsDot, { backgroundColor: sharing ? colors.entregue : colors.textDim }]} />
        <Text style={styles.gpsText}>
          {sharing ? "Compartilhando localização ao vivo" : "Compartilhar minha localização"}
        </Text>
        <Ionicons name={sharing ? "radio" : "location-outline"} size={18} color={sharing ? colors.entregue : colors.textMuted} />
      </Pressable>
      {perm === "blocked" && (
        <Pressable style={styles.permWarn} onPress={() => Linking.openSettings()} testID="driver-open-settings">
          <Ionicons name="warning" size={14} color={colors.aguardando} />
          <Text style={styles.permText}>Localização bloqueada. Toque para abrir as configurações.</Text>
        </Pressable>
      )}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState icon="cube-outline" title="Nenhuma entrega" subtitle="Você ainda não tem entregas atribuídas." testID="driver-empty" />
        }
        renderItem={({ item }) => {
          const next = nextStatus(item.status as DeliveryStatus);
          const nextLabel = next === "em_rota" ? "Iniciar" : next === "entregue" ? "Entregar" : null;
          return (
            <Card style={styles.card} testID={`driver-delivery-${item.id}`}>
              <Pressable onPress={() => router.push(`/entrega/${item.id}`)}>
                <View style={styles.cardTop}>
                  <View style={styles.custRow}>
                    {item.sequence ? (
                      <View style={styles.seq}><Text style={styles.seqText}>{item.sequence}</Text></View>
                    ) : null}
                    <Text style={styles.customer} numberOfLines={1}>{item.customer_name}</Text>
                  </View>
                  <StatusBadge status={item.status} />
                </View>
                <View style={styles.addrRow}>
                  <Ionicons name="location" size={15} color={colors.textDim} />
                  <Text style={styles.addr} numberOfLines={2}>{item.address}</Text>
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.pay}>
                    <Ionicons name={PAYMENT_META[item.payment_method]?.icon as any} size={13} color={colors.textMuted} />
                    <Text style={styles.payText}>{PAYMENT_META[item.payment_method]?.label}</Text>
                  </View>
                  <Text style={styles.fee}>{brl(item.delivery_fee)}</Text>
                </View>
              </Pressable>

              {nextLabel && (
                <Pressable style={styles.action} onPress={() => advance(item)} testID={`driver-advance-${item.id}`}>
                  <Ionicons name={next === "em_rota" ? "bicycle" : "checkmark-done"} size={18} color={colors.white} />
                  <Text style={styles.actionText}>{nextLabel}</Text>
                </Pressable>
              )}
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  hello: { color: colors.text, fontSize: font.h2, fontWeight: "900" },
  sub: { color: colors.textMuted, fontSize: font.body, marginTop: 2 },
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
  gps: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  gpsOn: { borderColor: colors.entregue },
  gpsDot: { width: 10, height: 10, borderRadius: 5 },
  gpsText: { flex: 1, color: colors.text, fontSize: font.body, fontWeight: "600" },
  permWarn: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: spacing.xl, marginTop: spacing.sm },
  permText: { color: colors.aguardando, fontSize: font.small, flex: 1 },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 32 },
  card: { marginBottom: spacing.md },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  custRow: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 8 },
  seq: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginRight: 8 },
  seqText: { color: colors.primary, fontSize: font.tiny, fontWeight: "800" },
  customer: { color: colors.text, fontSize: font.title, fontWeight: "800", flex: 1 },
  addrRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: spacing.md },
  addr: { color: colors.textMuted, fontSize: font.small, flex: 1, lineHeight: 19 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pay: { flexDirection: "row", alignItems: "center", gap: 4 },
  payText: { color: colors.textMuted, fontSize: font.small },
  fee: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 46,
    marginTop: spacing.md,
  },
  actionText: { color: colors.white, fontSize: font.body, fontWeight: "800" },
});
