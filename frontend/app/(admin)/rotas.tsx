import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/config/api";
import { Card, Button, EmptyState } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";
import { brl } from "@/src/utils/helpers";

type Driver = { id: string; name: string; active: boolean };
type Delivery = { id: string; customer_name: string; address: string; delivery_fee: number; lat?: number | null };

export default function Rotas() {
  const insets = useSafeAreaInsets();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [pending, setPending] = useState<Delivery[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ total_km: number; est_minutes: number; count: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [dv, dl] = await Promise.all([
        api.get("/drivers"),
        api.get("/deliveries?status_filter=aguardando"),
      ]);
      setDrivers(dv);
      setPending(dl);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      setResult(null);
      setSelected({});
      load();
    }, [load])
  );

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  async function onOptimize() {
    if (!driverId) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await api.post("/routes/optimize", {
        driver_id: driverId,
        delivery_ids: selectedIds,
      });
      setResult(r);
      await load();
      setSelected({});
    } catch (e: any) {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Montar rota</Text>
      </View>

      <FlatList
        data={pending}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={styles.label}>1. Escolha o motoboy</Text>
            {drivers.length === 0 ? (
              <Text style={styles.hint}>Cadastre um motoboy primeiro na aba Motoboys.</Text>
            ) : (
              <FlatList
                horizontal
                data={drivers}
                keyExtractor={(d) => d.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.driverRow}
                renderItem={({ item }) => {
                  const active = driverId === item.id;
                  return (
                    <Pressable
                      style={[styles.driverChip, active && styles.driverChipActive]}
                      onPress={() => setDriverId(item.id)}
                      testID={`route-driver-${item.id}`}
                    >
                      <View style={[styles.driverAvatar, active && { backgroundColor: "rgba(255,255,255,0.25)" }]}>
                        <Text style={[styles.driverInitial, active && { color: colors.white }]}>
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.driverChipText, active && { color: colors.white }]} numberOfLines={1}>
                        {item.name.split(" ")[0]}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            )}

            {result ? (
              <Card style={styles.resultCard} testID="route-result">
                <Ionicons name="checkmark-circle" size={26} color={colors.entregue} />
                <View>
                  <Text style={styles.resultTitle}>Rota criada!</Text>
                  <Text style={styles.resultSub}>
                    {result.count} entregas • {result.total_km} km • ~{result.est_minutes} min
                  </Text>
                </View>
              </Card>
            ) : null}

            <Text style={[styles.label, { marginTop: spacing.xl }]}>2. Selecione as entregas</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-done-outline"
            title="Nada aguardando"
            subtitle="Não há entregas aguardando saída para montar uma rota."
            testID="empty-pending"
          />
        }
        renderItem={({ item }) => {
          const on = !!selected[item.id];
          return (
            <Pressable
              style={[styles.pick, on && styles.pickOn]}
              onPress={() => setSelected((s) => ({ ...s, [item.id]: !s[item.id] }))}
              testID={`route-delivery-${item.id}`}
            >
              <View style={[styles.check, on && styles.checkOn]}>
                {on && <Ionicons name="checkmark" size={15} color={colors.white} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickName} numberOfLines={1}>{item.customer_name}</Text>
                <Text style={styles.pickAddr} numberOfLines={1}>{item.address || "Sem endereço"}</Text>
              </View>
              <Text style={styles.pickFee}>{brl(item.delivery_fee)}</Text>
            </Pressable>
          );
        }}
      />

      {selectedIds.length > 0 && driverId ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Button
            title={`Roteirizar ${selectedIds.length} entrega(s)`}
            icon="git-network"
            onPress={onOptimize}
            loading={loading}
            testID="optimize-route-button"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "900" },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 120 },
  label: { color: colors.text, fontSize: font.title, fontWeight: "800", marginBottom: spacing.md },
  hint: { color: colors.textMuted, fontSize: font.body },
  driverRow: { gap: 10, paddingBottom: spacing.sm },
  driverChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    width: 84,
    gap: 6,
  },
  driverChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  driverAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  driverInitial: { color: colors.primary, fontSize: font.title, fontWeight: "900" },
  driverChipText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  resultCard: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: spacing.lg },
  resultTitle: { color: colors.text, fontSize: font.title, fontWeight: "800" },
  resultSub: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pickOn: { borderColor: colors.primary },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickName: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  pickAddr: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  pickFee: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
