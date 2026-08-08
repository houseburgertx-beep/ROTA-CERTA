import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/config/api";
import { useAuth } from "@/src/context/AuthContext";
import { Button, StatusBadge } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";
import { brl, PAYMENT_META, STATUS_META, DeliveryStatus, nextStatus } from "@/src/utils/helpers";

export default function EntregaDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api.get(`/deliveries/${id}`));
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function setStatus(status: DeliveryStatus, problem_note?: string) {
    setBusy(true);
    try {
      const updated = await api.put(`/deliveries/${id}/status`, { status, problem_note });
      setD(updated);
    } catch {}
    setBusy(false);
  }

  async function onDelete() {
    setBusy(true);
    try {
      await api.del(`/deliveries/${id}`);
      router.back();
    } catch {
      setBusy(false);
    }
  }

  function openMaps() {
    if (!d) return;
    const q = d.lat && d.lng ? `${d.lat},${d.lng}` : encodeURIComponent(d.address);
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${q}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    });
    Linking.openURL(url!);
  }

  if (!d) {
    return <View style={styles.container} />;
  }

  const isAdmin = user?.role === "admin";
  const next = nextStatus(d.status);
  const nextLabel = next === "em_rota" ? "Iniciar rota" : next === "entregue" ? "Marcar como entregue" : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="detail-back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Detalhe da entrega</Text>
        {isAdmin ? (
          <Pressable onPress={onDelete} testID="detail-delete">
            <Ionicons name="trash-outline" size={22} color={colors.problema} />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Text style={styles.customer}>{d.customer_name}</Text>
          <StatusBadge status={d.status} testID="detail-status" />
        </View>

        <View style={styles.block}>
          <Row icon="location" label="Endereço" value={d.address || "Não informado"} />
          <Row icon={PAYMENT_META[d.payment_method]?.icon || "cash-outline"} label="Pagamento" value={PAYMENT_META[d.payment_method]?.label || d.payment_method} />
          <Row icon="pricetag" label="Taxa de entrega" value={brl(d.delivery_fee)} />
          <Row icon="receipt" label="Valor do pedido" value={brl(d.order_value)} />
          {d.max_time ? <Row icon="time" label="Horário máximo" value={d.max_time} /> : null}
          {d.notes ? <Row icon="chatbox" label="Observações" value={d.notes} /> : null}
          {d.problem_note ? <Row icon="alert-circle" label="Problema" value={d.problem_note} /> : null}
        </View>

        <Button title="Abrir no mapa / navegar" variant="secondary" icon="navigate" onPress={openMaps} testID="detail-navigate" />

        {next && nextLabel ? (
          <Button
            title={nextLabel}
            icon={next === "em_rota" ? "bicycle" : "checkmark-done"}
            onPress={() => setStatus(next)}
            loading={busy}
            style={{ marginTop: spacing.md }}
            testID="detail-advance-status"
          />
        ) : null}

        {d.status !== "entregue" && d.status !== "problema" ? (
          <Button
            title="Reportar problema"
            variant="ghost"
            icon="alert-circle-outline"
            onPress={() => setStatus("problema", "Problema reportado na entrega")}
            style={{ marginTop: spacing.md }}
            testID="detail-report-problem"
          />
        ) : null}

        {isAdmin ? (
          <Button
            title="Editar entrega"
            variant="ghost"
            icon="create-outline"
            onPress={() => router.push({ pathname: "/review", params: {} })}
            style={{ marginTop: spacing.md }}
            testID="detail-edit"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, value }: any) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.primary} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.text, fontSize: font.title, fontWeight: "800" },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 40 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  customer: { color: colors.text, fontSize: font.h2, fontWeight: "900", flex: 1, marginRight: 8 },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  rowLabel: { color: colors.textDim, fontSize: font.small },
  rowValue: { color: colors.text, fontSize: font.body, fontWeight: "600", marginTop: 2, lineHeight: 20 },
});
